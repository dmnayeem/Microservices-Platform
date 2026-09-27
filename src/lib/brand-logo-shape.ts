import "server-only";
import { ownMediaKey } from "@/lib/media-url";
import { getObjectStream, isS3Configured } from "@/lib/s3";

/**
 * Is the uploaded logo a wordmark (wide) or a square mark? Read once per
 * server instance from the PNG/WebP header and remembered per URL, so the
 * layout pays for it once, not per request. Unknown → treated as square.
 */
const cache = new Map<string, boolean>();

function dims(b: Uint8Array): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: IHDR width/height at 16/20.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
  // WebP VP8X: canvas size (24-bit, minus one) at 24/27.
  if (b.length > 30 && b[8] === 0x57 && b[12] === 0x56 && b[15] === 0x58) {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { w, h };
  }
  return null;
}

export async function isWideLogo(src: string | null): Promise<boolean> {
  if (!src) return false;
  if (cache.has(src)) return cache.get(src)!;
  let wide = false;
  try {
    const key = src.startsWith("/api/media/") ? decodeURIComponent(src.slice("/api/media/".length)) : ownMediaKey(src);
    let bytes: Uint8Array | null = null;
    if (key && isS3Configured()) {
      const { body } = await getObjectStream(key);
      if (body) bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    } else if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src, { signal: AbortSignal.timeout(5000) });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    }
    const d = bytes ? dims(bytes) : null;
    wide = !!d && d.h > 0 && d.w / d.h > 1.4;
  } catch {
    wide = false;
  }
  cache.set(src, wide);
  return wide;
}
