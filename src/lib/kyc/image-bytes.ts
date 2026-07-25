// Server-side fetch of an uploaded KYC image (stored as a public CloudFront/S3
// URL) into bytes/base64 for OCR + face-match. No S3 keys needed — the URL is
// public. Guards size + content type.

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// SSRF guard: only fetch KYC images from our own storage/CDN. Extra hosts can be
// added via `KYC_IMAGE_HOSTS` (comma-separated host suffixes).
const ALLOWED_HOST_SUFFIXES = [
  ".amazonaws.com",
  ".cloudfront.net",
  ...(process.env.KYC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
];

function assertAllowedUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Unsupported URL scheme");
  }
  const host = u.hostname.toLowerCase();
  // Block private / loopback / metadata targets outright.
  if (
    host === "localhost" ||
    host === "169.254.169.254" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|fd|fe80)/i.test(host)
  ) {
    throw new Error("Blocked host");
  }
  const ok = ALLOWED_HOST_SUFFIXES.some(
    (s) => host === s.replace(/^\./, "") || host.endsWith(s)
  );
  if (!ok) throw new Error("Image host not allowed");
}

export interface ImagePayload {
  bytes: Uint8Array;
  base64: string;
  mime: string;
}

/** Fetch a remote image URL into bytes + base64. Throws on non-image / too big /
 *  disallowed host (SSRF guard). */
export async function fetchImage(url: string): Promise<ImagePayload> {
  assertAllowedUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "error" });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("URL is not an image");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("Empty image");
  if (buf.byteLength > MAX_BYTES) throw new Error("Image too large");
  return { bytes: buf, base64: Buffer.from(buf).toString("base64"), mime };
}
