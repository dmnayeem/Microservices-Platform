/**
 * Finding links in post text — one definition for the composer and the card.
 *
 * Both used to carry their own copy of `/https?:\/\/[^\s]+/`, which meant a post
 * containing `www.example.com` or `example.com/thing` produced neither a link
 * nor a preview: nothing matched, so nothing happened, silently. That is the
 * common case — people paste what they copied from the address bar, and browsers
 * hide the scheme.
 *
 * Client-safe: no imports, so the composer, the card and the server can all use
 * the same rule and agree on what counts as a link.
 */

/**
 * Domain endings a bare (scheme-less) match is allowed to have.
 *
 * A curated list rather than "any two-plus letters after a dot", because the
 * loose version turns ordinary prose into links: "the end.Next up", "version
 * 2.5beta", "file.txt". Everything here is a TLD people actually paste. A URL
 * WITH a scheme is not filtered by this at all — if someone types https://, they
 * meant a link.
 */
const BARE_TLDS = [
  "com", "net", "org", "io", "co", "dev", "app", "me", "xyz", "info", "biz",
  "tv", "ai", "gg", "to", "in", "uk", "us", "ca", "au", "de", "fr", "es", "it",
  "nl", "se", "no", "ru", "jp", "cn", "br", "bd", "pk", "np", "lk", "my", "sg",
  "id", "ph", "vn", "th", "ae", "sa", "tr", "eg", "za", "ng", "ke", "site",
  "online", "store", "shop", "blog", "cloud", "tech", "news", "live", "link",
  "be", "ly", "edu", "gov",
];

/**
 * TLDs that are also ordinary English words, and the typo that makes them
 * dangerous.
 *
 * People miss the space after a full stop — "I finished.Me too" — and with `me`
 * treated as a bare TLD that becomes a link to finished.me. So a match with NO
 * scheme, NO `www.` and NO path has to end in something that cannot be read as
 * a word. `youtu.be/abc` still works: it has a path. `https://x.me` still works:
 * it has a scheme. Only the genuinely ambiguous shape is refused.
 */
const WORDY_TLDS = new Set([
  "me", "to", "in", "us", "it", "is", "am", "be", "no", "so", "my", "id", "ly",
  "live", "news", "link", "store", "shop", "blog", "site", "app", "co",
]);

const TLD_GROUP = BARE_TLDS.join("|");

/**
 * The link pattern itself, with NO capture groups.
 *
 * Exported as a source string so `feed-content.tsx` can splice it into its
 * combined URL / @mention / #hashtag matcher without shifting that regex's
 * group indices. One pattern, two consumers — which is the whole point: the
 * composer previewing a link the card then renders as plain text is exactly the
 * drift this replaces.
 *
 * Two shapes:
 *   1. anything with an explicit http(s) scheme,
 *   2. a bare host — optionally `www.` — ending in a known TLD, plus any path.
 *
 * The `(?<![@\w.])` guard stops an email address (`bob@example.com`) and the
 * tail of a longer token being read as a bare link.
 */
// String.raw, not a plain template: in an ordinary template literal `\s` and
// `\.` collapse to `s` and `.`, which silently turns the pattern into one that
// matches almost anything. Regex source has to survive the string layer intact.
export const POST_URL_SOURCE =
  String.raw`(?:https?:\/\/[^\s<]+)` +
  String.raw`|(?<![@\w.])(?:(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:` +
  TLD_GROUP +
  String.raw`)(?:\/[^\s<]*)?)(?!\w)`;

/** Every link in a string. `g` + `i`; no groups, so `m[0]` is the match. */
export const POST_URL_RE = new RegExp(POST_URL_SOURCE, "gi");

/** Trailing punctuation that belongs to the sentence, not to the URL. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

export interface FoundUrl {
  /** Exactly as it appears in the text — what the reader sees. */
  raw: string;
  /** Fetchable / linkable form, with a scheme added if it was missing. */
  href: string;
  index: number;
}

/** Strip trailing sentence punctuation and add a scheme when there is none. */
function toFound(raw: string, index: number): FoundUrl | null {
  const trailing = raw.match(TRAILING)?.[0] ?? "";
  const clean = trailing ? raw.slice(0, -trailing.length) : raw;
  if (!clean) return null;
  const hasScheme = /^https?:\/\//i.test(clean);
  const href = hasScheme ? clean : `https://${clean}`;
  // The ambiguous shape: no scheme, no `www.`, no path, and a TLD that reads as
  // an English word. That is the one that turns a missed space after a full
  // stop into a link. See WORDY_TLDS.
  if (!hasScheme && !/^www\./i.test(clean) && !clean.includes("/")) {
    const tld = clean.split(".").pop()?.toLowerCase() ?? "";
    if (WORDY_TLDS.has(tld)) return null;
  }
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // A host with no dot is not a domain — this rejects "https://localhost"
    // style values that would only ever fail to preview.
    if (!u.hostname.includes(".")) return null;
  } catch {
    return null;
  }
  return { raw: clean, href, index };
}

/** Every link in the text, in order. */
export function findUrls(text: string): FoundUrl[] {
  const out: FoundUrl[] = [];
  for (const m of text.matchAll(POST_URL_RE)) {
    const found = toFound(m[0], m.index ?? 0);
    if (found) out.push(found);
  }
  return out;
}

/** The first link, or null. This is the one that gets a preview card. */
export function findFirstUrl(text: string): FoundUrl | null {
  return findUrls(text)[0] ?? null;
}
