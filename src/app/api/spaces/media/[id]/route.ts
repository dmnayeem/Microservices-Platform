import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertPublicUrl } from "@/lib/link-preview";
import { AD_MEDIA_COLUMN, type AdMediaField } from "@/lib/ad-proxy";

/**
 * First-party ad-creative proxy. The browser requests this same-origin,
 * innocuously-named path; we look up the ad, fetch its stored creative
 * server-side, and stream the bytes back. Ad-blockers see an ordinary
 * first-party request, so the creative can't be host-blocked.
 *
 * Safe by construction: the URL is never taken from the client — only a creative
 * URL already stored on an `Ad` row is proxied. We still run it through the
 * shared SSRF guard (`assertPublicUrl`, re-checked on every redirect hop) so a
 * malicious advertiser-supplied URL can't reach internal hosts.
 */

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FIELD_FALLBACK_TYPE: Record<AdMediaField, string> = {
  img: "image/jpeg",
  logo: "image/png",
  video: "video/mp4",
};

/** Guarded fetch that re-validates every redirect hop, then returns the final
 *  Response for streaming. Keeps the SSRF guard across redirects. */
async function fetchGuarded(start: URL, signal: AbortSignal): Promise<Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) await assertPublicUrl(current.toString());
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": BROWSER_UA, Accept: "image/*,video/*,*/*;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new Error("Bad redirect target");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new Error("Bad redirect scheme");
      }
      current = next;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

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

  let target: URL;
  try {
    target = await assertPublicUrl(stored);
  } catch {
    // Stored URL is malformed or points somewhere disallowed → don't proxy.
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  try {
    const upstream = await fetchGuarded(target, AbortSignal.timeout(TIMEOUT_MS));
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    const contentType =
      upstream.headers.get("content-type") ?? FIELD_FALLBACK_TYPE[fieldParam];
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Creatives are immutable per ad — cache hard so the proxy hop is paid
        // once (put a CDN in front of the origin to scale this further).
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
