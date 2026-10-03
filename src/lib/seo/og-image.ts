import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ownMediaKey } from "@/lib/media-url";
import { absUrl } from "@/lib/seo/site-url";

/**
 * Share images (og:image / twitter:image) that every unfurler can show.
 *
 * Facebook, WhatsApp, X, LinkedIn, Telegram, Pinterest and Discord all want a
 * ~1200×630 picture they can fetch fast; WhatsApp in particular shows NO
 * thumbnail when the file is much over ~300 KB. Our stored images are not
 * that: the owner's share banner is 4800×2520, product covers are whatever the
 * seller uploaded, and a raw CloudFront URL 403s (the bucket is private). So
 * every share image points at one of two first-party endpoints instead:
 *
 *   /api/og/img/<sig>/<s3 key>.jpg — a stored image, cover-cropped to 1200×630 JPEG
 *   /api/og/card.jpg?t=…&k=…&sig=… — a branded card with the page's own title
 *
 * Both end in `.jpg` so an unfurler that guesses the type from the URL guesses
 * right (the stored original may be .png/.webp).
 *
 * Both URLs are SIGNED here (HMAC of the exact input). The endpoints refuse
 * anything else, so they cannot be used to resize arbitrary bucket objects or
 * to print arbitrary text on an image served from our domain — only what our
 * own public-page metadata emitted. External image URLs are never fetched
 * (no SSRF): a page whose image is not one of our stored files gets the card.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Kept under WhatsApp's thumbnail ceiling with room to spare. */
export const OG_MAX_BYTES = 290 * 1024;
/** Text limits for the card — longer input is cut, never rejected. */
export const OG_TITLE_MAX = 110;
export const OG_KICKER_MAX = 60;

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "revtype-og-dev";
}

export function ogSign(input: string): string {
  return createHmac("sha256", secret()).update(`og:${input}`).digest("base64url").slice(0, 22);
}

export function ogVerify(input: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  const a = Buffer.from(ogSign(input));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

/** The S3 key behind a stored image, when it is one of ours on a public prefix. */
export function storedImageKey(src: string | null | undefined): string | null {
  const s = (src || "").trim();
  if (!s) return null;
  if (s.startsWith("/api/media/")) {
    const key = decodeURIComponent(s.slice("/api/media/".length).split(/[?#]/)[0]);
    return isServableKey(key) ? key : null;
  }
  const key = ownMediaKey(s);
  return key && isServableKey(key) ? key : null;
}

/**
 * Prefixes a share image may come from — the `/api/media` proxy's public set
 * minus `task-proofs/` (proof screenshots are never a page's cover).
 */
export function isServableKey(key: string): boolean {
  return (
    (key.startsWith("media/") || key.startsWith("posts/")) &&
    !key.includes("..") &&
    !key.includes("\\") &&
    /\.(jpe?g|png|webp|gif|avif)$/i.test(key)
  );
}

export type OgImage = {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  alt: string;
  type: string;
};

function image(path: string, alt: string): OgImage {
  const url = absUrl(path);
  return { url, secureUrl: url, width: OG_WIDTH, height: OG_HEIGHT, alt: clip(alt, 300), type: "image/jpeg" };
}

/** A stored image, resized for sharing. Null when `src` is not ours. */
export function ogStoredImage(src: string | null | undefined, alt: string): OgImage | null {
  const key = storedImageKey(src);
  if (!key) return null;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return image(`/api/og/img/${ogSign(key)}/${path}.jpg`, alt);
}

/** A share image another first-party route renders at 1200×630 JPEG. */
export function ogGenerated(path: string, alt: string): OgImage {
  return image(path, alt);
}

/** The branded title card. `kicker` is the small line above the title (a section, a price). */
export function ogCard(title: string, alt: string, kicker?: string | null): OgImage {
  const t = clip(title, OG_TITLE_MAX);
  const k = clip(kicker || "", OG_KICKER_MAX);
  const q = new URLSearchParams({ t });
  if (k) q.set("k", k);
  q.set("sig", ogSign(`${t}\n${k}`));
  return image(`/api/og/card.jpg?${q.toString()}`, alt);
}

/** A page's share image: its own stored image when it has one, else the card. */
export function ogImageFor(
  src: string | null | undefined,
  o: { title: string; alt: string; kicker?: string | null }
): OgImage {
  return ogStoredImage(src, o.alt) ?? ogCard(o.title, o.alt, o.kicker);
}
