/**
 * Who a social proof belongs to — for the "one account per member" rule
 * (`BundleItem.uniqueAccount`).
 *
 * A plain lower-cased string is not enough: "@Rafi", "rafi" and
 * "https://www.facebook.com/rafi/?mibextid=xyz" are one account, and
 * "https://m.facebook.com/rafi/posts/1?__cft__=…" is one post however it was
 * shared. These helpers fold those spellings into one key so the submit route
 * can refuse a second member who reuses an account or a post.
 *
 * Pure and client-safe.
 */

const HOST_ALIASES: Record<string, string> = {
  "twitter.com": "x.com",
  "threads.com": "threads.net",
  "fb.com": "facebook.com",
};

function parseUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

function canonicalHost(hostname: string): string {
  const h = hostname
    .toLowerCase()
    .replace(/^(www|m|mobile|web|mbasic|touch)\./, "");
  return HOST_ALIASES[h] ?? h;
}

function segments(u: URL): string[] {
  return u.pathname
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .filter(Boolean);
}

/** Query params that identify a post / profile. Everything else is tracking. */
const IDENTITY_PARAMS = ["story_fbid", "fbid", "id", "v", "comment_id", "reply_comment_id", "lc"];

/** One post, however it was shared: canonical host + path + identity params. */
export function postUrlKey(raw: string | null | undefined): string | null {
  const u = parseUrl(raw ?? "");
  if (!u) return null;
  const path = segments(u).join("/").toLowerCase();
  const q = IDENTITY_PARAMS.filter((k) => u.searchParams.get(k))
    .map((k) => `${k}=${u.searchParams.get(k)!.toLowerCase()}`)
    .join("&");
  return `${canonicalHost(u.hostname)}/${path}${q ? `?${q}` : ""}`;
}

const FB_NOT_A_PROFILE = new Set([
  "groups", "watch", "share", "sharer", "sharer.php", "reel", "reels",
  "photo", "photo.php", "photos", "events", "hashtag", "marketplace", "pages",
  "login", "home.php", "stories", "videos", "media", "gaming", "help",
]);
const X_NOT_A_PROFILE = new Set([
  "i", "intent", "home", "search", "hashtag", "share", "explore", "settings",
]);
const IG_NOT_A_PROFILE = new Set(["p", "reel", "reels", "tv", "explore", "accounts"]);

/**
 * The account a profile or post URL belongs to, when the URL says so. Many post
 * links do not (an Instagram /p/CODE never names its author) — null then.
 */
function handleFromUrl(u: URL): string | null {
  const host = canonicalHost(u.hostname);
  const seg = segments(u);
  const first = seg[0] ?? "";
  const at = (s: string | undefined) =>
    s && s.startsWith("@") && s.length > 1 ? s.slice(1) : null;

  if (host === "facebook.com") {
    if (first === "profile.php" || first === "permalink.php" || first === "story.php") {
      return u.searchParams.get("id");
    }
    if (first === "people") return seg[2] ?? null; // /people/Name/<id>
    if (!first || FB_NOT_A_PROFILE.has(first.toLowerCase())) return null;
    return first;
  }
  if (host === "x.com") {
    if (!first || X_NOT_A_PROFILE.has(first.toLowerCase())) return null;
    return first;
  }
  if (host === "instagram.com") {
    if (first === "stories") return seg[1] ?? null;
    if (!first || IG_NOT_A_PROFILE.has(first.toLowerCase())) return null;
    return first;
  }
  if (host.endsWith("tiktok.com") || host === "threads.net") return at(first);
  if (host === "linkedin.com") {
    if (first === "in" || first === "company" || first === "school") return seg[1] ?? null;
    if (first === "posts" && seg[1]) return seg[1].split("_")[0] || null;
    return null;
  }
  if (host === "youtube.com") {
    if (at(first)) return at(first);
    if (first === "channel" || first === "c" || first === "user") return seg[1] ?? null;
    return null;
  }
  if (host === "bsky.app" && first === "profile") return seg[1] ?? null;
  return null;
}

function cleanHandle(h: string): string | null {
  const t = h.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
  return t.length >= 2 ? t : null;
}

/** The account named by a typed username ("@rafi", "rafi") or a profile link. */
export function accountKeyFromUsername(
  platform: string | null | undefined,
  raw: string | null | undefined
): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const looksLikeUrl = /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+\//.test(v);
  const handle = looksLikeUrl
    ? (() => {
        const u = parseUrl(v);
        return u ? handleFromUrl(u) : null;
      })()
    : v;
  const h = handle ? cleanHandle(handle) : null;
  return h ? `${(platform ?? "").toUpperCase()}:${h}` : null;
}

/**
 * Is this a link to a profile itself, rather than to something on it? A post,
 * comment or visitor post can sit under SOMEONE ELSE's name (the page that was
 * posted on), so only a bare profile link reliably names its owner.
 */
function isProfileUrl(u: URL): boolean {
  const host = canonicalHost(u.hostname);
  const seg = segments(u);
  const first = seg[0] ?? "";
  if (host === "facebook.com") {
    return first === "profile.php" || first === "people" || seg.length === 1;
  }
  if (host === "linkedin.com") {
    return (first === "in" || first === "company" || first === "school") && seg.length <= 2;
  }
  if (host === "youtube.com") return seg.length <= 2;
  if (host === "bsky.app") return seg.length === 2;
  return seg.length === 1;
}

/**
 * The account a submitted URL belongs to, or null if unknown. With
 * `profileOnly`, only a bare profile link counts — use that whenever the URL
 * may point at something the member did on another account's page.
 */
export function accountKeyFromUrl(
  platform: string | null | undefined,
  raw: string | null | undefined,
  opts: { profileOnly?: boolean } = {}
): string | null {
  const u = parseUrl(raw ?? "");
  if (u && opts.profileOnly && !isProfileUrl(u)) return null;
  const handle = u ? handleFromUrl(u) : null;
  const h = handle ? cleanHandle(handle) : null;
  return h ? `${(platform ?? "").toUpperCase()}:${h}` : null;
}
