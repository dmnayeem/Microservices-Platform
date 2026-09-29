import "server-only";
import { unstable_cache } from "next/cache";
import { ownMediaKey } from "@/lib/media-url";
import { getObjectStream, isS3Configured } from "@/lib/s3";

/**
 * Is the uploaded logo a wordmark (wide) or a square mark? Read from the
 * PNG/WebP header and remembered per URL: per instance in memory, and across
 * instances in the Next data cache (a new logo is a new URL, so a new key).
 * Unknown → treated as square.
 *
 * The root layout awaits this on every page. It used to download the logo
 * from S3 on every cold instance before the first byte could render; now a
 * cold instance waits at most LOOKUP_BUDGET_MS for the shared cache and
 * otherwise renders the square default while the answer is worked out in
 * the background.
 */
const cache = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();
const LOOKUP_BUDGET_MS = 150;

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

async function readShape(src: string): Promise<boolean> {
  // Throws on a failed read, so a transient S3 error is not remembered by the
  // shared cache for a month.
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
  return !!d && d.h > 0 && d.w / d.h > 1.4;
}

const sharedShape = unstable_cache(readShape, ["brand-logo-shape-v1"], {
  revalidate: 30 * 86_400,
});

export async function isWideLogo(src: string | null): Promise<boolean> {
  if (!src) return false;
  if (cache.has(src)) return cache.get(src)!;
  let job = pending.get(src);
  if (!job) {
    job = sharedShape(src)
      .catch(() => false)
      .then((wide) => {
        cache.set(src, wide);
        pending.delete(src);
        return wide;
      });
    pending.set(src, job);
  }
  // Never hold the page on S3: a shared-cache hit answers well inside the
  // budget; a miss renders the default and the job fills the memo.
  return Promise.race([
    job,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), LOOKUP_BUDGET_MS)),
  ]);
}
