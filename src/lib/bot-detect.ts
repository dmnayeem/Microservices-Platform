import { headers } from "next/headers";

/**
 * Is this request an automated client rather than a person?
 *
 * Two places need the same answer, and they must not drift apart:
 *
 *  - Ad impressions are counted server-side at delivery, so every crawler that
 *    loads a page counts as a view. With 123 users this platform had recorded
 *    16,506 impressions against 210 deduplicated, user-attributed views — the
 *    gap is unattributed traffic, and search and preview crawlers are a large,
 *    identifiable part of it. An impression nobody saw is not inventory the
 *    owner can sell, and it drags every CTR on the report down with it.
 *  - Signup, where an automated registration is the thing worth knowing about
 *    before the account starts earning.
 *
 * This is deliberately a plain user-agent test. It catches the honest bots —
 * search engines, link previewers, monitoring, scripted HTTP clients — which
 * are the bulk of the noise and which all identify themselves. It does NOT
 * catch a headless browser that spoofs a real user agent, and nothing at this
 * layer can: that is what the per-IP caps, trust score and spot-check gate are
 * for. Treating this as a security control would be the mistake; it is a
 * data-quality filter that also happens to flag the obvious cases at signup.
 */

/**
 * Tokens that appear in the user agent of clients that are not a person
 * reading a page. Lower-cased substring match.
 *
 * `bot`, `crawl` and `spider` cover most of the long tail on their own. The
 * named entries are the ones that do NOT contain those words — each would be
 * missed by the generic tokens alone.
 */
const BOT_TOKENS = [
  // Generic, and the widest net.
  "bot",
  "crawl",
  "spider",
  // Search and social preview fetchers with no generic token.
  "slurp", // Yahoo
  "duckduckgo",
  "baiduspider",
  "yandex",
  "facebookexternalhit",
  "whatsapp",
  "telegrambot",
  "skypeuripreview",
  "embedly",
  "quora link preview",
  "pinterestbot",
  "redditbot",
  "discordbot",
  "vkshare",
  "tumblr",
  "flipboard",
  "nuzzel",
  "outbrain",
  // Scripted HTTP clients — a page fetched by one of these was not read.
  "curl/",
  "wget",
  "python-requests",
  "python-urllib",
  "httpclient",
  "okhttp",
  "axios/",
  "node-fetch",
  "go-http-client",
  "java/",
  "libwww-perl",
  "postmanruntime",
  "insomnia",
  // Headless automation that still announces itself.
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  // Uptime and preview services.
  "pingdom",
  "uptimerobot",
  "statuscake",
  "lighthouse",
  "gtmetrix",
  "chrome-lighthouse",
  "vercel-screenshot",
  "prerender",
] as const;

/** True when the user-agent string identifies an automated client. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) {
    // No user agent at all. A browser always sends one; a script often does
    // not. Counting these as bots is the safer default for a metric the owner
    // is trying to trust.
    return true;
  }
  const s = ua.toLowerCase();
  return BOT_TOKENS.some((t) => s.includes(t));
}

/**
 * The same test for the current request, read from its headers.
 *
 * Returns `false` when there is no request to read — a script, a background
 * job, a build-time render. Those are not bot traffic, and guessing "bot"
 * there would silently stop counting impressions in contexts that never had a
 * user agent to begin with.
 */
export async function isBotRequest(): Promise<boolean> {
  try {
    const h = await headers();
    return isBotUserAgent(h.get("user-agent"));
  } catch {
    return false;
  }
}
