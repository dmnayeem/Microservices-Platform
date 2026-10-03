/**
 * The ONE image-size policy for every image uploaded for DISPLAY.
 *
 * Shared by the browser compressor (src/lib/image-compress.ts) and the server
 * backstop (src/lib/image-compress-server.ts) so the two can never drift.
 * No DOM and no sharp in here — plain data + pure helpers only.
 *
 *  - Display images end up ≤ 100 KB as WebP (JPEG only where a browser cannot
 *    encode WebP; the server then re-encodes it), EXIF stripped, orientation
 *    applied, long edge capped by purpose.
 *  - Quality search 0.85 → 0.60; if the floor still overshoots, shrink 10% at a
 *    time down to the purpose's minimum edge; only then go below the quality
 *    floor; only after that below the minimum edge (the 100 KB cap always wins).
 *  - ORIGINAL purposes ("deliverable" = the product a marketplace buyer
 *    downloads, "document" = receipts / attachments / KYC / assignment files)
 *    are never touched: byte-for-byte.
 *  - SVG is never re-encoded. Animated GIFs stay animated: kept as-is up to
 *    1 MB; above that the server converts them to animated WebP (frames kept).
 */

export const KB = 1024;

/** Hard target for every stored display image. */
export const DISPLAY_MAX_BYTES = 100 * KB;

/** Animated GIFs are kept byte-for-byte up to this size. */
export const ANIMATED_GIF_MAX_BYTES = 1024 * KB;

export const QUALITY_START = 0.85;
export const QUALITY_FLOOR = 0.6;
/** Only reached once the image is already at its purpose's minimum edge. */
export const QUALITY_LAST_RESORT = 0.4;
/** Each dimension step keeps 90% of the long edge. */
export const DIMENSION_STEP = 0.9;

export type DisplayPurpose =
  | "avatar"
  | "thumbnail"
  | "cover"
  | "post"
  | "proof"
  | "media";

export type OriginalPurpose = "deliverable" | "document";

export type ImagePurpose = DisplayPurpose | OriginalPurpose;

/** Long-edge cap (px) per display purpose. */
export const PURPOSE_MAX_EDGE: Record<DisplayPurpose, number> = {
  avatar: 512,
  thumbnail: 1080,
  cover: 1600,
  post: 1600,
  // Screenshots must stay legible — never below 1200 unless 100 KB forces it.
  proof: 1600,
  media: 1600,
};

/** Don't shrink below this long edge while chasing size (quality drops first). */
export const PURPOSE_MIN_EDGE: Record<DisplayPurpose, number> = {
  avatar: 320,
  thumbnail: 720,
  cover: 1000,
  post: 1000,
  proof: 1200,
  media: 1000,
};

const ALL_PURPOSES: readonly ImagePurpose[] = [
  "avatar",
  "thumbnail",
  "cover",
  "post",
  "proof",
  "media",
  "deliverable",
  "document",
];

export function isOriginalPurpose(p: ImagePurpose): p is OriginalPurpose {
  return p === "deliverable" || p === "document";
}

/**
 * Default purpose for an upload folder when the caller didn't name one.
 *
 * `marketplace` defaults to ORIGINAL on purpose: that folder holds both the
 * product a buyer pays for and its gallery images, and destroying a sold file
 * is far worse than storing one large gallery image. Our own gallery/screenshot
 * uploaders always send an explicit display purpose.
 */
export function purposeForFolder(folder: string | null | undefined): ImagePurpose {
  switch ((folder ?? "").trim()) {
    case "avatars":
      return "avatar";
    case "posts":
      return "post";
    case "task-proofs":
    case "disputes":
      return "proof";
    case "ads":
    case "courses":
      return "cover";
    case "marketplace":
      return "deliverable";
    case "kyc":
    case "assignment-submissions":
    case "tutor-applications":
      return "document";
    default:
      return "media";
  }
}

/** Explicit `purpose` wins when valid; otherwise fall back to the folder. */
export function resolvePurpose(
  raw: unknown,
  folder?: string | null
): ImagePurpose {
  if (typeof raw === "string" && (ALL_PURPOSES as readonly string[]).includes(raw)) {
    return raw as ImagePurpose;
  }
  return purposeForFolder(folder);
}

/** Still raster formats both sides can re-encode. GIF is decided separately. */
export function isReencodableImageType(mime: string): boolean {
  return /^image\/(jpeg|jpg|pjpeg|png|webp|avif|tiff)$/i.test(mime);
}

/**
 * True when GIF bytes hold more than one frame (counts Graphic Control
 * Extension blocks `21 F9 04`; one per frame in practice). Works on a prefix.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false; // "GIF"
  let frames = 0;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      if (++frames > 1) return true;
    }
  }
  return false;
}

/** Scale (≤1) that fits the long edge under `maxEdge`. */
export function fitScale(width: number, height: number, maxEdge: number): number {
  const long = Math.max(width, height);
  return long > maxEdge ? maxEdge / long : 1;
}

/** `photo.JPG` → `photo.webp`. */
export function renameExt(name: string, ext: string): string {
  const base = (name || "image").replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.${ext}`;
}
