/**
 * The site's canonical origin for SEO output — metadataBase, canonical URLs,
 * robots.txt, the sitemap, llms.txt and JSON-LD.
 *
 * `NEXT_PUBLIC_APP_URL` when it is a real public https origin, otherwise
 * https://revtype.com. A localhost / container value (a dev .env copied to a
 * server, say) must never reach a canonical tag or a sitemap: Google would be
 * told the real page lives on a machine it cannot reach.
 */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;
const FALLBACK = "https://revtype.com";

function resolve(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!raw) return FALLBACK;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || LOCAL.test(u.host)) return FALLBACK;
    // Apex only: middleware 308s www → apex, so a www canonical would point
    // every page at a redirect.
    return `https://${u.host.replace(/^www\./i, "")}`;
  } catch {
    return FALLBACK;
  }
}

export const SITE_URL = resolve();

/** Absolute URL on the site for a path ("/about") or an already-absolute URL. */
export function absUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl || "/", SITE_URL).toString();
}

/**
 * Query parameters that never make a different page — tracking tags and the
 * referral code. A canonical never carries them (see `canonicalPath`).
 */
export const TRACKING_PARAMS = /^(utm_[a-z_]+|ref|src|fbclid|gclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|ttclid|twclid|li_fat_id)$/i;

/**
 * A path made canonical: no query string, no hash, no trailing slash (except
 * the home page). Next's `trailingSlash` is off, so "/about/" already 308s to
 * "/about" — the canonical must agree with that.
 */
export function canonicalPath(path: string): string {
  const p = (path || "/").split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : "/";
}
