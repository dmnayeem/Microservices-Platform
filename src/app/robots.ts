import type { MetadataRoute } from "next";
import { getSetting } from "@/lib/system-settings";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // "Allow search engines" off at /admin/seo (e.g. while the site is being
  // set up): every crawler is asked to stay out, matching the noindex tag.
  const indexing = await getSetting<boolean>("seo.indexing", true).catch(() => true);
  if (indexing === false) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        // `/api/media/` is carved back out of the `/api` block below, and it is
        // not an oversight. Post images are stored as `/api/media/<key>` (the
        // bucket is private and 403s directly — see the media proxy), so that is
        // the path a shared post's `og:image` points at. Facebook's and
        // LinkedIn's unfurlers DO honour robots.txt when fetching og:image, so
        // a blanket `/api` disallow means every shared post with a photo
        // unfurls with no picture. An ordering rule does the work: the longer,
        // more specific `allow` wins over the shorter `disallow`.
        allow: ["/", "/api/media/"],
        // Keep private/authed + admin surfaces out of the index.
        disallow: ["/admin", "/api", "/wallet", "/withdrawal", "/settings", "/no-access"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
