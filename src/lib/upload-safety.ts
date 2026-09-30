/**
 * Upload safety — decide what a file REALLY is before we store or serve it.
 *
 * WHY
 * ---
 * Every upload route used to trust the browser-declared MIME type. A Windows
 * program renamed `invoice.pdf` and sent with `type: application/pdf` was
 * stored and handed out from our own bucket — the fastest way to get a host
 * account suspended for "distributing malware".
 *
 * WHAT IS ALWAYS BLOCKED (no setting — no legitimate flow needs these)
 *   · programs and scripts by name: .exe .dll .msi .apk .bat .cmd .ps1 .sh .js
 *     .vbs .jar .scr .com .hta .lnk … (see BLOCKED_EXT)
 *   · bytes that are a program/script whatever the name says (PE "MZ", ELF,
 *     Mach-O, Java class, DEX, WebAssembly, "#!" shebang, "<?php")
 *   · HTML anywhere; SVG in user image slots; SVG containing script anywhere
 *   · a file whose bytes are a different family than its name/type
 *     (a ZIP called photo.jpg, a program called book.pdf)
 *   · hidden bidi/control characters in the name ("gpj.exe" tricks)
 *
 * WHAT IS POLICY-CONTROLLED (`security.upload_archive_policy`, default "review")
 *   · archives containing programs, nested archives with programs, zip-slip
 *     paths, zip bombs, password-protected entries, Office macros, a PDF
 *     /Launch action, a malware-scan hit. "review" accepts and flags (the
 *     marketplace reviewer sees it on the listing; everything raises an Abuse
 *     Center signal), "block" refuses, "allow" does nothing.
 *
 * MALWARE SCAN HOOKS (both no-ops unless configured)
 *   · VirusTotal hash lookup — env VIRUSTOTAL_API_KEY or setting
 *     `security.virustotal_api_key`. Only a SHA-256 is sent, never the file
 *     (KYC and proof images must not leave the platform), and only for
 *     documents/archives, never plain images/video/audio.
 *   · ClamAV — env CLAMAV_HOST ("host" or "host:port", default port 3310).
 *     Streams the bytes to clamd with INSTREAM over plain TCP; no dependency.
 *
 * The core (`inspectUpload`, `checkUploadName`, `sniffBytes`,
 * `inspectZip`, `safeServeHeaders`) is pure and Prisma-free so
 * scripts/verify-upload-safety.ts can exercise it with in-memory buffers.
 */
import { createHash } from "node:crypto";
import { inflateRawSync, constants as zlibConstants } from "node:zlib";
import { raiseAbuseSignal, type AbuseSeverity } from "@/lib/abuse/signal";

/* ───────────────────────── Allowlists (moved from /api/upload) ───────────── */

export const USER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff"];
export const USER_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/epub+zip",
  "application/x-mobipocket-ebook",
];
export const USER_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
/** Stock-media (music) deliverables. */
export const USER_AUDIO_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/flac", "audio/aac",
  "audio/ogg", "audio/aiff", "audio/x-aiff",
];
export const USER_UPLOAD_TYPES = [
  ...USER_IMAGE_TYPES,
  ...USER_DOCUMENT_TYPES,
  ...USER_VIDEO_TYPES,
  ...USER_AUDIO_TYPES,
];

/* ───────────────────────── Families ───────────────────────── */

/** What a file really is, coarsely. */
export type Family =
  | "image"
  | "svg"
  | "video"
  | "audio"
  | "av" // container that may be audio OR video (Ogg, Matroska/WebM)
  | "pdf"
  | "ole" // legacy Office (.doc/.xls) — also MSI, blocked by name
  | "zip" // zip, docx, epub, …
  | "archive" // rar, 7z, gzip, tar — not in any allowlist
  | "ebook" // mobi / azw
  | "html"
  | "executable"
  | "script";

export interface Sniff {
  family: Family;
  /** Human label, e.g. "Windows program (PE)". */
  label: string;
}

/** Coarse classes a legitimate rename can move within (png ↔ jpeg is fine). */
type Klass = "picture" | "media" | "document" | "active";
const CLASS_OF: Record<Family, Klass> = {
  image: "picture",
  svg: "picture",
  video: "media",
  audio: "media",
  av: "media",
  pdf: "document",
  ole: "document",
  zip: "document",
  archive: "document",
  ebook: "document",
  html: "active",
  executable: "active",
  script: "active",
};

/** Extensions nobody on this platform legitimately uploads. */
export const BLOCKED_EXT = new Set([
  // Windows programs / installers / shortcuts
  "exe", "dll", "msi", "msp", "mst", "scr", "com", "pif", "cpl", "sys", "drv", "ocx",
  "lnk", "url", "scf", "inf", "reg", "hta", "gadget", "appx", "appxbundle", "msix",
  "msixbundle", "application", "xbap", "iso", "img", "vhd", "vhdx",
  // Windows scripts
  "bat", "cmd", "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "wsc", "sct",
  // Unix / mac programs and scripts
  "sh", "bash", "zsh", "csh", "ksh", "command", "elf", "bin", "run", "out", "so", "dylib",
  "app", "dmg", "pkg", "deb", "rpm", "appimage",
  // Cross-platform runtimes
  "jar", "class", "apk", "aab", "xapk", "dex", "wasm", "mjs", "cjs",
  // Server-side scripts (would execute if ever served by a misconfigured host)
  "php", "php3", "php4", "php5", "phtml", "phar", "asp", "aspx", "jsp", "jspx", "cgi", "pl", "py", "rb",
  // Active documents
  "html", "htm", "xhtml", "shtml", "mht", "mhtml", "xht", "svgz",
]);

/** Inside an archive: the program files worth a reviewer's attention. Source
 *  code (.js/.php/.py/.sh/.html) is normal in a template pack and is NOT
 *  flagged, or every web template on the marketplace would light up. */
const ARCHIVE_DANGER_EXT = new Set([
  "exe", "dll", "msi", "msp", "scr", "com", "pif", "cpl", "sys", "ocx", "lnk", "url", "scf",
  "reg", "hta", "gadget", "appx", "msix", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "jse",
  "wsf", "wsh", "wsc", "sct", "jar", "apk", "xapk", "dex", "dmg", "pkg", "iso", "img", "vhd",
  "vhdx", "appimage", "deb", "rpm",
]);

const ARCHIVE_EXT = new Set(["zip", "jar", "apk", "rar", "7z", "gz", "tgz", "tar", "bz2", "xz", "cab", "arj", "lzh", "ace", "zipx"]);

/** Extension → family, for the "name vs type vs bytes" comparison. */
const EXT_FAMILY: Record<string, Family> = {
  jpg: "image", jpeg: "image", jfif: "image", png: "image", gif: "image", webp: "image",
  tif: "image", tiff: "image", bmp: "image", heic: "image", heif: "image", avif: "image", ico: "image",
  svg: "svg",
  mp4: "video", m4v: "video", mov: "video", qt: "video", webm: "av", mkv: "av", avi: "video", "3gp": "video",
  mp3: "audio", wav: "audio", flac: "audio", aac: "audio", m4a: "audio", ogg: "av", oga: "audio",
  opus: "audio", aif: "audio", aiff: "audio", wma: "audio",
  pdf: "pdf",
  doc: "ole", xls: "ole", ppt: "ole",
  docx: "zip", xlsx: "zip", pptx: "zip", docm: "zip", epub: "zip", zip: "zip",
  mobi: "ebook", azw: "ebook", azw3: "ebook",
  rar: "archive", "7z": "archive", gz: "archive", tgz: "archive", tar: "archive",
  html: "html", htm: "html",
};

/** Declared MIME → family. Returns null for types we don't reason about. */
export function familyOfMime(mime: string): Family | null {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (!m) return null;
  if (m === "image/svg+xml") return "svg";
  if (m.startsWith("image/")) return "image";
  if (m === "video/webm" || m === "video/ogg") return "av";
  if (m.startsWith("video/")) return "video";
  if (m === "audio/ogg" || m === "audio/webm") return "av";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m === "application/msword" || m === "application/vnd.ms-excel" || m === "application/vnd.ms-powerpoint") return "ole";
  if (m.includes("openxmlformats") || m === "application/zip" || m === "application/x-zip-compressed" || m === "application/epub+zip") return "zip";
  if (m === "application/x-mobipocket-ebook" || m === "application/vnd.amazon.ebook") return "ebook";
  if (m === "application/x-rar-compressed" || m === "application/vnd.rar" || m === "application/x-7z-compressed" || m === "application/gzip" || m === "application/x-tar") return "archive";
  if (m === "text/html" || m === "application/xhtml+xml") return "html";
  if (
    m === "application/x-msdownload" || m === "application/x-msdos-program" || m === "application/x-ms-installer" ||
    m === "application/x-executable" || m === "application/x-elf" || m === "application/x-mach-binary" ||
    m === "application/vnd.android.package-archive" || m === "application/java-archive" || m === "application/x-msi"
  ) return "executable";
  if (
    m === "application/javascript" || m === "text/javascript" || m === "application/x-sh" || m === "application/x-shellscript" ||
    m === "application/x-bat" || m === "application/x-php" || m === "text/x-php" || m === "text/x-python" || m === "application/x-powershell"
  ) return "script";
  return null;
}

/** Families the bytes may be, given what the name/type claimed. */
function compatible(declared: Family, detected: Family): boolean {
  if (declared === detected) return true;
  const media = new Set<Family>(["video", "audio", "av"]);
  if (media.has(declared) && media.has(detected)) return true; // mp4 audio, webm audio…
  if (declared === "ole" && detected === "zip") return true; // .doc that is really docx
  if (declared === "zip" && detected === "ole") return true; // "docx" that is really .doc
  return false;
}

/* ───────────────────────── Byte sniffer ───────────────────────── */

function startsWith(b: Uint8Array, sig: number[], at = 0): boolean {
  if (b.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
}
function ascii(b: Uint8Array, at: number, len: number): string {
  return Buffer.from(b.subarray(at, Math.min(b.length, at + len))).toString("latin1");
}

/**
 * Decide the real type from magic bytes. Returns null when the bytes aren't
 * something we recognise (plain text, a codec we don't list) — callers treat
 * null as "no evidence either way", never as a reason to block.
 */
export function sniffBytes(b: Uint8Array): Sniff | null {
  if (!b || b.length < 2) return null;

  // ── Programs ──
  if (startsWith(b, [0x4d, 0x5a])) return { family: "executable", label: "Windows program (PE/MZ)" };
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return { family: "executable", label: "Linux program (ELF)" };
  if (
    startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xcf, 0xfa, 0xed, 0xfe])
  ) return { family: "executable", label: "macOS program (Mach-O)" };
  // CAFEBABE = Java class OR a universal Mach-O — both are programs.
  if (startsWith(b, [0xca, 0xfe, 0xba, 0xbe])) return { family: "executable", label: "Java class / macOS universal program" };
  if (startsWith(b, [0x64, 0x65, 0x78, 0x0a])) return { family: "executable", label: "Android program (DEX)" };
  if (startsWith(b, [0x00, 0x61, 0x73, 0x6d])) return { family: "executable", label: "WebAssembly module" };
  if (startsWith(b, [0x23, 0x21])) return { family: "script", label: "script (#! shebang)" };
  // Windows shortcut (.lnk)
  if (startsWith(b, [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00])) return { family: "executable", label: "Windows shortcut (.lnk)" };

  // ── Images ──
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { family: "image", label: "JPEG image" };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { family: "image", label: "PNG image" };
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return { family: "image", label: "GIF image" };
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return { family: "image", label: "TIFF image" };
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00]) && b.length > 6) return { family: "image", label: "ICO image" };
  if (ascii(b, 0, 2) === "BM" && b.length > 26 && b[14] >= 12 && b[14] <= 124 && b[15] === 0) return { family: "image", label: "BMP image" };

  // ── RIFF containers ──
  if (ascii(b, 0, 4) === "RIFF") {
    const kind = ascii(b, 8, 4);
    if (kind === "WEBP") return { family: "image", label: "WebP image" };
    if (kind === "WAVE") return { family: "audio", label: "WAV audio" };
    if (kind === "AVI ") return { family: "video", label: "AVI video" };
  }
  if (ascii(b, 0, 4) === "FORM" && (ascii(b, 8, 4) === "AIFF" || ascii(b, 8, 4) === "AIFC")) return { family: "audio", label: "AIFF audio" };

  // ── ISO-BMFF (mp4/mov/m4a/heic/avif) ──
  const box = ascii(b, 4, 4);
  if (box === "ftyp") {
    const brand = ascii(b, 8, 4).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif", "avis"].includes(brand)) return { family: "image", label: `HEIF/AVIF image (${brand})` };
    if (["m4a ", "m4b ", "m4p ", "f4a ", "f4b "].includes(brand)) return { family: "audio", label: `MPEG-4 audio (${brand.trim()})` };
    return { family: "video", label: `MPEG-4/QuickTime video (${brand.trim()})` };
  }
  if (["moov", "mdat", "wide", "free", "skip", "pnot"].includes(box)) return { family: "video", label: "QuickTime video" };

  // ── Other media ──
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return { family: "av", label: "Matroska/WebM media" };
  if (ascii(b, 0, 4) === "OggS") return { family: "av", label: "Ogg media" };
  if (ascii(b, 0, 4) === "fLaC") return { family: "audio", label: "FLAC audio" };
  if (ascii(b, 0, 3) === "ID3") return { family: "audio", label: "MP3 audio" };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    // MPEG audio frame sync, or ADTS AAC (layer bits 00).
    return { family: "audio", label: (b[1] & 0x06) === 0 ? "AAC audio" : "MP3 audio" };
  }

  // ── Documents / archives ──
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08])) {
    return { family: "zip", label: "ZIP archive" };
  }
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { family: "ole", label: "legacy Office / OLE file" };
  if (ascii(b, 0, 6) === "Rar!\x1a\x07") return { family: "archive", label: "RAR archive" };
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return { family: "archive", label: "7-Zip archive" };
  if (startsWith(b, [0x1f, 0x8b])) return { family: "archive", label: "gzip archive" };
  if (ascii(b, 257, 5) === "ustar") return { family: "archive", label: "tar archive" };
  if (ascii(b, 0, 4) === "MSCF") return { family: "archive", label: "Windows cabinet (.cab)" };
  if (ascii(b, 60, 8) === "BOOKMOBI" || ascii(b, 60, 8) === "TEXtREAd") return { family: "ebook", label: "MOBI e-book" };

  // ── Text-ish: PDF may follow a little junk; HTML/SVG/PHP after whitespace ──
  const head = ascii(b, 0, 2048);
  const pdfAt = head.indexOf("%PDF-");
  if (pdfAt >= 0 && pdfAt < 1024) return { family: "pdf", label: "PDF document" };
  const t = head.replace(/^﻿|^\xEF\xBB\xBF/, "").replace(/^[\s\x00]+/, "").toLowerCase();
  if (t.startsWith("<?php") || /<\?php\s/.test(t.slice(0, 1024))) return { family: "script", label: "PHP script" };
  if (/^<svg[\s>]/.test(t) || (/^<\?xml/.test(t) && /<svg[\s>]/.test(t)) || (/^<!doctype svg/.test(t))) {
    return { family: "svg", label: "SVG image" };
  }
  if (
    /^<!doctype html/.test(t) || /^<html[\s>]/.test(t) || /^<head[\s>]/.test(t) || /^<body[\s>]/.test(t) ||
    /^<script[\s>]/.test(t) || /^<iframe[\s>]/.test(t) || (t.startsWith("<") && /<script[\s>]/.test(t))
  ) {
    return { family: "html", label: "HTML page" };
  }
  return null;
}

/** An SVG that could run code if opened directly. */
export function svgHasActiveContent(b: Uint8Array): boolean {
  const s = Buffer.from(b.subarray(0, Math.min(b.length, 2 * 1024 * 1024))).toString("utf8").toLowerCase();
  return (
    /<script[\s>]/.test(s) ||
    /\son[a-z]+\s*=/.test(s) ||
    /javascript:/.test(s) ||
    /<foreignobject[\s>]/.test(s) ||
    /<iframe[\s>]/.test(s) ||
    /<embed[\s>]/.test(s)
  );
}

/* ───────────────────────── File-name checks ───────────────────────── */

export interface NameCheck {
  /** Always-block reasons. */
  block: string[];
  /** Suspicious but policy-controlled. */
  flags: string[];
  ext: string;
}

/** Split a name the way Windows would read it (trailing dots/spaces dropped). */
function nameParts(fileName: string): string[] {
  const base = (fileName || "").split(/[\\/]/).pop() ?? "";
  const trimmed = base.replace(/[.\s]+$/, "");
  return trimmed.split(".").map((p) => p.trim().toLowerCase());
}

export function checkUploadName(
  fileName: string,
  declaredType: string,
  opts: { allowSvg?: boolean } = {}
): NameCheck {
  const block: string[] = [];
  const flags: string[] = [];
  const name = fileName || "";

  // Bidi overrides / zero-width / control characters are how "gpj.exe" is
  // made to display as "exe.jpg". No real file name needs them.
  if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\u200e\u200f]/.test(name)) {
    block.push("the file name contains hidden control characters");
  }

  const parts = nameParts(name);
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  if (ext && BLOCKED_EXT.has(ext) && !(ext === "svg" && opts.allowSvg)) {
    block.push(`.${ext} files (programs, scripts and web pages) can't be uploaded`);
  }
  if (ext === "svg" && !opts.allowSvg) {
    block.push("SVG files can't be uploaded here — use PNG, JPEG or WebP");
  }
  // x.pdf.exe is caught above (final .exe). An executable extension hiding in
  // the middle (setup.exe.zip, photo.scr.jpg) is odd enough to flag.
  for (const inner of parts.slice(1, -1)) {
    if (ARCHIVE_DANGER_EXT.has(inner)) {
      flags.push(`double extension ".${inner}.${ext}" in the file name`);
      break;
    }
  }

  const declared = familyOfMime(declaredType);
  if (declared === "executable" || declared === "script" || declared === "html") {
    block.push(`the file type "${declaredType}" (a program, script or web page) can't be uploaded`);
  } else if (declared === "svg" && !opts.allowSvg) {
    block.push("SVG files can't be uploaded here — use PNG, JPEG or WebP");
  }

  // Name and declared type must be the same kind of thing. Browsers derive the
  // type FROM the extension, so a mismatch at the class level (a ".zip" sent
  // as image/png) only happens in a crafted request. Renames inside a class
  // (png ↔ jpeg, mp4 ↔ m4a) are fine.
  const extFam = ext ? EXT_FAMILY[ext] : undefined;
  if (extFam && declared && CLASS_OF[extFam] !== CLASS_OF[declared] && !block.length) {
    block.push(`the file is named .${ext} but was sent as "${declaredType}"`);
  }

  return { block, flags, ext };
}

/* ───────────────────────── ZIP inspection ───────────────────────── */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
  /** Absolute offset of the local file header in the archive. */
  localOffset: number;
}

export interface ZipListing {
  entries: ZipEntry[];
  /** Set when the central directory couldn't be read. */
  error?: string;
  /** Entries in the directory we didn't parse (buffer ended early / cap). */
  truncated?: boolean;
}

const MAX_ENTRIES_PARSED = 50_000;

/**
 * Read a ZIP's central directory. `buf` may be the WHOLE archive
 * (bufStart = 0) or just its TAIL (bufStart = totalSize − buf.length), which is
 * how a large object in S3 is inspected without downloading all of it.
 */
export function listZipEntries(buf: Uint8Array, bufStart = 0, totalSize = bufStart + buf.length): ZipListing {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  // End-of-central-directory: last 22 bytes + up to 64 KB comment.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { entries: [], error: "no ZIP directory found (damaged or not a ZIP)" };

  let count = b.readUInt16LE(eocd + 10);
  let cdSize = b.readUInt32LE(eocd + 12);
  let cdOffset = b.readUInt32LE(eocd + 16);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && b.readUInt32LE(loc) === 0x07064b50) {
      const z64abs = Number(b.readBigUInt64LE(loc + 8));
      const z64 = z64abs - bufStart;
      if (z64 >= 0 && z64 + 56 <= b.length && b.readUInt32LE(z64) === 0x06064b50) {
        count = Number(b.readBigUInt64LE(z64 + 32));
        cdSize = Number(b.readBigUInt64LE(z64 + 40));
        cdOffset = Number(b.readBigUInt64LE(z64 + 48));
      }
    }
  }
  if (cdOffset + cdSize > totalSize) return { entries: [], error: "ZIP directory points past the end of the file" };

  const entries: ZipEntry[] = [];
  let p = cdOffset - bufStart;
  if (p < 0) return { entries: [], error: "ZIP directory not in the bytes read", truncated: true };
  let truncated = false;
  for (let n = 0; n < count; n++) {
    if (n >= MAX_ENTRIES_PARSED) { truncated = true; break; }
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) { truncated = n < count; break; }
    const flags = b.readUInt16LE(p + 8);
    const method = b.readUInt16LE(p + 10);
    let comp = b.readUInt32LE(p + 20);
    let uncomp = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    let local = b.readUInt32LE(p + 42);
    if (p + 46 + nameLen > b.length) { truncated = true; break; }
    const rawName = b.subarray(p + 46, p + 46 + nameLen);
    const name = (flags & 0x800) ? rawName.toString("utf8") : rawName.toString("latin1");

    // ZIP64 extra field (0x0001): only the fields that overflowed are present.
    let e = p + 46 + nameLen;
    const eEnd = Math.min(b.length, e + extraLen);
    while (e + 4 <= eEnd) {
      const id = b.readUInt16LE(e);
      const sz = b.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncomp === 0xffffffff && q + 8 <= eEnd) { uncomp = Number(b.readBigUInt64LE(q)); q += 8; }
        if (comp === 0xffffffff && q + 8 <= eEnd) { comp = Number(b.readBigUInt64LE(q)); q += 8; }
        if (local === 0xffffffff && q + 8 <= eEnd) { local = Number(b.readBigUInt64LE(q)); q += 8; }
      }
      e += 4 + sz;
    }

    entries.push({ name, method, compressedSize: comp, uncompressedSize: uncomp, encrypted: (flags & 1) === 1, localOffset: local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, truncated };
}

/** The first `max` bytes of an entry's content, when its data is in `buf`. */
function entryHead(buf: Buffer, bufStart: number, en: ZipEntry, max: number): Buffer | null {
  const lh = en.localOffset - bufStart;
  if (lh < 0 || lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) return null;
  const dataAt = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  if (dataAt > buf.length) return null;
  const avail = buf.subarray(dataAt, Math.min(buf.length, dataAt + en.compressedSize));
  if (en.encrypted) return null;
  if (en.method === 0) return avail.subarray(0, max);
  if (en.method === 8) {
    try {
      // Partial input is fine with SYNC_FLUSH — we get what decodes.
      const out = inflateRawSync(avail.subarray(0, Math.max(max, 4096)), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
        maxOutputLength: Math.max(max, 1 << 20),
      });
      return out.subarray(0, max);
    } catch {
      return null;
    }
  }
  return null;
}

/** The whole (small) entry, for inspecting a nested ZIP. */
function entryWhole(buf: Buffer, bufStart: number, en: ZipEntry, cap: number): Buffer | null {
  if (en.uncompressedSize > cap || en.compressedSize > cap) return null;
  const lh = en.localOffset - bufStart;
  if (lh < 0 || lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) return null;
  const dataAt = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  if (dataAt + en.compressedSize > buf.length || en.encrypted) return null;
  const data = buf.subarray(dataAt, dataAt + en.compressedSize);
  if (en.method === 0) return data;
  if (en.method === 8) {
    try {
      return inflateRawSync(data, { maxOutputLength: cap });
    } catch {
      return null;
    }
  }
  return null;
}

export interface ZipReport {
  entries: number;
  totalUncompressed: number;
  /** Policy-controlled findings (each a plain sentence). */
  findings: string[];
  /** Program files found inside (names), for the reviewer. */
  programFiles: string[];
  error?: string;
}

export const ZIP_LIMITS = {
  maxEntries: 20_000,
  maxTotalUncompressed: 4 * 1024 ** 3, // 4 GB
  maxRatio: 200, // per entry, when the entry is also big
  bigEntry: 100 * 1024 ** 2, // 100 MB
  nestedCap: 25 * 1024 ** 2, // inspect nested zips up to 25 MB
  sniffEntries: 400, // content-sniff this many entries
};

function extOf(name: string): string {
  const parts = nameParts(name);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Inspect a ZIP for things a reviewer should see. Never throws.
 * `depth` limits nested-archive recursion.
 */
export function inspectZip(buf: Uint8Array, bufStart = 0, totalSize = bufStart + buf.length, depth = 0): ZipReport {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const listing = listZipEntries(b, bufStart, totalSize);
  const report: ZipReport = { entries: listing.entries.length, totalUncompressed: 0, findings: [], programFiles: [] };
  if (listing.error) {
    report.error = listing.error;
    // A ZIP whose directory we can't read can't be checked — say so, but a
    // truncated tail read is our limitation, not the seller's.
    if (!listing.truncated) report.findings.push(`archive could not be read (${listing.error})`);
    return report;
  }

  const traversal: string[] = [];
  const encrypted: string[] = [];
  const disguised: string[] = [];
  const unreadableNested: string[] = [];
  let macros = false;
  let bomb = "";
  let sniffed = 0;

  for (const en of listing.entries) {
    report.totalUncompressed += en.uncompressedSize;
    const n = en.name;
    const lower = n.toLowerCase();
    if (/(^|[\\/])\.\.([\\/]|$)/.test(n) || n.startsWith("/") || n.startsWith("\\") || /^[a-z]:/i.test(n)) traversal.push(n);
    if (en.encrypted) encrypted.push(n);
    if (/(^|\/)vbaproject\.bin$/i.test(lower)) macros = true;
    if (!bomb && en.uncompressedSize > ZIP_LIMITS.bigEntry && en.compressedSize > 0 &&
        en.uncompressedSize / en.compressedSize > ZIP_LIMITS.maxRatio) {
      bomb = `"${n}" expands ${Math.round(en.uncompressedSize / en.compressedSize)}× (${(en.uncompressedSize / 1024 ** 2).toFixed(0)} MB)`;
    }
    if (n.endsWith("/")) continue; // directory

    const ext = extOf(n);
    if (ARCHIVE_DANGER_EXT.has(ext)) {
      report.programFiles.push(n);
      continue;
    }

    // Nested archive: look inside a ZIP; other formats can't be read here.
    if (ARCHIVE_EXT.has(ext)) {
      const inner = depth < 2 ? entryWhole(b, bufStart, en, ZIP_LIMITS.nestedCap) : null;
      if (inner && sniffBytes(inner)?.family === "zip") {
        const sub = inspectZip(inner, 0, inner.length, depth + 1);
        for (const pf of sub.programFiles) report.programFiles.push(`${n} → ${pf}`);
        for (const f of sub.findings) report.findings.push(`inside ${n}: ${f}`);
      } else if (!["jar", "apk"].includes(ext)) {
        unreadableNested.push(n);
      }
      continue;
    }

    // Content sniff: a program hiding behind an innocent name inside the ZIP.
    if (sniffed < ZIP_LIMITS.sniffEntries && en.compressedSize > 0) {
      const head = entryHead(b, bufStart, en, 512);
      if (head) {
        sniffed++;
        const s = sniffBytes(head);
        if (s?.family === "executable") disguised.push(`${n} (${s.label})`);
      }
    }
  }

  if (report.entries > ZIP_LIMITS.maxEntries) report.findings.push(`archive holds ${report.entries.toLocaleString()} files (zip bomb?)`);
  if (report.totalUncompressed > ZIP_LIMITS.maxTotalUncompressed) {
    report.findings.push(`archive expands to ${(report.totalUncompressed / 1024 ** 3).toFixed(1)} GB (zip bomb?)`);
  } else if (bomb) {
    report.findings.push(`extreme compression: ${bomb} (zip bomb?)`);
  }
  if (report.programFiles.length) {
    report.findings.push(`contains program/script files: ${report.programFiles.slice(0, 8).join(", ")}${report.programFiles.length > 8 ? ` +${report.programFiles.length - 8} more` : ""}`);
  }
  if (disguised.length) report.findings.push(`contains programs disguised under other names: ${disguised.slice(0, 5).join(", ")}`);
  if (traversal.length) report.findings.push(`contains unsafe paths that escape the folder (zip slip): ${traversal.slice(0, 5).join(", ")}`);
  if (encrypted.length) report.findings.push(`${encrypted.length} password-protected file(s) — contents can't be checked`);
  if (unreadableNested.length) report.findings.push(`contains other archives that can't be checked: ${unreadableNested.slice(0, 5).join(", ")}`);
  if (macros) report.findings.push("Office document with macros (vbaProject.bin)");
  if (listing.truncated) report.findings.push("archive directory only partly readable");
  return report;
}

/* ───────────────────────── Whole-file verdict ───────────────────────── */

export interface UploadVerdict {
  /** Reasons the file is refused outright (always-block rules). */
  block: string[];
  /** Policy-controlled findings. */
  flags: string[];
  declaredType: string;
  detected: Sniff | null;
  zip?: ZipReport;
  /** SHA-256 of the bytes, when the whole file was inspected. */
  sha256?: string;
}

export interface InspectOptions {
  /** Admin-only paths may keep plain (script-free) SVG logos. */
  allowSvg?: boolean;
  /** `bytes` is only the tail of a larger object (for ZIP directory reads). */
  tail?: { bytes: Uint8Array; start: number; totalSize: number };
  /** `bytes` is the complete file (enables hashing). Default true. */
  complete?: boolean;
}

/**
 * The full check for an upload whose bytes we hold (or at least its head).
 * Pure: no settings, no network, no signals.
 */
export function inspectUpload(
  fileName: string,
  declaredType: string,
  bytes: Uint8Array,
  opts: InspectOptions = {}
): UploadVerdict {
  const name = checkUploadName(fileName, declaredType, { allowSvg: opts.allowSvg });
  const block = [...name.block];
  const flags = [...name.flags];
  const detected = sniffBytes(bytes);
  const verdict: UploadVerdict = { block, flags, declaredType, detected };
  if (opts.complete !== false) verdict.sha256 = createHash("sha256").update(bytes).digest("hex");

  if (detected) {
    if (detected.family === "executable" || detected.family === "script") {
      block.push(`this file is really a ${detected.label}, not a ${describeDeclared(declaredType, name.ext)}`);
    } else if (detected.family === "html") {
      block.push("this file is really a web page (HTML), which can't be uploaded");
    } else if (detected.family === "svg") {
      if (!opts.allowSvg) block.push("this file is really an SVG, which can't be uploaded here — use PNG, JPEG or WebP");
      else if (svgHasActiveContent(bytes)) block.push("this SVG contains script or event handlers");
    } else {
      // Bytes vs claimed type/name. Trust whichever claim exists.
      const claimed = familyOfMime(declaredType) ?? (name.ext ? EXT_FAMILY[name.ext] : undefined) ?? null;
      if (claimed && !compatible(claimed, detected.family)) {
        block.push(`this file is really a ${detected.label}, not a ${describeDeclared(declaredType, name.ext)}`);
      }
    }
  }

  // Archives (incl. docx/epub): look inside.
  if (!block.length && detected?.family === "zip") {
    const zip = opts.tail
      ? inspectZip(opts.tail.bytes, opts.tail.start, opts.tail.totalSize)
      : inspectZip(bytes);
    verdict.zip = zip;
    flags.push(...zip.findings);
  }
  // PDF that launches a program when opened.
  if (!block.length && detected?.family === "pdf") {
    const s = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024))).toString("latin1");
    if (/\/Launch\b/.test(s)) flags.push("PDF contains a /Launch action (can start a program when opened)");
  }
  return verdict;
}

function describeDeclared(declaredType: string, ext: string): string {
  if (ext) return `.${ext} file`;
  return declaredType || "file";
}

/* ───────────────────────── Policy + signals ───────────────────────── */

export type ArchivePolicy = "review" | "block" | "allow";
export const ARCHIVE_POLICIES: readonly ArchivePolicy[] = ["review", "block", "allow"];

/** `security.upload_archive_policy` — default "review" (never breaks a seller). */
export async function getArchivePolicy(): Promise<ArchivePolicy> {
  try {
    const { getSetting } = await import("@/lib/system-settings");
    const v = await getSetting<string>("security.upload_archive_policy", "review");
    return (ARCHIVE_POLICIES as readonly string[]).includes(String(v)) ? (v as ArchivePolicy) : "review";
  } catch {
    return "review";
  }
}

export interface UploadContext {
  userId?: string | null;
  /** Which route/flow — "api/upload", "profile/photo", "marketplace listing"… */
  where: string;
  fileName: string;
  key?: string;
  entityType?: string;
  entityId?: string | null;
}

export interface UploadDecision {
  /** A user-facing reason to refuse, or null to accept. */
  reject: string | null;
  /** Accepted but flagged for review. */
  flagged: boolean;
  policy: ArchivePolicy;
}

function evidenceOf(v: UploadVerdict, ctx: UploadContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    fileName: ctx.fileName,
    where: ctx.where,
    key: ctx.key ?? null,
    declaredType: v.declaredType || null,
    detectedType: v.detected?.label ?? null,
    reasons: [...v.block, ...v.flags],
    ...(v.zip ? { archive: { entries: v.zip.entries, programFiles: v.zip.programFiles.slice(0, 50) } } : {}),
    ...(v.sha256 ? { sha256: v.sha256 } : {}),
    ...extra,
  };
}

/**
 * Apply the rules: always-block reasons reject; flags follow the archive
 * policy. Raises the Abuse Center signal for every block/flag. Never throws.
 */
export async function decideUpload(v: UploadVerdict, ctx: UploadContext): Promise<UploadDecision> {
  if (v.block.length) {
    const disguised = v.detected?.family === "executable" || v.detected?.family === "script";
    raiseAbuseSignal({
      kind: "UPLOAD_BLOCKED",
      severity: disguised ? "HIGH" : "MEDIUM",
      userId: ctx.userId ?? null,
      entityType: ctx.entityType ?? "upload",
      entityId: ctx.entityId ?? ctx.key ?? null,
      summary: `Upload refused (${ctx.where}): "${ctx.fileName}" — ${v.block[0]}`,
      evidence: evidenceOf(v, ctx),
    });
    return { reject: `This file can't be uploaded: ${v.block[0]}.`, flagged: false, policy: "review" };
  }
  if (!v.flags.length) return { reject: null, flagged: false, policy: "review" };

  const policy = await getArchivePolicy();
  if (policy === "allow") return { reject: null, flagged: false, policy };
  const severe = !!v.zip?.programFiles.length || v.flags.some((f) => /disguised|zip slip|zip bomb/.test(f));
  raiseAbuseSignal({
    kind: "UPLOAD_SUSPICIOUS",
    severity: severe ? "HIGH" : "MEDIUM",
    userId: ctx.userId ?? null,
    entityType: ctx.entityType ?? "upload",
    entityId: ctx.entityId ?? ctx.key ?? null,
    summary: `${policy === "block" ? "Upload refused" : "Upload flagged for review"} (${ctx.where}): "${ctx.fileName}" — ${v.flags[0]}`,
    evidence: evidenceOf(v, ctx, { policy }),
  });
  if (policy === "block") {
    return { reject: `This file can't be uploaded: ${v.flags[0]}.`, flagged: true, policy };
  }
  return { reject: null, flagged: true, policy };
}

/** Name-only check for pre-signed uploads (the server never sees the bytes). */
export async function decideUploadName(
  fileName: string,
  declaredType: string,
  ctx: Omit<UploadContext, "fileName">,
  opts: { allowSvg?: boolean } = {}
): Promise<UploadDecision> {
  const n = checkUploadName(fileName, declaredType, opts);
  return decideUpload({ block: n.block, flags: n.flags, declaredType, detected: null }, { ...ctx, fileName });
}

/* ───────────────────────── Malware scan hooks ───────────────────────── */

export interface ScanResult {
  engine: "virustotal" | "clamav";
  status: "clean" | "malicious" | "unknown" | "error";
  detail?: string;
}

/** Families worth a malware lookup — documents and archives, not media. */
export function shouldMalwareScan(v: UploadVerdict): boolean {
  const f = v.detected?.family;
  return !f || f === "pdf" || f === "ole" || f === "zip" || f === "archive" || f === "ebook";
}

/** VirusTotal needs this many engines to agree before we call it malware
 *  (a single engine is a frequent false positive). */
const VT_MIN_MALICIOUS = 2;

/** Hash-only lookup. No-op ("unknown") unless a key is configured. */
export async function virusTotalLookup(sha256: string): Promise<ScanResult | null> {
  let apiKey = "";
  try {
    const { getSecret } = await import("@/lib/system-settings");
    apiKey = await getSecret("VIRUSTOTAL_API_KEY", "security.virustotal_api_key");
  } catch {
    apiKey = process.env.VIRUSTOTAL_API_KEY ?? "";
  }
  if (!apiKey || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
      headers: { "x-apikey": apiKey.trim() },
      signal: AbortSignal.timeout(6000),
      redirect: "error",
    });
    if (res.status === 404) return { engine: "virustotal", status: "unknown", detail: "hash not known to VirusTotal" };
    if (!res.ok) return { engine: "virustotal", status: "error", detail: `HTTP ${res.status}` };
    const j = (await res.json()) as { data?: { attributes?: { last_analysis_stats?: { malicious?: number; suspicious?: number } } } };
    const st = j.data?.attributes?.last_analysis_stats ?? {};
    const mal = Number(st.malicious ?? 0);
    return {
      engine: "virustotal",
      status: mal >= VT_MIN_MALICIOUS ? "malicious" : "clean",
      detail: `${mal} engines malicious, ${Number(st.suspicious ?? 0)} suspicious`,
    };
  } catch (e) {
    return { engine: "virustotal", status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * ClamAV hook — set CLAMAV_HOST ("host" or "host:port") to a clamd listening
 * on TCP. Streams the bytes with the INSTREAM command. No-op when unset.
 */
export async function clamavScan(bytes: Uint8Array): Promise<ScanResult | null> {
  const hostSpec = process.env.CLAMAV_HOST;
  if (!hostSpec) return null;
  const [host, portStr] = hostSpec.split(":");
  const port = Number(portStr) || 3310;
  const net = await import("node:net");
  return new Promise<ScanResult>((resolve) => {
    let reply = "";
    const sock = net.createConnection({ host, port });
    const done = (r: ScanResult) => { sock.destroy(); resolve(r); };
    sock.setTimeout(15_000, () => done({ engine: "clamav", status: "error", detail: "timeout" }));
    sock.on("error", (e) => done({ engine: "clamav", status: "error", detail: e.message }));
    sock.on("data", (d) => { reply += d.toString("utf8"); });
    sock.on("end", () => {
      const r = reply.replace(/\0/g, "").trim();
      if (/FOUND$/.test(r)) done({ engine: "clamav", status: "malicious", detail: r });
      else if (/OK$/.test(r)) done({ engine: "clamav", status: "clean" });
      else done({ engine: "clamav", status: "error", detail: r || "no reply" });
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const part = bytes.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        sock.write(len);
        sock.write(part);
      }
      sock.write(Buffer.alloc(4)); // zero-length chunk = end of stream
    });
  });
}

/** Run whichever scanners are configured. Empty array = none configured. */
export async function malwareScan(bytes: Uint8Array, sha256?: string): Promise<ScanResult[]> {
  const hash = sha256 ?? createHash("sha256").update(bytes).digest("hex");
  const [vt, clam] = await Promise.all([
    virusTotalLookup(hash).catch(() => null),
    clamavScan(bytes).catch(() => null),
  ]);
  return [vt, clam].filter((x): x is ScanResult => !!x);
}

/**
 * Fire-and-forget scan after an upload was stored. A hit raises a HIGH
 * signal; under the "block" policy the stored object is also deleted so it
 * can't be downloaded. Under "review" it stays (the Abuse Center case links
 * the key) — nothing a legitimate user did is undone automatically.
 */
export function scanStoredUploadInBackground(bytes: Uint8Array, v: UploadVerdict, ctx: UploadContext): void {
  if (!shouldMalwareScan(v)) return;
  // No-op when neither scanner is configured: malwareScan returns [] (the
  // VirusTotal key may live in env OR SystemSetting, so it checks both).
  void (async () => {
    const results = await malwareScan(bytes, v.sha256);
    const hit = results.find((r) => r.status === "malicious");
    if (!hit) return;
    const policy = await getArchivePolicy();
    const severity: AbuseSeverity = "HIGH";
    raiseAbuseSignal({
      kind: "UPLOAD_SUSPICIOUS",
      severity,
      userId: ctx.userId ?? null,
      entityType: ctx.entityType ?? "upload",
      entityId: ctx.entityId ?? ctx.key ?? null,
      summary: `Malware scan hit (${hit.engine}) on "${ctx.fileName}" — ${hit.detail ?? "malicious"}${policy === "block" && ctx.key ? " · file deleted" : ""}`,
      evidence: evidenceOf(v, ctx, { scan: results, policy }),
    });
    if (policy === "block" && ctx.key) {
      try {
        const { deleteFile } = await import("@/lib/s3");
        await deleteFile(ctx.key);
      } catch (e) {
        console.error("[upload-safety] could not delete infected upload", ctx.key, e);
      }
    }
  })().catch((e) => console.error("[upload-safety] background scan failed", e));
}

/* ───────────────────────── Stored-object inspection ───────────────────────── */

/** An S3 key from one of our own bucket/CloudFront URLs, else null. */
export function ownS3KeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const cf = (process.env.AWS_CLOUDFRONT_DOMAIN ?? "").toLowerCase();
    const bucket = (process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || "").toLowerCase();
    const ours =
      (cf && host === cf) ||
      host.endsWith(".cloudfront.net") ||
      (bucket && host.startsWith(`${bucket}.s3`) && host.endsWith(".amazonaws.com"));
    if (!ours) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    return key && !key.includes("..") ? key : null;
  } catch {
    return null;
  }
}

/** Original file name from a key made by generateFileKey (`<ts>_<rand>_<name>`). */
function fileNameFromKey(key: string): string {
  const base = key.split("/").pop() ?? key;
  const m = base.match(/^\d+_[a-z0-9]+_(.+)$/i);
  return m ? m[1] : base;
}

export interface StoredFileSafety {
  url: string;
  fileName: string;
  detectedType: string | null;
  declaredType: string;
  sizeBytes: number;
  blocked: string[];
  flags: string[];
  programFiles?: string[];
  scan?: ScanResult[];
  /** True when the file was too big to read whole (no hash/scan). */
  partial?: boolean;
}

export interface StoredFilesSafety {
  checkedAt: string;
  policy: ArchivePolicy;
  files: StoredFileSafety[];
  /** Any always-block hit. */
  blocked: boolean;
  /** Any policy-controlled finding or scan hit. */
  flagged: boolean;
}

const WHOLE_READ_MAX = 32 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 8 * 1024 * 1024;

/**
 * Re-inspect files that are already in our bucket — the path for uploads that
 * went straight to S3 with a pre-signed URL (the server never saw the bytes).
 * Used where a flow has a review step (marketplace listings). Never throws;
 * files that aren't ours or can't be read are skipped.
 */
export async function inspectStoredFiles(urls: string[], opts: { max?: number; scan?: boolean } = {}): Promise<StoredFilesSafety | null> {
  const keys = urls
    .map((u) => ({ url: u, key: ownS3KeyFromUrl(u) }))
    .filter((x): x is { url: string; key: string } => !!x.key)
    .slice(0, opts.max ?? 6);
  if (!keys.length) return null;
  const { getObjectBytes } = await import("@/lib/s3");
  const policy = await getArchivePolicy();
  const files: StoredFileSafety[] = [];

  for (const { url, key } of keys) {
    try {
      const head = await getObjectBytes(key, `bytes=0-${HEAD_BYTES - 1}`);
      const fileName = fileNameFromKey(key);
      const total = head.totalSize;
      let bytes = head.bytes;
      let complete = total <= bytes.length;
      const sniff = sniffBytes(head.bytes);
      const wantsWhole = sniff?.family !== "image" && sniff?.family !== "video" && sniff?.family !== "audio" && sniff?.family !== "av";
      if (!complete && wantsWhole && total <= WHOLE_READ_MAX) {
        bytes = (await getObjectBytes(key)).bytes;
        complete = true;
      }
      let tail: InspectOptions["tail"];
      if (!complete && sniff?.family === "zip") {
        const t = await getObjectBytes(key, `bytes=-${TAIL_BYTES}`);
        tail = { bytes: t.bytes, start: Math.max(0, total - t.bytes.length), totalSize: total };
      }
      const v = inspectUpload(fileName, head.contentType, bytes, { complete, tail });
      const entry: StoredFileSafety = {
        url,
        fileName,
        detectedType: v.detected?.label ?? null,
        declaredType: head.contentType,
        sizeBytes: total,
        blocked: v.block,
        flags: v.flags,
        ...(v.zip?.programFiles.length ? { programFiles: v.zip.programFiles.slice(0, 50) } : {}),
        ...(complete ? {} : { partial: true }),
      };
      if (opts.scan !== false && complete && !v.block.length && shouldMalwareScan(v)) {
        const scan = await malwareScan(bytes, v.sha256);
        if (scan.length) entry.scan = scan;
        const hit = scan.find((s) => s.status === "malicious");
        if (hit) entry.flags.push(`malware scan (${hit.engine}): ${hit.detail ?? "malicious"}`);
      }
      files.push(entry);
    } catch (e) {
      console.error("[upload-safety] could not inspect stored file", key, e);
    }
  }
  if (!files.length) return null;
  return {
    checkedAt: new Date().toISOString(),
    policy,
    files,
    blocked: files.some((f) => f.blocked.length > 0),
    flagged: files.some((f) => f.flags.length > 0),
  };
}

/** Raise the signals for a stored-files check (after the entity exists). */
export function reportStoredFiles(s: StoredFilesSafety, ctx: Omit<UploadContext, "fileName">): void {
  for (const f of s.files) {
    if (!f.blocked.length && !f.flags.length) continue;
    const blocked = f.blocked.length > 0;
    if (!blocked && s.policy === "allow") continue;
    const malware = f.flags.some((x) => x.startsWith("malware scan"));
    raiseAbuseSignal({
      kind: blocked ? "UPLOAD_BLOCKED" : "UPLOAD_SUSPICIOUS",
      severity: blocked || malware || !!f.programFiles?.length ? "HIGH" : "MEDIUM",
      userId: ctx.userId ?? null,
      entityType: ctx.entityType ?? "upload",
      entityId: ctx.entityId ?? null,
      summary: `${blocked ? "File refused" : s.policy === "block" ? "File refused (policy)" : "File flagged for review"} (${ctx.where}): "${f.fileName}" — ${(f.blocked[0] ?? f.flags[0])}`,
      evidence: {
        fileName: f.fileName,
        url: f.url,
        where: ctx.where,
        declaredType: f.declaredType,
        detectedType: f.detectedType,
        reasons: [...f.blocked, ...f.flags],
        programFiles: f.programFiles ?? [],
        scan: f.scan ?? [],
        policy: s.policy,
      },
    });
  }
}

/* ───────────────────────── Serve-side headers ───────────────────────── */

const INLINE_IMAGE = /^image\/(jpeg|jpg|pjpeg|png|gif|webp|avif|bmp|tiff|x-icon|vnd\.microsoft\.icon|heic|heif)$/;

/**
 * Headers for streaming a stored object from OUR origin. Images, video, audio
 * and PDF stay inline (the app displays them); SVG stays inline for <img> but
 * is sandboxed so a direct visit can't run script; anything else is forced to
 * download as opaque bytes. `nosniff` everywhere so a mislabelled file can't
 * be re-interpreted as HTML by the browser.
 */
export function safeServeHeaders(contentType: string | null | undefined, key: string): Record<string, string> {
  const ct = (contentType || "application/octet-stream").toLowerCase().split(";")[0].trim();
  const h: Record<string, string> = { "X-Content-Type-Options": "nosniff" };
  if (INLINE_IMAGE.test(ct) || ct.startsWith("video/") || ct.startsWith("audio/")) {
    h["Content-Type"] = ct;
    return h;
  }
  if (ct === "application/pdf") {
    h["Content-Type"] = ct;
    return h;
  }
  if (ct === "image/svg+xml") {
    h["Content-Type"] = ct;
    h["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
    return h;
  }
  const base = (key.split("/").pop() || "download").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 150) || "download";
  h["Content-Type"] = "application/octet-stream";
  h["Content-Disposition"] = `attachment; filename="${base}"`;
  h["Content-Security-Policy"] = "default-src 'none'; sandbox";
  return h;
}
