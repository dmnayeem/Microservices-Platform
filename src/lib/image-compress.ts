// Client-side image compression (browser only, no dependency).
//
// Resizes to a max dimension and re-encodes to WebP, searching the quality to
// land under a target byte size while keeping perceptual quality high. Used by
// the Social post composer so any uploaded photo becomes ~50–70 KB.

interface CompressOptions {
  /** Upper byte target — result aims to be at or under this. Default 70 KB. */
  maxBytes?: number;
  /** Longest side (px) the image is scaled down to first. Default 1600. */
  maxDimension?: number;
  /** Don't shrink dimensions below this longest side while chasing size. Default 640. */
  minDimension?: number;
}

const KB = 1024;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
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
  h: number
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, q));
}

/**
 * Compress an image File to roughly `maxBytes` (default 70 KB) as WebP.
 * Returns the original file unchanged for non-raster/animated types (gif, svg),
 * or if anything goes wrong (upload still proceeds with the source).
 */
export async function compressImageToTarget(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const maxBytes = opts.maxBytes ?? 70 * KB;
  const maxDimension = opts.maxDimension ?? 1600;
  const minDimension = opts.minDimension ?? 640;

  if (typeof document === "undefined") return file;
  // Only re-encode still raster images. GIF (often animated) and SVG are left alone.
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;

  try {
    const source = await decode(file);
    const srcW = "width" in source ? source.width : (source as HTMLImageElement).naturalWidth;
    const srcH = "height" in source ? source.height : (source as HTMLImageElement).naturalHeight;
    if (!srcW || !srcH) return file;

    // Prefer WebP; fall back to JPEG if the browser can't encode WebP.
    let outType = "image/webp";
    const scale0 = Math.min(1, maxDimension / Math.max(srcW, srcH));
    let w = srcW * scale0;
    let h = srcH * scale0;

    let best: Blob | null = null;

    // Chase the target: at each dimension, binary-search quality for the largest
    // blob that still fits under maxBytes; if even the floor quality overshoots,
    // shrink the dimensions and try again (protects sharpness vs. crushing quality).
    for (let step = 0; step < 6; step++) {
      const canvas = drawTo(source, w, h);
      if (!canvas) return file;

      // Detect WebP support once.
      if (step === 0) {
        const probe = await toBlob(canvas, "image/webp", 0.8);
        if (!probe || probe.type !== "image/webp") outType = "image/jpeg";
      }

      let lo = 0.4;
      let hi = 0.92;
      let underAtThisSize: Blob | null = null;
      for (let i = 0; i < 7; i++) {
        const q = (lo + hi) / 2;
        const blob = await toBlob(canvas, outType, q);
        if (!blob) break;
        if (blob.size <= maxBytes) {
          underAtThisSize = blob; // good — try to spend the budget on quality
          lo = q;
        } else {
          hi = q;
        }
      }

      if (underAtThisSize) {
        best = underAtThisSize;
        break;
      }
      // Even the lowest quality overshot: record the smallest and shrink.
      const floor = await toBlob(canvas, outType, 0.4);
      if (floor && (!best || floor.size < best.size)) best = floor;
      if (Math.max(w, h) <= minDimension) break;
      w *= 0.85;
      h *= 0.85;
    }

    if (!best || best.size >= file.size) return file; // never upload something bigger
    const ext = outType === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([best], `${base}.${ext}`, { type: outType });
  } catch {
    return file; // any failure → upload the original
  }
}

/**
 * Folder-aware compression preset used across every uploader so targets stay
 * consistent. Display images (avatar/post/marketplace/media) are crushed to
 * ~45 KB WebP; documents that must stay legible for OCR / manual review
 * (KYC IDs, task-proof screenshots) get a much larger budget + higher resolution.
 */
export function compressForUpload(file: File, folder?: string): Promise<File> {
  const legible = folder === "kyc" || folder === "task-proofs";
  return compressImageToTarget(
    file,
    legible
      ? { maxBytes: 220 * KB, maxDimension: 2000, minDimension: 1000 }
      : { maxBytes: 45 * KB, maxDimension: 1400, minDimension: 600 }
  );
}
