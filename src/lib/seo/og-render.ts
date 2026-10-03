import "server-only";
import { OG_HEIGHT, OG_MAX_BYTES, OG_WIDTH } from "@/lib/seo/og-image";

/**
 * Encoding + caching for the share-image endpoints (/api/og/*).
 *
 * Every response is a 1200×630 JPEG under OG_MAX_BYTES. The bytes for a URL
 * never change (the URL carries the signed input), so the CDN may keep them
 * for a year; the small in-process cache only makes a warm instance answer a
 * repeat crawler without re-rendering.
 */

export const OG_CACHE_HEADERS = {
  // Crawlers re-fetch rarely, and the content behind a URL is fixed.
  "Cache-Control": "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
} as const;

type Sharp = (typeof import("sharp"))["default"];
let sharpMod: Promise<Sharp | null> | null = null;
/** sharp ships with Next (it powers next/image); loaded lazily, never fatal. */
export function loadSharp(): Promise<Sharp | null> {
  sharpMod ??= import("sharp")
    .then((m) => (m.default ?? (m as unknown as Sharp)))
    .catch(() => null);
  return sharpMod;
}

/**
 * Any image → 1200×630 cover-cropped JPEG, stepping quality down until it fits
 * the size budget. Null when sharp is unavailable or the input is not an image.
 */
export async function toOgJpeg(input: Buffer | Uint8Array, fit: "cover" | "fill" = "cover"): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const base = sharp(input, { failOn: "none", limitInputPixels: 80_000_000 })
      .rotate()
      .resize(OG_WIDTH, OG_HEIGHT, { fit, position: "attention" })
      .flatten({ background: "#0b1f19" });
    for (const quality of [82, 72, 60, 48]) {
      const out = await base.clone().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
      if (out.length <= OG_MAX_BYTES) return out;
    }
    return null;
  } catch {
    return null;
  }
}

const MAX_ENTRIES = 48;
const mem = new Map<string, Buffer>();
export function memGet(key: string): Buffer | undefined {
  const v = mem.get(key);
  if (v) {
    mem.delete(key);
    mem.set(key, v);
  }
  return v;
}
export function memSet(key: string, v: Buffer): void {
  mem.set(key, v);
  while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value as string);
}

export function jpegResponse(bytes: Buffer, cacheHit: boolean): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...OG_CACHE_HEADERS,
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "X-OG-Cache": cacheHit ? "hit" : "miss",
    },
  });
}
