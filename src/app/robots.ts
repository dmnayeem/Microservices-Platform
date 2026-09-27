import type { MetadataRoute } from "next";
import { getSetting } from "@/lib/system-settings";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // "Allow search engines" off at /admin/seo (e.g. while the site is being
  // set up): every crawler is asked to stay out, matching the noindex tag.
  const indexing = await getSetting<boolean>("seo.indexing", true).catch(() => true);
  if (indexing === false) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const allow = ["/", "/api/media/"];
  const disallow = ["/admin", "/api", "/wallet", "/withdrawal", "/settings", "/no-access"];
  return {
    rules: [
      // AI search and answer engines, named (GEO). `*` already lets them in,
      // but several only act on a rule that names them, and naming them
      // states the intent: the public pages — and /llms.txt, the summary
      // written for them — may be read and cited in AI answers.
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-SearchBot",
          "Claude-User",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "Applebot-Extended",
          "Bingbot",
        ],
        allow,
        disallow,
      },
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
        allow,
        // Keep private/authed + admin surfaces out of the index.
        disallow,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
