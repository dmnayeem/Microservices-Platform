import { createHash } from "crypto";
import { perceptualHash } from "@/lib/phash";

/**
 * Server-side "micro-data" extraction for uploaded marketplace stock media.
 *
 * The point is NOT to prove a file is stolen — that's impossible — but to
 * surface strong signals so a human admin can judge whether a stock photo/video/
 * track is an original capture vs a downloaded / re-encoded / edited file:
 *   • images  → EXIF (camera make/model/lens/date, editor software), dimensions,
 *               perceptual hash (for duplicate detection across listings)
 *   • audio   → container/codec/duration/bitrate/encoder + ID3 tags
 *   • video   → container/codec/duration/encoder (pure-JS container read only;
 *               deep frame analysis needs ffmpeg and is intentionally out of scope)
 * Plus a sha256 of the exact bytes and heuristic `hints` for the admin UI.
 *
 * All parsers are pure-JS (jimp / exifr / music-metadata) and loaded lazily.
 * Best-effort: any parser failure degrades gracefully — sha256 + size always set.
 */

export type MediaKind = "image" | "audio" | "video" | "document" | "file";

export interface MediaImageMeta {
  width?: number;
  height?: number;
  hasExif: boolean;
  exif?: {
    make?: string;
    model?: string;
    lens?: string;
    software?: string;
    dateTaken?: string;
    orientation?: number;
  };
  pHash?: string | null;
}

export interface MediaAudioMeta {
  container?: string;
  codec?: string;
  durationSec?: number;
  bitrate?: number;
  sampleRate?: number;
  encoder?: string;
  title?: string;
  artist?: string;
}

export interface MediaVideoMeta {
  container?: string;
  durationSec?: number;
  codec?: string;
  encoder?: string;
}

export interface MediaDocumentMeta {
  format?: string; // "PDF" | "EPUB" | "MOBI" | …
  producer?: string;
  creator?: string;
  createdDate?: string;
  pageCount?: number;
}

export interface MediaHints {
  /** Image carries camera EXIF (make/model) — a strong "original capture" signal. */
  hasCameraExif: boolean;
  /** EXIF/XMP software tag names an editor (Photoshop, Lightroom, Canva…). */
  hasEditorSoftwareTag: boolean;
  /** Audio/video encoder looks like a re-encode tool (ffmpeg/Lavf/HandBrake…). */
  reEncoded: boolean;
  /** Listing id whose deliverable is a perceptual near-duplicate (images). */
  duplicateOf?: string | null;
  /** Free-text note for the admin (e.g. "no camera EXIF"). */
  note?: string;
}

export interface MediaMeta {
  sizeBytes: number;
  sha256: string;
  kind: MediaKind;
  image?: MediaImageMeta;
  audio?: MediaAudioMeta;
  video?: MediaVideoMeta;
  document?: MediaDocumentMeta;
  hints: MediaHints;
}

const EDITOR_SOFTWARE =
  /photoshop|lightroom|gimp|affinity|capture one|pixelmator|canva|figma|illustrator|snapseed|paint\.net/i;
const REENCODE_ENCODER = /lavf|ffmpeg|handbrake|x264|x265|libav|libx26|gstreamer/i;
// PDF producer/creator names that indicate a conversion/export (vs a "born"
// publisher PDF) — a hint the ebook may be re-exported/edited, for the admin.
const DOC_CONVERTER =
  /calibre|microsoft.?word|libreoffice|openoffice|acrobat distiller|ghostscript|wkhtmltopdf|pandoc|google docs|pages|writer|scribus|itext|reportlab/i;

/** Extract micro-data from raw bytes. Never throws. */
export async function extractMediaMetadata(
  bytes: Buffer,
  mimeType: string,
  kind: MediaKind
): Promise<MediaMeta> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const meta: MediaMeta = {
    sizeBytes: bytes.length,
    sha256,
    kind,
    hints: { hasCameraExif: false, hasEditorSoftwareTag: false, reEncoded: false },
  };

  try {
    if (kind === "image") {
      // Dimensions via jimp (best-effort).
      let width: number | undefined;
      let height: number | undefined;
      try {
        const { Jimp } = await import("jimp");
        const img = await Jimp.read(bytes);
        width = img.bitmap.width;
        height = img.bitmap.height;
      } catch {
        /* not decodable by jimp — keep going */
      }

      const pHash = await perceptualHash(bytes).catch(() => null);

      // EXIF/XMP via exifr (best-effort).
      let exif: Record<string, unknown> | null = null;
      try {
        const exifr = (await import("exifr")).default;
        exif = (await exifr
          .parse(bytes, { tiff: true, exif: true, xmp: true, gps: false })
          .catch(() => null)) as Record<string, unknown> | null;
      } catch {
        /* exifr failed */
      }

      const make = str(exif?.["Make"]);
      const model = str(exif?.["Model"]);
      const lens = str(exif?.["LensModel"] ?? exif?.["LensInfo"]);
      const software = str(exif?.["Software"] ?? exif?.["CreatorTool"]);
      const dateTaken = str(exif?.["DateTimeOriginal"] ?? exif?.["CreateDate"]);
      const orientation =
        typeof exif?.["Orientation"] === "number"
          ? (exif["Orientation"] as number)
          : undefined;

      const hasCameraExif = !!(make || model);
      const hasEditorSoftwareTag = !!(software && EDITOR_SOFTWARE.test(software));

      meta.image = {
        width,
        height,
        hasExif: !!exif && Object.keys(exif).length > 0,
        exif: exif
          ? { make, model, lens, software, dateTaken, orientation }
          : undefined,
        pHash,
      };
      meta.hints.hasCameraExif = hasCameraExif;
      meta.hints.hasEditorSoftwareTag = hasEditorSoftwareTag;
      if (!hasCameraExif) {
        meta.hints.note =
          "No camera EXIF — could be a screenshot, an export, or a downloaded image.";
      }
    } else if (kind === "audio" || kind === "video") {
      try {
        const { parseBuffer } = await import("music-metadata");
        const mm = await parseBuffer(
          new Uint8Array(bytes),
          mimeType || undefined,
          { duration: true }
        );
        const fmt = mm.format;
        const encoder = str(
          fmt.tool ?? (mm.common as { encodersettings?: string })?.encodersettings
        );
        if (kind === "audio") {
          meta.audio = {
            container: str(fmt.container),
            codec: str(fmt.codec),
            durationSec: numOrU(fmt.duration),
            bitrate: numOrU(fmt.bitrate),
            sampleRate: numOrU(fmt.sampleRate),
            encoder,
            title: str(mm.common?.title),
            artist: str(mm.common?.artist),
          };
        } else {
          meta.video = {
            container: str(fmt.container),
            durationSec: numOrU(fmt.duration),
            codec: str(fmt.codec),
            encoder,
          };
        }
        meta.hints.reEncoded = !!encoder && REENCODE_ENCODER.test(encoder);
      } catch {
        meta.hints.note = "Container metadata could not be read from this file.";
      }
    } else if (kind === "document") {
      // PDFs carry a readable /Info dict — scan without a heavy dependency.
      const head = bytes.subarray(0, 5).toString("latin1");
      if (head.startsWith("%PDF-")) {
        // Bound the scan for very large files (Info is usually near start/end).
        const text =
          bytes.length > 16 * 1024 * 1024
            ? bytes.subarray(0, 8 * 1024 * 1024).toString("latin1") +
              bytes.subarray(bytes.length - 4 * 1024 * 1024).toString("latin1")
            : bytes.toString("latin1");
        const grab = (key: string): string | undefined => {
          const m = text.match(new RegExp(`/${key}\\s*\\(([^)]{0,200})\\)`));
          return m ? str(m[1]) : undefined;
        };
        const producer = grab("Producer");
        const creator = grab("Creator");
        const createdDate = grab("CreationDate");
        const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
        meta.document = {
          format: "PDF",
          producer,
          creator,
          createdDate,
          pageCount: pageMatches ? pageMatches.length : undefined,
        };
        const soft = `${producer ?? ""} ${creator ?? ""}`;
        meta.hints.hasEditorSoftwareTag = DOC_CONVERTER.test(soft);
        if (meta.hints.hasEditorSoftwareTag) {
          meta.hints.note = `Exported/converted by ${producer || creator} — confirm the seller holds resale rights.`;
        }
      } else {
        // EPUB (zip) / MOBI (binary) — can't scan cheaply.
        meta.document = { format: "EPUB/MOBI" };
        meta.hints.note = "Binary ebook format — inspect via download.";
      }
    }
  } catch {
    /* best-effort — sha256 + size are always present */
  }

  return meta;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
function numOrU(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
