import "server-only";
import { CRAWLER_UA, guardUrl } from "@/lib/safe-fetch";
import type { PageContent } from "@/lib/link-verify";

/**
 * Short links on a post, resolved to where they point.
 *
 * X rewrites EVERY link in a post to `https://t.co/…`, so a post that does
 * carry the required article link only ever shows the t.co one to a reader of
 * the page — and the "contains link" rule failed on every honest X submission
 * (2026-10-29: a correct post was auto-rejected). LinkedIn (lnkd.in) and
 * people pasting bit.ly-style links hit the same wall.
 *
 * Only hosts on this fixed list are asked, and only for their redirect
 * header: the destination is never fetched, so this cannot be pointed at
 * anything the verifier would not already read. Every hop still goes through
 * the SSRF guard.
 */
const SHORTENERS = new Set([
  "t.co",
  "lnkd.in",
  "bit.ly",
  "buff.ly",
  "ow.ly",
  "dlvr.it",
  "tinyurl.com",
  "is.gd",
  "rebrand.ly",
  "cutt.ly",
  "rb.gy",
  "tiny.cc",
  "shorturl.at",
  "fb.me",
]);

/** A post rarely carries more than a couple; a page full of them is not worth a request each. */
const MAX_LINKS = 8;
/** t.co → bit.ly → article is the longest chain seen in practice. */
const MAX_HOPS = 3;
const TIMEOUT_MS = 4000;

function hostOf(u: URL) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

export function isShortLink(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? SHORTENERS.has(hostOf(u)) : false;
  } catch {
    return false;
  }
}

/** Where one short link points, from its redirect header — or null. */
async function redirectTarget(u: URL): Promise<URL | null> {
  if (!SHORTENERS.has(hostOf(u))) return null;
  await guardUrl(u);
  const res = await fetch(u, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": CRAWLER_UA },
  });
  await res.body?.cancel().catch(() => {});
  if (res.status < 300 || res.status >= 400) return null;
  const loc = res.headers.get("location");
  if (!loc) return null;
  const next = new URL(loc, u);
  return next.protocol === "https:" || next.protocol === "http:" ? next : null;
}

/** Every address a short link leads through, ending at the real one. */
async function resolveChain(raw: string): Promise<string[]> {
  const out: string[] = [];
  let cur = new URL(raw);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const next = await redirectTarget(cur).catch(() => null);
    if (!next) break;
    out.push(next.toString());
    if (!SHORTENERS.has(hostOf(next))) break;
    cur = next;
  }
  return out;
}

/**
 * The page with its short links' destinations added to `links`, so a
 * required link matches whether the post shows it in full or shortened. The
 * short links themselves stay. A link that cannot be resolved changes nothing.
 */
export async function expandShortLinks(page: PageContent): Promise<PageContent> {
  const shorts = page.links.filter(isShortLink).slice(0, MAX_LINKS);
  if (!shorts.length) return page;
  const resolved = (await Promise.all(shorts.map((s) => resolveChain(s).catch(() => [])))).flat();
  if (!resolved.length) return page;
  return { ...page, links: [...new Set([...page.links, ...resolved])] };
}
