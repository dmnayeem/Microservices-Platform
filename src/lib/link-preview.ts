import { decodeHtml, metaContent } from "@/lib/html-text";
import {
  BROWSER_UA,
  CRAWLER_UA,
  SafeFetchError,
  guardUrl,
  safeFetchBytes,
  safeFetchJson,
  safeFetchText,
} from "@/lib/safe-fetch";

// ─────────────────────────────────────────────────────────────────────────────
// Link preview (OpenGraph) — SSRF-guarded and rate-limited through
// `safe-fetch.ts` (the one outbound fetcher), best-effort. Used to render a card
// under feed posts that contain a URL. Any failure returns null (no card).
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024; // 1 MB — some sites push og: tags past big inline scripts
/**
 * A bigger ceiling for VERIFICATION reads.
 *
 * Measured on a real Pinterest pin: the page is ~1.14MB and its meta block —
 * title, description, and the pin's destination link — sits at ~1.03MB. That is
 * so close to the 1MB cap that whether we caught it came down to how much
 * preamble Pinterest happened to send: one pin verified, the next was reported
 * unreadable, with nothing different about them. Reading a link the user
 * submitted is worth a few more megabytes; a link PREVIEW in the feed is not,
 * so that keeps the smaller cap.
 */
export const VERIFY_MAX_BYTES = 4 * 1024 * 1024;
/** Re-exported: callers ask for it by name from here. Defined in safe-fetch. */
export { CRAWLER_UA };

/** Who caused a fetch, for the per-user outbound limit. */
export interface FetchContext {
  userId?: string | null;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX = 500;

const cache = new Map<string, { value: LinkPreview | null; expires: number }>();

/**
 * Validate scheme + host + port, then resolve DNS and block if ANY IP is
 * private. Throws on any disallowed target. Kept under its old name for the
 * callers that only need the check; the implementation is `guardUrl` in
 * safe-fetch, so there is exactly one SSRF guard.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  return guardUrl(raw);
}

function cacheGet(url: string): LinkPreview | null | undefined {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(url);
    return undefined;
  }
  return hit.value;
}

function cacheSet(url: string, value: LinkPreview | null) {
  if (cache.size >= CACHE_MAX) {
    // Drop the oldest entry (insertion order) to bound memory.
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(url, { value, expires: Date.now() + CACHE_TTL_MS });
}

/** oEmbed JSON endpoint for YouTube/Vimeo video URLs, else null. The endpoint
 *  host is a fixed public provider, so it's reliable and passes the SSRF guard. */
function oembedEndpoint(u: URL): { endpoint: string; siteName: string } | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube.com")
  ) {
    return {
      endpoint: `https://www.youtube.com/oembed?url=${encodeURIComponent(u.toString())}&format=json`,
      siteName: "YouTube",
    };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    return {
      endpoint: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u.toString())}`,
      siteName: "Vimeo",
    };
  }
  return null;
}

/** Build a preview from a provider oEmbed JSON response (YouTube/Vimeo). */
async function fetchViaOEmbed(
  u: URL,
  info: { endpoint: string; siteName: string },
  ctx: FetchContext
): Promise<LinkPreview | null> {
  const data = await safeFetchJson<{
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  } | null>(info.endpoint, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    headers: { Accept: "application/json" },
    userAgent: BROWSER_UA,
    userId: ctx.userId,
    purpose: "link_preview_oembed",
  })
    .then((r) => r.body)
    .catch((e) => {
      // A skipped fetch must reach the caller so it is not cached as "no card".
      if (e instanceof SafeFetchError && e.reason === "rate_limited") throw e;
      return null;
    });
  if (!data) return null;
  const title = (data.title ?? "").trim();
  const image = (data.thumbnail_url ?? "").trim();
  if (!title && !image) return null;
  return {
    url: u.toString(),
    title: title.slice(0, 200),
    description: data.author_name ? `by ${data.author_name}`.slice(0, 300) : "",
    image: /^https?:\/\//i.test(image) ? image : "",
    siteName: info.siteName,
  };
}

const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** Guarded HTML read, truncated at `maxBytes` (meta tags sit near the top). */
function fetchHtml(
  u: string | URL,
  userAgent: string,
  maxBytes: number,
  ctx: FetchContext,
  purpose: string
) {
  return safeFetchText(u, {
    timeoutMs: TIMEOUT_MS,
    maxBytes,
    overflow: "truncate",
    accept: ["html"],
    userAgent,
    headers: { Accept: HTML_ACCEPT, "Accept-Language": "en-US,en;q=0.9" },
    userId: ctx.userId,
    purpose,
  });
}

/**
 * Fetch an OpenGraph preview for `rawUrl`. SSRF-guarded (scheme + DNS-resolved
 * IP block re-checked on every redirect hop, timeout, size + content-type cap).
 * YouTube/Vimeo use provider oEmbed. Returns null on any failure so callers can
 * silently skip the card. Results (incl. null) are cached.
 */
export async function fetchLinkPreview(
  rawUrl: string,
  ctx: FetchContext = {}
): Promise<LinkPreview | null> {
  const cached = cacheGet(rawUrl);
  if (cached !== undefined) return cached;

  let result: LinkPreview | null = null;
  try {
    const u = await guardUrl(rawUrl);

    // Video providers: use oEmbed (reliable, tiny, never blocked) instead of HTML.
    const oembed = oembedEndpoint(u);
    if (oembed) {
      result = await fetchViaOEmbed(u, oembed, ctx);
      cacheSet(rawUrl, result);
      return result;
    }

    const html = (await fetchHtml(u, BROWSER_UA, MAX_BYTES, ctx, "link_preview")).body;

    const title =
      metaContent(html, ["og:title", "twitter:title"]) ||
      decodeHtml(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const description = metaContent(html, ["og:description", "twitter:description", "description"]);
    let image = metaContent(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
    const siteName = metaContent(html, ["og:site_name"]) || u.hostname.replace(/^www\./, "");

    // Resolve a relative/protocol-relative og:image against the page URL.
    if (image) {
      try {
        image = new URL(image, u).toString();
      } catch {
        image = "";
      }
      // Only keep http(s) images.
      if (image && !/^https?:\/\//i.test(image)) image = "";
    }

    if (title || description || image) {
      result = {
        url: u.toString(),
        title: title.slice(0, 200),
        description: description.slice(0, 300),
        image,
        siteName: siteName.slice(0, 100),
      };
    }
  } catch (e) {
    // Skipped for the outbound limit: not a fact about the page, so not cached
    // — the card appears on a later view once the limit has passed.
    if (e instanceof SafeFetchError && e.reason === "rate_limited") return null;
    result = null;
  }

  cacheSet(rawUrl, result);
  return result;
}

/**
 * Fetch the raw HTML of a public page, SSRF-guarded and capped, for server-side
 * proof verification (e.g. confirming a per-user code appears in a published
 * comment/post). Returns the HTML string, or null on any failure (blocked host,
 * non-HTML, timeout, login wall, HTTP error) so callers can fall back to manual
 * review. NOT cached — proof content changes over time and must be read live.
 */
export async function fetchRawHtml(
  rawUrl: string,
  userAgent?: string,
  maxBytes: number = MAX_BYTES,
  ctx: FetchContext = {}
): Promise<string | null> {
  try {
    const r = await fetchHtml(rawUrl, userAgent ?? BROWSER_UA, maxBytes, ctx, "proof_read");
    return r.body;
  } catch {
    // Includes a rate-limit skip: the caller treats null as "couldn't read",
    // which smart verification maps to `unverifiable` — never a rejection.
    return null;
  }
}

/**
 * Fetch the raw bytes of a public URL (SSRF-guarded, capped), for hashing an
 * uploaded proof image server-side. Returns a Buffer, or null on any failure.
 * NOT cached. Images, or an untyped/octet-stream object from a bucket.
 */
export async function fetchRawBytes(
  rawUrl: string,
  ctx: FetchContext = {}
): Promise<Buffer | null> {
  try {
    const r = await safeFetchBytes(rawUrl, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      overflow: "truncate",
      accept: ["image", "binary"],
      headers: { Accept: HTML_ACCEPT, "Accept-Language": "en-US,en;q=0.9" },
      userId: ctx.userId,
      purpose: "proof_image",
    });
    return r.body;
  } catch {
    return null;
  }
}

/** First http(s) URL found in free text, or null. */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<]+/i);
  if (!m) return null;
  // Trim trailing punctuation the same way the renderer does.
  return m[0].replace(/[.,;:!?)\]}'"]+$/, "");
}
