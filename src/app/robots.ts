import type { MetadataRoute } from "next";
import { getSetting } from "@/lib/system-settings";
import { SITE_URL } from "@/lib/seo/site-url";
import { ROBOTS_DISALLOW } from "@/lib/seo/indexing-policy";

// One settings read an hour at most (getSetting is itself cached in memory).
export const revalidate = 3600;

/**
 * Search engines and AI engines, named. `*` already lets every one of them
 * in, but several only act on a group that names them, and naming them states
 * the owner's intent: the public pages — and /llms.txt, the summary written
 * for them — may be crawled, indexed and cited.
 *
 * A crawler obeys ONLY the most specific group that matches it, so each named
 * group carries the full allow/disallow list (they are all the same list).
 */
const NAMED_BOTS = [
  // Search
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  "YandexBot",
  // AI search / answers / training opt-in
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
  "CCBot",
  "meta-externalagent",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // "Allow search engines" off at /admin/seo (e.g. while the site is being
  // set up): every crawler is asked to stay out, matching the noindex tag.
  const indexing = await getSetting<boolean>("seo.indexing", true).catch(() => true);
  if (indexing === false) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  // `/api/media/` is carved back out of the `/api` block, and it is not an
  // oversight. Post images are stored as `/api/media/<key>` (the bucket is
  // private and 403s directly — see the media proxy), so that is the path a
  // shared post's `og:image` and the site share image point at. Facebook's and
  // LinkedIn's unfurlers honour robots.txt when fetching og:image. The longer,
  // more specific `allow` wins over the shorter `disallow`. `/api/og/` is the
  // same case: every og:image / twitter:image is a resized share image served
  // there, and Twitterbot will not show an image robots.txt blocks.
  const allow = ["/", "/api/media/", "/api/og/"];
  const disallow = [...ROBOTS_DISALLOW];
  return {
    rules: [
      { userAgent: NAMED_BOTS, allow, disallow },
      { userAgent: "*", allow, disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
