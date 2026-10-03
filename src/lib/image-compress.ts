// Client-side image compression (browser only, no dependency).
//
// Follows the shared display policy in src/lib/image-policy.ts: every display
// image becomes a ≤ 100 KB WebP (JPEG where the browser can't encode WebP),
// long edge capped by purpose, EXIF dropped (canvas re-encode) with orientation
// applied (createImageBitmap / <img> honour EXIF orientation). The server
// re-checks on the direct-upload routes (src/lib/image-compress-server.ts).
//
// ORIGINAL purposes ("deliverable", "document") are returned untouched — a
// marketplace product file must reach S3 byte-for-byte.

import {
  DIMENSION_STEP,
  DISPLAY_MAX_BYTES,
  PURPOSE_MAX_EDGE,
  PURPOSE_MIN_EDGE,
  QUALITY_FLOOR,
  QUALITY_LAST_RESORT,
  QUALITY_START,
  fitScale,
  isOriginalPurpose,
  resolvePurpose,
  renameExt,
  type DisplayPurpose,
  type ImagePurpose,
} from "@/lib/image-policy";

interface CompressOptions {
  /** Upper byte target. Default 100 KB. */
  maxBytes?: number;
  /** Longest side (px) the image is scaled down to first. Default 1600. */
  maxDimension?: number;
  /** Quality drops below the floor before the long side goes under this. Default 1000. */
  minDimension?: number;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawTo(
  source: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
  opaque: boolean
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (opaque) {
    // JPEG has no alpha: paint white so transparent areas don't turn black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, q));
}

let webpSupport: boolean | null = null;
async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const b = await toBlob(c, "image/webp", 0.8);
  webpSupport = !!b && b.type === "image/webp";
  return webpSupport;
}

/** Largest-quality encode ≤ maxBytes between lo..hi, or null + the smallest seen. */
async function searchQuality(
  canvas: HTMLCanvasElement,
  type: string,
  lo: number,
  hi: number,
  maxBytes: number
): Promise<{ fit: Blob | null; smallest: Blob | null }> {
  const top = await toBlob(canvas, type, hi);
  if (top && top.size <= maxBytes) return { fit: top, smallest: top };
  const bottom = await toBlob(canvas, type, lo);
  if (!bottom || bottom.size > maxBytes) return { fit: null, smallest: bottom };
  let fit = bottom;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 4; i++) {
    const q = (a + b) / 2;
    const blob = await toBlob(canvas, type, q);
    if (!blob) break;
    if (blob.size <= maxBytes) {
      fit = blob;
      a = q;
    } else {
      b = q;
    }
  }
  return { fit, smallest: bottom };
}

/**
 * Compress an image File to ≤ `maxBytes` (default 100 KB) as WebP.
 * GIF and SVG are returned unchanged (animation / vectors are the server's and
 * the admin's call), as is anything that fails to decode.
 */
export async function compressImageToTarget(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const maxBytes = opts.maxBytes ?? DISPLAY_MAX_BYTES;
  const maxDimension = opts.maxDimension ?? 1600;
  const minDimension = opts.minDimension ?? 1000;

  if (typeof document === "undefined") return file;
  // Only re-encode still raster images. GIF (often animated) and SVG are left alone.
  if (!/^image\/(jpeg|jpg|png|webp|avif)$/i.test(file.type)) return file;

  try {
    const source = await decode(file);
    const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
    const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!srcW || !srcH) return file;

    // Already small enough and within the cap → keep (server strips EXIF if any).
    if (file.size <= maxBytes && Math.max(srcW, srcH) <= maxDimension) return file;

    const webp = await canEncodeWebp();
    const outType = webp ? "image/webp" : "image/jpeg";
    let scale = fitScale(srcW, srcH, maxDimension);
    let best: Blob | null = null;

    const canvasAt = (s: number) => drawTo(source, srcW * s, srcH * s, !webp);
    // Screenshots / flat graphics: Chromium encodes WebP at quality 1.0 as
    // lossless, which is both smaller and sharper for text. A photo blows far
    // past the budget on the first try, and we stop trying.
    let tryLossless = webp;

    // 1) quality 0.85 → 0.60, shrinking 10% per step down to the minimum edge.
    for (let step = 0; step < 30; step++) {
      const canvas = canvasAt(scale);
      if (!canvas) return file;
      if (tryLossless) {
        const ll = await toBlob(canvas, "image/webp", 1);
        if (ll && ll.size <= maxBytes) {
          best = ll;
          break;
        }
        if (!ll || ll.size > maxBytes * 4) tryLossless = false;
      }
      const { fit, smallest } = await searchQuality(canvas, outType, QUALITY_FLOOR, QUALITY_START, maxBytes);
      if (fit) {
        best = fit;
        break;
      }
      if (smallest && (!best || smallest.size < best.size)) best = smallest;
      const next = scale * DIMENSION_STEP;
      if (Math.max(srcW, srcH) * next < minDimension) break;
      scale = next;
    }
    // 2) at the minimum edge, allow quality below the floor; 3) then shrink more.
    if (!best || best.size > maxBytes) {
      for (let step = 0; step < 30; step++) {
        const canvas = canvasAt(scale);
        if (!canvas) break;
        const { fit, smallest } = await searchQuality(
          canvas,
          outType,
          QUALITY_LAST_RESORT,
          step === 0 ? QUALITY_FLOOR : QUALITY_LAST_RESORT,
          maxBytes
        );
        const got = fit ?? smallest;
        if (got && (!best || got.size < best.size || fit)) best = got;
        if (fit || Math.max(srcW, srcH) * scale <= 64) break;
        scale *= DIMENSION_STEP;
      }
    }

    if (!best) return file;
    return new File([best], renameExt(file.name, webp ? "webp" : "jpg"), { type: outType });
  } catch {
    return file; // any failure → upload the original (the server backstop still applies)
  }
}

/** Compress per display purpose. ORIGINAL purposes return the file untouched. */
export function compressForPurpose(file: File, purpose: ImagePurpose): Promise<File> {
  if (isOriginalPurpose(purpose)) return Promise.resolve(file);
  const p: DisplayPurpose = purpose;
  return compressImageToTarget(file, {
    maxBytes: DISPLAY_MAX_BYTES,
    maxDimension: PURPOSE_MAX_EDGE[p],
    minDimension: PURPOSE_MIN_EDGE[p],
  });
}

/**
 * Folder-aware preset (kept for existing callers): the folder maps to a
 * purpose through the shared policy, e.g. "avatars" → avatar (512 px),
 * "task-proofs" → proof (1600 px, ≥ 1200 px kept), "posts" → post.
 */
export function compressForUpload(file: File, folderOrPurpose?: string): Promise<File> {
  return compressForPurpose(file, resolvePurpose(folderOrPurpose, folderOrPurpose));
}
