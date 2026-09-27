import "server-only";
import type { Metadata } from "next";
import { getSeoSettings, seoImage } from "@/lib/seo-settings";

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
 * Titles go through the root template ("%s | EarnGPT"), so a title here must
 * NOT carry the brand again.
 */
export async function pageMeta(o: {
  title: string;
  description: string;
  /** Path on this site, e.g. "/about". */
  path: string;
  type?: "website" | "article";
  /** ISO dates, for articles. */
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  /** A page-specific share image; defaults to the site's. */
  image?: string;
  /** Keep out of search results (still followed). */
  noindex?: boolean;
}): Promise<Metadata> {
  const s = await getSeoSettings().catch(() => null);
  const siteName = s?.["seo.site_name"] || "EarnGPT";
  const image = o.image ?? seoImage(s?.["seo.og_image_url"] ?? "", "/icon-512.png");
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: {
      type: o.type ?? "website",
      url: o.path,
      siteName,
      title: o.title,
      description: o.description,
      images: [{ url: image, alt: o.title }],
      ...(o.type === "article"
        ? { publishedTime: o.publishedTime, modifiedTime: o.modifiedTime, authors: o.authors }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: o.title,
      description: o.description,
      images: [image],
    },
    ...(o.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
