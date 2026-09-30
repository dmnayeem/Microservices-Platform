import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BROWSER_UA, cappedStream, guardUrl, safeFetch } from "@/lib/safe-fetch";
import { safeServeHeaders } from "@/lib/upload-safety";
import { AD_MEDIA_COLUMN, type AdMediaField } from "@/lib/ad-proxy";
import { ownMediaKey } from "@/lib/media-url";
import { getObjectStream } from "@/lib/s3";

export const runtime = "nodejs";

/**
 * First-party ad-creative proxy. The browser requests this same-origin,
 * innocuously-named path; we look up the ad, fetch its stored creative
 * server-side, and stream the bytes back. Ad-blockers see an ordinary
 * first-party request, so the creative can't be host-blocked.
 *
 * Safe by construction: the URL is never taken from the client — only a creative
 * URL already stored on an `Ad` row is proxied. We still run it through the
 * shared outbound fetcher (`safe-fetch.ts`: SSRF guard re-checked on every
 * redirect hop, size cap) so a malicious advertiser-supplied URL can't reach
 * internal hosts. No outbound rate limit here: each creative is fetched once
 * per CDN cache fill, and a limit would blank ads at peak traffic.
 */

const TIMEOUT_MS = 15_000;

/** Creative size ceilings — far above any real creative, low enough to stop a stream of junk. */
const MAX_BYTES: Record<AdMediaField, number> = {
  img: 50 * 1024 * 1024,
  logo: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};

const FIELD_FALLBACK_TYPE: Record<AdMediaField, string> = {
  img: "image/jpeg",
  logo: "image/png",
  video: "video/mp4",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const fieldParam = (new URL(request.url).searchParams.get("f") ??
    "img") as AdMediaField;
  const column = AD_MEDIA_COLUMN[fieldParam];
  if (!column) {
    return NextResponse.json({ error: "bad field" }, { status: 400 });
  }

  const ad = await prisma.ad
    .findUnique({
      where: { id },
      select: { contentUrl: true, videoUrl: true, brandLogo: true },
    })
    .catch(() => null);

  const stored = ad?.[column];
  if (!stored) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Our own creatives live in a PRIVATE S3 bucket (public CloudFront/S3 URLs
  // 403), so HTTP-fetching the stored URL fails. Read the object with server
  // IAM creds instead and stream it. External creatives (network ads hosted
  // elsewhere) still go through the SSRF-guarded fetch below.
  const key = ownMediaKey(stored);
  if (key) {
    try {
      const { body, contentType } = await getObjectStream(key);
      if (body) {
        const webStream = (
          body as { transformToWebStream: () => ReadableStream }
        ).transformToWebStream();
        return new NextResponse(webStream, {
          status: 200,
          headers: {
            ...creativeHeaders(contentType, fieldParam, key),
            "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
          },
        });
      }
    } catch {
      return NextResponse.json({ error: "unavailable" }, { status: 404 });
    }
  }

  let target: URL;
  try {
    target = await guardUrl(stored);
  } catch {
    // Stored URL is malformed or points somewhere disallowed → don't proxy.
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  try {
    const { response: upstream } = await safeFetch(target, {
      timeoutMs: TIMEOUT_MS,
      rateLimit: false,
      userAgent: BROWSER_UA,
      headers: { Accept: "image/*,video/*,*/*;q=0.8" },
      purpose: "ad_creative",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    return new NextResponse(cappedStream(upstream.body, MAX_BYTES[fieldParam]), {
      status: 200,
      headers: {
        ...creativeHeaders(upstream.headers.get("content-type"), fieldParam, target.pathname),
        // Creatives are immutable per ad — cache hard so the proxy hop is paid
        // once (put a CDN in front of the origin to scale this further).
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}

/**
 * Headers for a proxied creative. Served from OUR origin, so the advertiser's
 * Content-Type must never be passed through as-is: an "image" URL answering
 * with text/html would otherwise run as a page on revtype.com. Images, video
 * and audio stay inline; anything else downloads, sandboxed (safeServeHeaders).
 * Many hosts send real images as octet-stream — those take the field's type.
 */
function creativeHeaders(
  upstreamType: string | null | undefined,
  field: keyof typeof FIELD_FALLBACK_TYPE,
  key: string
): Record<string, string> {
  const ct = (upstreamType ?? "").toLowerCase().split(";")[0].trim();
  const unknown = !ct || ct === "application/octet-stream" || ct === "binary/octet-stream";
  return safeServeHeaders(unknown ? FIELD_FALLBACK_TYPE[field] : ct, key);
}
