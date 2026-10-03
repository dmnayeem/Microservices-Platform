/**
 * The public catalog: which marketplace and course pages a logged-out visitor
 * (and a search engine) may open, plus the small helpers those pages share.
 *
 * Edge-safe on purpose — no imports. The auth middleware (`authorized()` in
 * lib/auth/config.ts) and the (main) layout both call `isPublicCatalogPath`,
 * and the two must agree: the middleware decides whether a guest reaches the
 * route at all, the layout decides whether to draw the guest shell instead of
 * redirecting.
 *
 * These are EXACT patterns, not prefixes. `publicRoutes` in the auth config is
 * prefix-matched, so adding "/marketplace" there would also have opened the
 * cart, the orders page, seller messages and the create-listing flow. Every
 * private page that lives under /marketplace or /courses is listed in
 * `MARKETPLACE_PRIVATE_SEGMENTS` / the course patterns below and stays behind
 * the login — scripts/verify-public-catalog.ts checks this list against the
 * folders that actually exist.
 */

/** Static folders under /marketplace that are private flows — never public. */
export const MARKETPLACE_PRIVATE_SEGMENTS = [
  "cart",
  "create",
  "messages",
  "my",
  "orders",
] as const;

/** Static folders under /marketplace that are public catalog pages. */
const MARKETPLACE_PUBLIC_STATIC = ["section", "brand"] as const;

const ID_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * True for the browse / category / brand / detail pages of the marketplace
 * and of courses. Nothing else: not the cart, checkout, orders, deals,
 * messages, create-listing, my-learning, the lesson player (/learn) or the
 * course creator (/course-creator, /tutor).
 */
export function isPublicCatalogPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/marketplace" || p === "/courses") return true;

  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "marketplace") {
    // /marketplace/section/<slug>, /marketplace/brand/<slug>
    if (parts.length === 3 && (MARKETPLACE_PUBLIC_STATIC as readonly string[]).includes(parts[1])) {
      return ID_SEGMENT.test(parts[2]);
    }
    // /marketplace/<listingId> — but not a private static folder
    if (parts.length === 2) {
      const seg = parts[1];
      if ((MARKETPLACE_PRIVATE_SEGMENTS as readonly string[]).includes(seg)) return false;
      if ((MARKETPLACE_PUBLIC_STATIC as readonly string[]).includes(seg)) return false;
      return ID_SEGMENT.test(seg);
    }
    return false;
  }
  if (parts[0] === "courses") {
    // /courses/category/<slug>
    if (parts.length === 3 && parts[1] === "category") return ID_SEGMENT.test(parts[2]);
    // /courses/<slugOrId>
    if (parts.length === 2 && parts[1] !== "category") return ID_SEGMENT.test(parts[1]);
    return false;
  }
  return false;
}

/** The production origin used in canonicals, og:url and JSON-LD. */
export const CATALOG_ORIGIN = (() => {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\//.test(raw) && !/localhost|127\.0\.0\.1/.test(raw) ? raw : "https://revtype.com";
})();

/** Absolute canonical URL for a path (no query string, ever). */
export function canonicalUrl(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  return `${CATALOG_ORIGIN}${clean.startsWith("/") ? "" : "/"}${clean}`;
}

/** Where a guest goes to act on this page; they come back to it afterwards. */
export function loginHref(path: string): string {
  return `/login?callbackUrl=${encodeURIComponent(path)}`;
}

export function registerHref(path: string): string {
  return `/register?callbackUrl=${encodeURIComponent(path)}`;
}

/**
 * Plain-text summary for meta descriptions: HTML and markdown markers
 * stripped, whitespace collapsed, cut on a word boundary at `max` chars.
 */
export function plainSummary(input: string | null | undefined, max = 155): string {
  const text = String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Page number from `?page=`, clamped to 1..500. */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 500) : 1;
}

export const CATALOG_PAGE_SIZE = 24;

/**
 * Query keys that never make a different page. The same list as
 * `TRACKING_PARAMS` in lib/seo/site-url.ts — repeated, not imported, because
 * this file stays import-free (scripts/verify-seo.ts checks they agree).
 */
export const CATALOG_TRACKING_PARAMS = /^(utm_[a-z_]+|ref|src|fbclid|gclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|ttclid|twclid|li_fat_id)$/i;

/**
 * Canonical + robots for an index / category page.
 *  - page 1 → canonical is the bare path (a `?page=1` is folded into it);
 *  - page N → self-canonical `path?page=N`, indexable;
 *  - any other query (filters, sort, search, tracking) → canonical to the
 *    clean page and `noindex, follow`, so filtered copies never compete with
 *    the real page but their links are still followed.
 */
export function indexPageSeo(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>
): { page: number; canonical: string; robots: { index: boolean; follow: boolean } } {
  const page = pageParam(searchParams.page);
  // Tracking tags (?utm_…, ?fbclid= from a Facebook share, ?ref=) are not a
  // filter: the page they land on is the same page and must stay indexable.
  const extra = Object.keys(searchParams).filter(
    (k) => k !== "page" && searchParams[k] !== undefined && !CATALOG_TRACKING_PARAMS.test(k)
  );
  const canonical = canonicalUrl(basePath) + (page > 1 ? `?page=${page}` : "");
  return { page, canonical, robots: { index: extra.length === 0, follow: true } };
}
