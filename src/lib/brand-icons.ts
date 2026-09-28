import { SEO_DEFAULTS, seoImage, type SeoSettings } from "@/lib/seo-settings";

/**
 * The brand images set at /admin/seo — logo, favicon, home-screen icon — and
 * whether each one is the admin's upload or still the stock file. Client-safe.
 */

type S = Pick<SeoSettings, "seo.logo_url" | "seo.favicon_url" | "seo.apple_icon_url">;

const isCustom = (v: string | undefined, def: string) => !!v && v.trim() !== "" && v.trim() !== def;

export const customFavicon = (s: S) => isCustom(s["seo.favicon_url"], SEO_DEFAULTS["seo.favicon_url"]);
export const customLogo = (s: S) => isCustom(s["seo.logo_url"], SEO_DEFAULTS["seo.logo_url"]);

/** The uploaded logo, ready for an <img>, or null while it is the stock one. */
export function logoSrc(s: S): string | null {
  return customLogo(s) ? seoImage(s["seo.logo_url"], "") || null : null;
}

/**
 * The home-screen icon source: the uploaded "Apple / home-screen icon", else
 * the uploaded logo, else null (the stock icons).
 */
export function homeIconSource(s: S): string | null {
  if (isCustom(s["seo.apple_icon_url"], SEO_DEFAULTS["seo.apple_icon_url"])) return s["seo.apple_icon_url"].trim();
  if (customLogo(s)) return s["seo.logo_url"].trim();
  return null;
}

/** Short, stable tag of a string — changes when the uploaded image does. */
export function versionOf(v: string): string {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STOCK: Record<number, string> = { 180: "/apple-touch-icon.png", 192: "/icon-192.png", 512: "/icon-512.png" };

/** URL of the home-screen icon at an exact size (the resize route), or the stock file. */
export function homeIconUrl(s: S, size: 180 | 192 | 512): string {
  const src = homeIconSource(s);
  return src ? `/app-icon/${size}?v=${versionOf(src)}` : STOCK[size];
}

/**
 * The Android "maskable" icon: the same mark with a safe margin, because the
 * launcher crops the outer ~20% into a circle or squircle. Serving the
 * full-bleed icon here cut the edges of the logo off on the home screen.
 */
export function maskableIconUrl(s: S): string {
  const src = homeIconSource(s);
  return src ? `/app-icon/512m?v=${versionOf(src)}` : "/icon-512-maskable.png";
}
