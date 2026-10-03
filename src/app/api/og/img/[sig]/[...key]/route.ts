import { getObjectBytes, isS3Configured } from "@/lib/s3";
import { isServableKey, ogVerify } from "@/lib/seo/og-image";
import { jpegResponse, memGet, memSet, toOgJpeg } from "@/lib/seo/og-render";

/**
 * A stored image (a listing / course / article cover, a post photo, the
 * owner's share banner) as a 1200×630 JPEG under ~290 KB — what Facebook,
 * WhatsApp, X, LinkedIn, Telegram, Pinterest and Discord can all show.
 *
 * The URL carries an HMAC of the key, minted only by public-page metadata
 * (lib/seo/og-image.ts), so this cannot be used to resize arbitrary objects.
 * It reads only from our own bucket by key — never a URL — and only from the
 * public image prefixes. Public in middleware (`/api/og/`), no session.
 */

export const runtime = "nodejs";

/** Bigger originals are not worth decoding for a thumbnail. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ sig: string; key: string[] }> }) {
  const { sig, key: segments } = await params;
  // The URL is the key plus ".jpg" (lib/seo/og-image.ts).
  const key = (segments ?? [])
    .map((s) => decodeURIComponent(s))
    .join("/")
    .replace(/\.jpg$/, "");
  if (!isServableKey(key) || !ogVerify(key, sig)) return new Response("not found", { status: 404 });

  const hit = memGet(`img:${key}`);
  if (hit) return jpegResponse(hit, true);

  if (!isS3Configured()) return new Response("storage unavailable", { status: 503 });
  try {
    const { bytes, totalSize, contentType } = await getObjectBytes(key);
    if (!contentType.startsWith("image/") || totalSize > MAX_SOURCE_BYTES) {
      return new Response("not found", { status: 404 });
    }
    const jpeg = await toOgJpeg(bytes);
    if (!jpeg) return new Response("not found", { status: 404 });
    memSet(`img:${key}`, jpeg);
    return jpegResponse(jpeg, false);
  } catch {
    // Missing / unreadable → 404 without saying which.
    return new Response("not found", { status: 404 });
  }
}
