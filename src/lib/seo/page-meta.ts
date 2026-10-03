import "server-only";
import type { Metadata } from "next";
import { getSeoSettings, seoImage } from "@/lib/seo-settings";
import { SITE_URL, absUrl, canonicalPath } from "@/lib/seo/site-url";
import { ogCard, ogGenerated, ogImageFor, ogStoredImage, type OgImage } from "@/lib/seo/og-image";

/**
 * Metadata for one public page: its own canonical URL, OpenGraph and Twitter
 * card — with the site's share image.
 *
 * Two things this replaces:
 *  - The root layout set `canonical: "/"`, and every page without its own
 *    inherited it — telling Google that /about, /blog, /terms… were all
 *    copies of the home page, so they were left out of the index.
 *  - A page that set `openGraph` without `images` dropped the site image
 *    (Next replaces nested metadata objects, it does not merge them), so
 *    its shares showed no picture.
 *
 * Titles go through the root template ("%s | RevType"), so a title here must
 * NOT carry the brand again.
 */
export type PageMetaInput = {
  /** The page's own title, WITHOUT the brand — the template adds it. */
  title: string;
  description?: string;
  /** Path on this site, e.g. "/about". */
  path: string;
  /** `title` is already the whole title (the home page): no template. */
  absoluteTitle?: boolean;
  type?: "website" | "article";
  /** ISO dates, for articles. */
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  /**
   * The page's own picture (a stored image URL / key path). `undefined` →
   * the site share image; `null` → the page has none, so it gets the branded
   * card with its title. A picture that is not one of our stored files is
   * never fetched — the card is used instead (lib/seo/og-image.ts).
   */
  image?: string | null;
  /** Alt text for the share image (default: the full title). */
  imageAlt?: string;
  /** Small line above the title on the generated card (section, price…). */
  cardKicker?: string | null;
  /**
   * A first-party generated 1200×630 JPEG on this site (a path), used as-is —
   * the shared post's text card (`/post/<id>/opengraph-image`). Named
   * explicitly rather than left to the file convention, which resolves to
   * localhost in `next dev` and adds no width/height/alt we control.
   */
  generatedImage?: string;
  /** Keep out of search results (still followed). */
  noindex?: boolean;
  /** Full robots override (index pages with filter queries). Wins over `noindex`. */
  robots?: { index: boolean; follow: boolean };
  /**
   * A canonical other than `path`: an absolute URL is kept exactly (an
   * article first published elsewhere, or `?page=2` of an index), a path is
   * made canonical.
   */
  canonical?: string;
  /** Search keywords (articles: focus keyword + tags). */
  keywords?: string[];
};

/**
 * The rendered title for a page — the one string that becomes <title>,
 * og:title and twitter:title alike.
 */
export function fullTitle(title: string, template: string, siteName: string, absolute?: boolean): string {
  const t = title.trim();
  if (absolute || !t) return t || siteName;
  const tpl = template.includes("%s") ? template : `%s | ${siteName}`;
  // A title that already ends with the brand is not branded twice.
  return t.toLowerCase().endsWith(siteName.toLowerCase()) ? t : tpl.replace("%s", t);
}

/**
 * ONE object → every title/description/image tag on the page.
 *
 * <title>, meta description, og:title/og:description and twitter:title/
 * twitter:description are all written from the same two strings here, so
 * Google, Bing, Facebook, WhatsApp, X and LinkedIn show the same words. The
 * title is emitted `absolute` (already templated), so the root layout's
 * template cannot make <title> differ from og:title.
 */
export async function pageMeta(o: PageMetaInput): Promise<Metadata> {
  const s = await getSeoSettings().catch(() => null);
  const siteName = s?.["seo.site_name"] || "RevType";
  const title = fullTitle(o.title, s?.["seo.title_template"] || "%s | RevType", siteName, o.absoluteTitle);
  const description = o.description?.trim() || undefined;
  // Absolute, query-free, no trailing slash — the one address every variant
  // (?utm_…, ?ref=…, /about/) is folded into. An absolute canonical (off-site
  // original, or an index's ?page=N) is kept exactly as given.
  const path = canonicalPath(o.path);
  const canonical =
    o.canonical && /^https?:\/\//i.test(o.canonical) ? o.canonical : absUrl(canonicalPath(o.canonical || path));
  const ogUrl = canonical.startsWith(`${SITE_URL}/`) || canonical === SITE_URL ? canonical : absUrl(path);
  // Next REPLACES a nested metadata object rather than merging it, so a page
  // that sets `twitter` loses the root layout's twitter:site (/admin/seo →
  // Twitter handle) unless it is restated here.
  const handle = (s?.["seo.twitter_handle"] ?? "").replace(/^@/, "").trim();
  const alt = o.imageAlt?.trim() || title;
  const image: OgImage = o.generatedImage
    ? ogGenerated(o.generatedImage, alt)
    : o.image === undefined
      ? siteShareImage(s?.["seo.og_image_url"] ?? "", { title: o.absoluteTitle ? "" : o.title, alt, kicker: o.cardKicker })
      : ogImageFor(o.image, { title: o.title, alt, kicker: o.cardKicker });
  const robots = o.robots ?? (o.noindex ? { index: false, follow: true } : undefined);
  return {
    title: { absolute: title },
    ...(description ? { description } : {}),
    alternates: { canonical },
    ...(o.keywords?.length ? { keywords: o.keywords } : {}),
    openGraph: {
      type: o.type ?? "website",
      locale: "en_US",
      url: ogUrl,
      siteName,
      title,
      ...(description ? { description } : {}),
      images: [image],
      ...(o.type === "article"
        ? { publishedTime: o.publishedTime, modifiedTime: o.modifiedTime, authors: o.authors }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      ...(description ? { description } : {}),
      images: [{ url: image.url, alt: image.alt }],
      ...(handle ? { site: `@${handle}` } : {}),
    },
    ...(robots ? { robots } : {}),
  };
}

/**
 * The site's share image: the owner's upload (/admin/seo), resized to
 * 1200×630, when it is one of our stored files; otherwise the branded card
 * with this page's title.
 */
export function siteShareImage(
  setting: string,
  o: { title: string; alt: string; kicker?: string | null }
): OgImage {
  return ogStoredImage(seoImage(setting, ""), o.alt) ?? ogCard(o.title, o.alt, o.kicker);
}
