import "server-only";
import { cache } from "react";
import { getSetting } from "@/lib/system-settings";
import { mediaSrc } from "@/lib/media-url";
import { OFFICIAL_SOCIAL_PROFILES, OFFICIAL_X_HANDLE } from "@/lib/seo/social-profiles";

/**
 * Site identity, search appearance, verification, the Knowledge Panel entity,
 * tracking tags and custom code — everything the owner used to have to ask a
 * developer to change, edited at /admin/seo.
 *
 * All of it used to be hard-coded in app/layout.tsx. Every key has a default
 * equal to what was hard-coded, so an empty settings table renders the site
 * exactly as before.
 */

export const SEO_DEFAULTS = {
  "seo.site_name": "RevType",
  // The home page's title and description — what Google shows for the site.
  "seo.default_title": "RevType — Earn Money Online with Tasks, Videos, Surveys & Courses",
  "seo.title_template": "%s | RevType",
  // ≤155 chars (what Google shows uncut) and strictly factual — no income
  // promises. The stored /admin/seo value wins over this default.
  "seo.description":
    "RevType: paid micro-tasks, a digital marketplace for products and services, and online courses. Earn from completed tasks, sales, referrals and affiliates.",
  "seo.keywords":
    "micro tasks, freelance micro-tasks, online side work, digital marketplace, sell digital products, freelance services, online courses, affiliate program, referral program",
  "seo.logo_url": "/icon-512.png",
  "seo.favicon_url": "/icon-192.png",
  "seo.apple_icon_url": "/apple-touch-icon.png",
  "seo.og_image_url": "/icon-512.png",
  // Logo height in px — the marketing site (navbar, footer, sign-in, legal)
  // and the app (sidebar, top bar). Bounds in LOGO_HEIGHT_RANGE.
  "seo.logo_height_site": "44",
  "seo.logo_height_app": "40",
  "seo.twitter_handle": OFFICIAL_X_HANDLE,
  "seo.indexing": true,

  "seo.verify_google": "",
  "seo.verify_bing": "",
  "seo.verify_facebook": "",
  "seo.verify_pinterest": "",
  "seo.verify_yandex": "",

  "seo.org_type": "Organization",
  "seo.org_legal_name": "",
  "seo.org_description":
    "RevType is a platform for paid micro-tasks, a digital marketplace for products and services, and online courses.",
  "seo.org_founding_date": "",
  "seo.org_email": "",
  "seo.org_phone": "",
  "seo.org_address": "",
  "seo.org_country": "",
  // The official profiles (lib/seo/social-profiles.ts), one per line.
  "seo.org_same_as": OFFICIAL_SOCIAL_PROFILES.join("\n"),

  "tracking.ga4_id": "",
  "tracking.gtm_id": "",
  "tracking.google_ads_id": "",
  "tracking.fb_pixel_id": "",
  "tracking.pinterest_tag_id": "",
  "tracking.tiktok_pixel_id": "",
  "tracking.scope": "all",

  "code.head": "",
  "code.body": "",
  "code.scope": "public",
} as const;

export type SeoKey = keyof typeof SEO_DEFAULTS;
export const SEO_KEYS = Object.keys(SEO_DEFAULTS) as SeoKey[];

/**
 * Format checks for the IDs a tag is built from. An ID is pasted into a
 * script URL, so anything that does not match its exact shape is refused —
 * that is what keeps a typo (or a pasted snippet) from breaking every page.
 */
export const ID_FORMATS: Partial<Record<SeoKey, { re: RegExp; example: string }>> = {
  "tracking.ga4_id": { re: /^G-[A-Z0-9]{4,16}$/, example: "G-XXXXXXXXXX" },
  "tracking.gtm_id": { re: /^GTM-[A-Z0-9]{4,12}$/, example: "GTM-XXXXXXX" },
  "tracking.google_ads_id": { re: /^AW-\d{6,14}$/, example: "AW-1234567890" },
  "tracking.fb_pixel_id": { re: /^\d{8,20}$/, example: "123456789012345" },
  "tracking.pinterest_tag_id": { re: /^\d{8,20}$/, example: "2612345678901" },
  "tracking.tiktok_pixel_id": { re: /^[A-Z0-9]{10,30}$/, example: "C1ABCDEFGHIJKLMNOPQR" },
  "seo.verify_google": { re: /^[A-Za-z0-9_-]{20,80}$/, example: "the content= value only" },
  "seo.verify_bing": { re: /^[A-Fa-f0-9]{16,64}$/, example: "the content= value only" },
  "seo.verify_facebook": { re: /^[a-z0-9]{16,64}$/, example: "the content= value only" },
  "seo.verify_pinterest": { re: /^[a-f0-9]{16,64}$/, example: "the content= value only" },
  "seo.verify_yandex": { re: /^[a-f0-9]{8,64}$/, example: "the content= value only" },
};

/** Keys only a super admin may change: raw code runs on every visitor's page. */
export const SUPER_ONLY_KEYS: SeoKey[] = ["code.head", "code.body", "code.scope"];

export type SeoSettings = { [K in SeoKey]: (typeof SEO_DEFAULTS)[K] extends boolean ? boolean : string };

/**
 * One read per request. The root layout's metadata, its body, the page's own
 * metadata (pageMeta) and the JSON-LD all ask for these; `cache()` makes that
 * one call. Each key is also in getSetting's in-memory cache with an
 * Accelerate cacheStrategy behind it, so a crawler hit is not a DB query.
 */
export const getSeoSettings = cache(loadSeoSettings);

async function loadSeoSettings(): Promise<SeoSettings> {
  const values = await Promise.all(
    SEO_KEYS.map((k) => getSetting<unknown>(k, SEO_DEFAULTS[k]).catch(() => SEO_DEFAULTS[k]))
  );
  const out = {} as Record<SeoKey, unknown>;
  SEO_KEYS.forEach((k, i) => {
    const d = SEO_DEFAULTS[k];
    const v = values[i];
    // A BLANK stored string falls back to the default. The /admin/seo form
    // saves every field, so a field left empty was stored as "" — and "" for
    // the site name put `"name": ""` on the Organization, WebSite and
    // WebApplication markup on every page (2026-10-04): the brand had no name
    // in Google's entity graph. A key whose default is "" is unaffected.
    out[k] =
      typeof d === "boolean"
        ? v !== false && v !== "false"
        : typeof v === "string"
          ? v.trim() || d
          : String(v ?? d);
  });
  // An ID that fails its format (typed before validation existed, say) is
  // treated as empty rather than injected.
  for (const [k, f] of Object.entries(ID_FORMATS) as Array<[SeoKey, { re: RegExp }]>) {
    const v = String(out[k] ?? "").trim();
    out[k] = v && f.re.test(v) ? v : "";
  }
  return out as SeoSettings;
}

/** A settings image URL made safe to serve (private bucket → same-origin proxy). */
export function seoImage(v: string, fallback: string): string {
  const s = (v || "").trim();
  if (!s) return fallback;
  return mediaSrc(s) || fallback;
}

/** The social profile links for the Knowledge Panel (`sameAs`), one per line. */
export function sameAsList(v: string): string[] {
  return v
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter((x) => /^https:\/\/[^\s]+$/.test(x))
    .slice(0, 20);
}
