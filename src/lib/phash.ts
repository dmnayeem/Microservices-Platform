import { Jimp } from "jimp";

/**
 * Perceptual image hashing for screenshot-reuse fraud detection.
 *
 * The existing SHA-256 byte-hash only catches a byte-identical re-upload. A
 * fraudster who re-encodes, crops, or lightly edits a screenshot changes every
 * byte yet keeps the image visually the same — a perceptual hash still matches
 * because it hashes the downscaled luma structure, not the raw bytes.
 */

/** Bits that may differ (out of 64) before two screenshots count as the same. */
export const PHASH_HAMMING_THRESHOLD = 10;

/**
 * Below this many set (or unset) bits the image is near-uniform (a solid colour
 * or smooth gradient) — its perceptual hash collapses toward all-zeros and would
 * collide with every other low-detail image, causing false-positive matches. We
 * skip perceptual matching for those (the exact byte-hash still guards them).
 */
const MIN_HASH_BIT_BALANCE = 4;

/**
 * 64-bit perceptual hash as a fixed-length binary string. Returns null if the
 * bytes aren't a decodable image, OR if the image is too low-detail for the hash
 * to carry a reliable signal. Padded to 64 chars so Hamming comparison lines up
 * regardless of leading-zero trimming.
 */
export async function perceptualHash(bytes: Buffer): Promise<string | null> {
  try {
    const img = await Jimp.read(bytes);
    const hash = img.hash(2).padStart(64, "0");
    const ones = hash.split("").filter((c) => c === "1").length;
    if (ones < MIN_HASH_BIT_BALANCE || ones > 64 - MIN_HASH_BIT_BALANCE) {
      return null; // near-uniform → hash unreliable, skip perceptual matching
    }
    return hash;
  } catch {
    return null;
  }
}

/** Hamming distance between two equal-length binary hash strings. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}
