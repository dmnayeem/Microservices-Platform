/**
 * Server backstop for the display-image policy (src/lib/image-policy.ts).
 *
 * The browser compresses first; this runs on the direct-upload routes right
 * before the bytes go to S3, so a client that skipped (or failed) compression
 * still ends up with a ≤ 100 KB WebP. A file the browser already compressed is
 * stored untouched (no second lossy pass) unless it still carries EXIF.
 *
 * Runs AFTER upload-safety inspection — it never replaces those checks.
 * ORIGINAL purposes (marketplace deliverables, documents) are returned as-is.
 * If sharp cannot load, the original is stored (an upload is never lost).
 */
import "server-only";
import type { Sharp } from "sharp";
import {
  ANIMATED_GIF_MAX_BYTES,
  DIMENSION_STEP,
  DISPLAY_MAX_BYTES,
  PURPOSE_MAX_EDGE,
  PURPOSE_MIN_EDGE,
  QUALITY_FLOOR,
  QUALITY_LAST_RESORT,
  QUALITY_START,
  fitScale,
  isOriginalPurpose,
  isReencodableImageType,
  renameExt,
  type DisplayPurpose,
  type ImagePurpose,
} from "@/lib/image-policy";

export interface EnforcedImage {
  buffer: Buffer;
  mime: string;
  fileName: string;
  /** True when the stored bytes differ from the uploaded bytes. */
  changed: boolean;
  width?: number;
  height?: number;
  /** Why it was left alone / what happened — for logs and the verify script. */
  note: string;
}

type SharpFn = (typeof import("sharp"))["default"];
let sharpPromise: Promise<SharpFn | null> | null = null;
function loadSharp(): Promise<SharpFn | null> {
  sharpPromise ??= import("sharp")
    .then((m) => ((m as unknown as { default?: SharpFn }).default ?? (m as unknown as SharpFn)))
    .catch((err) => {
      console.error("[image-policy] sharp unavailable — storing originals:", err);
      return null;
    });
  return sharpPromise;
}

const keep = (buffer: Buffer, mime: string, fileName: string, note: string): EnforcedImage => ({
  buffer,
  mime,
  fileName,
  changed: false,
  note,
});

/** Quality search between `hi` and `lo` (0–1) for the largest encode ≤ cap. */
async function searchQuality(
  make: (q: number) => Sharp,
  lo: number,
  hi: number
): Promise<{ fit: Buffer | null; smallest: Buffer }> {
  const top = await make(hi).toBuffer();
  if (top.length <= DISPLAY_MAX_BYTES) return { fit: top, smallest: top };
  const bottom = await make(lo).toBuffer();
  if (bottom.length > DISPLAY_MAX_BYTES) return { fit: null, smallest: bottom };
  let fit = bottom;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 4; i++) {
    const q = (a + b) / 2;
    const out = await make(q).toBuffer();
    if (out.length <= DISPLAY_MAX_BYTES) {
      fit = out;
      a = q;
    } else {
      b = q;
    }
  }
  return { fit, smallest: bottom };
}

/**
 * Encode a still image to WebP ≤ 100 KB following the shared policy.
 * Exported for scripts/verify-image-policy.ts.
 */
export async function compressStillToWebp(
  sharp: SharpFn,
  input: Buffer,
  purpose: DisplayPurpose
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // .rotate() with no args applies EXIF orientation; decode once to raw pixels
  // (no intermediate lossy pass) — output carries no metadata.
  const src = await sharp(input, { failOn: "none" }).rotate().raw().toBuffer({ resolveWithObject: true });
  const srcW = src.info.width;
  const srcH = src.info.height;
  const raw = { width: srcW, height: srcH, channels: src.info.channels };
  const maxEdge = PURPOSE_MAX_EDGE[purpose];
  const minEdge = PURPOSE_MIN_EDGE[purpose];

  let scale = fitScale(srcW, srcH, maxEdge);
  let last: { buffer: Buffer; width: number; height: number } | null = null;
  // Screenshots / logos / flat graphics are far smaller AND sharper as
  // lossless WebP (text stays crisp). Photos are not — after one lossless try
  // that lands way over budget, stop trying.
  let tryLossless = true;

  const at = async (s: number) => {
    const w = Math.max(1, Math.round(srcW * s));
    const h = Math.max(1, Math.round(srcH * s));
    const pixels =
      w === srcW && h === srcH
        ? src.data
        : await sharp(src.data, { raw }).resize(w, h, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
    const base = () => sharp(pixels, { raw: { width: w, height: h, channels: raw.channels } });
    const make = (q: number) =>
      base().webp({ quality: Math.round(q * 100), alphaQuality: 90, smartSubsample: true, effort: 4 });
    const lossless = async () => {
      if (!tryLossless) return null;
      const out = await base().webp({ lossless: true, effort: 4 }).toBuffer();
      if (out.length <= DISPLAY_MAX_BYTES) return out;
      if (out.length > DISPLAY_MAX_BYTES * 4) tryLossless = false;
      return null;
    };
    return { w, h, make, lossless };
  };

  // 1) quality 0.85 → 0.60 (or lossless, when that fits), shrinking 10% per
  //    step down to the minimum edge.
  for (let guard = 0; guard < 30; guard++) {
    const { w, h, make, lossless } = await at(scale);
    const ll = await lossless();
    if (ll) return { buffer: ll, width: w, height: h };
    const { fit, smallest } = await searchQuality(make, QUALITY_FLOOR, QUALITY_START);
    if (fit) return { buffer: fit, width: w, height: h };
    last = { buffer: smallest, width: w, height: h };
    const next = scale * DIMENSION_STEP;
    if (Math.max(srcW, srcH) * next < minEdge) break;
    scale = next;
  }
  // 2) at the minimum edge, allow quality below the floor.
  {
    const { w, h, make } = await at(scale);
    const { fit, smallest } = await searchQuality(make, QUALITY_LAST_RESORT, QUALITY_FLOOR);
    if (fit) return { buffer: fit, width: w, height: h };
    last = { buffer: smallest, width: w, height: h };
  }
  // 3) the 100 KB cap always wins: keep shrinking at the last-resort quality.
  for (let guard = 0; guard < 30; guard++) {
    scale *= DIMENSION_STEP;
    const { w, h, make } = await at(scale);
    const out = await make(QUALITY_LAST_RESORT).toBuffer();
    last = { buffer: out, width: w, height: h };
    if (out.length <= DISPLAY_MAX_BYTES || Math.max(w, h) <= 64) break;
  }
  return last!;
}

/**
 * Apply the display policy to an uploaded image. Non-images, SVG and ORIGINAL
 * purposes come back unchanged.
 */
export async function enforceDisplayImage(
  buffer: Buffer,
  mime: string,
  fileName: string,
  purpose: ImagePurpose
): Promise<EnforcedImage> {
  if (isOriginalPurpose(purpose)) return keep(buffer, mime, fileName, `original (${purpose})`);
  const type = (mime || "").toLowerCase();
  if (!type.startsWith("image/")) return keep(buffer, mime, fileName, "not an image");
  if (type.includes("svg")) return keep(buffer, mime, fileName, "svg kept");
  const isGif = type === "image/gif";
  if (!isGif && !isReencodableImageType(type)) return keep(buffer, mime, fileName, "type not re-encodable");

  const sharp = await loadSharp();
  if (!sharp) return keep(buffer, mime, fileName, "sharp unavailable");

  try {
    const meta = await sharp(buffer, { failOn: "none", animated: isGif }).metadata();
    const w = meta.width ?? 0;
    const h = meta.pageHeight ?? meta.height ?? 0;

    if (isGif && (meta.pages ?? 1) > 1) {
      // Animated: never drop frames.
      if (buffer.length <= ANIMATED_GIF_MAX_BYTES) {
        return keep(buffer, mime, fileName, "animated gif kept");
      }
      const s = fitScale(w, h, PURPOSE_MAX_EDGE[purpose as DisplayPurpose]);
      const out = await sharp(buffer, { animated: true, failOn: "none" })
        .resize(s < 1 ? { width: Math.round(w * s) } : undefined)
        .webp({ quality: 70, effort: 4 })
        .toBuffer();
      if (out.length >= buffer.length) return keep(buffer, mime, fileName, "animated gif kept (webp not smaller)");
      return {
        buffer: out,
        mime: "image/webp",
        fileName: renameExt(fileName, "webp"),
        changed: true,
        note: "animated gif → animated webp",
      };
    }

    const display = purpose as DisplayPurpose;
    const alreadyFine =
      buffer.length <= DISPLAY_MAX_BYTES &&
      Math.max(w, h) <= PURPOSE_MAX_EDGE[display] &&
      !meta.exif &&
      (meta.orientation ?? 1) === 1 &&
      (type === "image/webp" || type === "image/jpeg" || type === "image/png");
    if (alreadyFine) return keep(buffer, mime, fileName, "already within policy");

    const out = await compressStillToWebp(sharp, buffer, display);
    return {
      buffer: out.buffer,
      mime: "image/webp",
      fileName: renameExt(fileName, "webp"),
      changed: true,
      width: out.width,
      height: out.height,
      note: "re-encoded",
    };
  } catch (err) {
    console.error("[image-policy] could not process image — storing original:", err);
    return keep(buffer, mime, fileName, "decode failed");
  }
}
