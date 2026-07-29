import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ─────────────────────────────────────────────────────────────────────────────
// Link preview (OpenGraph) — SSRF-guarded, best-effort. Used to render a card
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
const MAX_REDIRECTS = 3;
// A realistic browser UA — some sites 403 obvious bot user-agents.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX = 500;

const cache = new Map<string, { value: LinkPreview | null; expires: number }>();

/** True for private / loopback / link-local / metadata IPs (v4 + v6). */
function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const p = ip.split(".").map((n) => parseInt(n, 10));
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 (protocol assignments)
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true; // loopback / unspecified
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / ULA
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP → block
}

/** Validate scheme + host, then resolve DNS and block if ANY IP is private
 *  (closes DNS-rebinding). Throws on any disallowed target. Exported so other
 *  server-side fetchers (e.g. the ad creative proxy) can reuse the same guard. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Unsupported scheme");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Blocked host");
  }
  // If the host is already a literal IP, check it directly.
  if (isIP(host) && isBlockedIp(host)) throw new Error("Blocked IP");
  // Otherwise resolve and check every returned address.
  if (!isIP(host)) {
    const records = await lookup(host, { all: true }).catch(() => {
      throw new Error("DNS resolution failed");
    });
    if (!records.length) throw new Error("DNS resolution failed");
    for (const r of records) {
      if (isBlockedIp(r.address)) throw new Error("Blocked IP");
    }
  }
  return u;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .trim();
}

/** Pull a <meta> content by property/name, tolerating attribute order. */
function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const attr = key.includes(":") && key.startsWith("og:") ? "property" : "(?:property|name)";
    const m =
      html.match(
        new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i")
      ) ??
      html.match(
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, "i")
      );
    if (m && m[1]) return decodeHtml(m[1]);
  }
  return "";
}

/** Read up to MAX_BYTES of the response body as UTF-8 text, then abort. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX_BYTES) break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
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
  info: { endpoint: string; siteName: string }
): Promise<LinkPreview | null> {
  const res = await fetch(info.endpoint, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  } | null;
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

/** Fetch following up to MAX_REDIRECTS hops, re-validating each hop's host/DNS
 *  (keeps the SSRF guard across redirects). Shares one overall timeout. */
async function fetchFollowingRedirects(start: URL): Promise<Response> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) await assertPublicUrl(current.toString()); // re-guard redirected host
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new Error("Bad redirect target");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new Error("Bad redirect scheme");
      }
      current = next;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

/**
 * Fetch an OpenGraph preview for `rawUrl`. SSRF-guarded (scheme + DNS-resolved
 * IP block re-checked on every redirect hop, timeout, size + content-type cap).
 * YouTube/Vimeo use provider oEmbed. Returns null on any failure so callers can
 * silently skip the card. Results (incl. null) are cached.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const cached = cacheGet(rawUrl);
  if (cached !== undefined) return cached;

  let result: LinkPreview | null = null;
  try {
    const u = await assertPublicUrl(rawUrl);

    // Video providers: use oEmbed (reliable, tiny, never blocked) instead of HTML.
    const oembed = oembedEndpoint(u);
    if (oembed) {
      result = await fetchViaOEmbed(u, oembed);
      cacheSet(rawUrl, result);
      return result;
    }

    const res = await fetchFollowingRedirects(u);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) {
      throw new Error("Not HTML");
    }
    const html = await readCapped(res);

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
  } catch {
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
export async function fetchRawHtml(rawUrl: string): Promise<string | null> {
  try {
    const u = await assertPublicUrl(rawUrl);
    const res = await fetchFollowingRedirects(u);
    if (!res.ok) return null;
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) {
      return null;
    }
    return await readCapped(res);
  } catch {
    return null;
  }
}

/**
 * Fetch the raw bytes of a public URL (SSRF-guarded, capped), for hashing an
 * uploaded proof image server-side. Returns a Buffer, or null on any failure.
 * NOT cached. Accepts any content-type (images aren't HTML).
 */
export async function fetchRawBytes(rawUrl: string): Promise<Buffer | null> {
  try {
    const u = await assertPublicUrl(rawUrl);
    // Re-guards every redirect hop against private IPs (same as HTML fetch).
    const res = await fetchFollowingRedirects(u);
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
          if (total >= MAX_BYTES) break;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
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
