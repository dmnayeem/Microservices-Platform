import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { raiseAbuseSignal, type AbuseSignal } from "@/lib/abuse/signal";

/**
 * The one way the server fetches a URL somebody else chose.
 *
 * Feed link previews, smart verification of social proofs, the re-check job,
 * task thumbnails, advertiser creatives, seller deliverables, game embeds — every
 * one of them makes OUR server connect to an address a user typed. Two things
 * can go wrong with that, and both land on the host as a complaint about us:
 *
 *  1. **SSRF.** The URL points inward — `169.254.169.254` (cloud credentials),
 *     `localhost`, a private range — or points outward and REDIRECTS inward.
 *     Every hop is resolved and checked, redirects are followed by hand, and
 *     anything that is not a public address on port 80/443 is refused.
 *  2. **Flooding.** A user (or a bug) makes us hammer one site. Per-target-domain
 *     and per-user limits cap it; over the limit the fetch is SKIPPED, the
 *     caller sees an ordinary "couldn't read", and the Abuse Center gets one
 *     OUTBOUND_LIMIT signal per window.
 *
 * "Couldn't read" is always a safe answer for callers: smart verification maps
 * it to `unverifiable`, which goes to a human and can never auto-reject.
 *
 * The limits are in-memory per instance. There is a shared limiter
 * (`rate-limit-db.ts`), but it costs a database upsert per call, and putting a
 * DB write in front of every outbound fetch would load the database far more
 * than it protects anyone; per-instance limits already bound what any single
 * instance can send.
 *
 * No `server-only` import so the verification script can load it; it uses
 * `node:dns` and must never reach a client bundle anyway.
 */

/* ────────────────────────────── identity ────────────────────────────── */

/** Where a site operator can report us. Sent on every outbound request. */
export const ABUSE_CONTACT_URL = "https://revtype.com/abuse";

/**
 * A realistic browser UA — some sites 403 obvious bot user-agents.
 *
 * Deliberately NOT suffixed with our contact URL: measured 2026-09-29, a UA
 * suffix changed what LinkedIn and Instagram served (a 429 from LinkedIn, a
 * half-size Instagram page). The contact goes in a header instead, which every
 * platform tested ignored.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * The link-preview crawler UA.
 *
 * Several large sites render nothing for a browser fetch but serve complete
 * Open Graph tags to a known preview crawler — that is how a link pasted into
 * Facebook or WhatsApp gets a title and description. Measured: a real Reddit
 * post returns no OG tags at all to the browser UA above, and its actual title
 * and body text to this one. TikTok behaves the same way.
 *
 * Kept byte-for-byte: smart verification of Reddit/X/LinkedIn/TikTok/Instagram
 * depends on it, and a suffix measurably broke LinkedIn (see BROWSER_UA).
 */
export const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

/** Added to every request. Verified not to change any platform's response. */
const IDENTITY_HEADERS: Record<string, string> = {
  "X-Abuse-Contact": ABUSE_CONTACT_URL,
};

/* ────────────────────────────── IP classifier ────────────────────────────── */

function v4Blocked(p: number[]): boolean {
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function parseV4(ip: string): number[] | null {
  const p = ip.split(".").map((n) => (/^\d{1,3}$/.test(n) ? parseInt(n, 10) : NaN));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n > 255)) return null;
  return p;
}

/** Expand an IPv6 address (any notation, incl. embedded dotted v4) to 8 hextets. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  // Embedded dotted IPv4 tail → two hextets.
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = parseV4(dotted[2]);
    if (!v4) return null;
    s = `${dotted[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array(fill).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const out = parts.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return out.some((n) => Number.isNaN(n)) ? null : out;
}

/**
 * True for any address a server-side fetch must never reach: private, loopback,
 * link-local, cloud metadata, CGNAT, multicast, reserved, documentation — v4
 * and v6, including v4 smuggled inside v6 (mapped, compatible, NAT64, 6to4).
 * Anything that does not parse as an IP is blocked too.
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip.split("%")[0]);
  if (kind === 4) {
    const p = parseV4(ip);
    return p ? v4Blocked(p) : true;
  }
  if (kind === 6) {
    const h = expandV6(ip);
    if (!h) return true;
    const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
    const zeroTo = (n: number) => h.slice(0, n).every((x) => x === 0);
    if (zeroTo(8)) return true; // ::
    if (zeroTo(7) && h[7] === 1) return true; // ::1
    if (zeroTo(5) && h[5] === 0xffff) return v4Blocked(embeddedV4(h[6], h[7])); // ::ffff:a.b.c.d
    if (zeroTo(6)) return true; // ::a.b.c.d (deprecated IPv4-compatible)
    if (h[0] === 0x64 && h[1] === 0xff9b) return v4Blocked(embeddedV4(h[6], h[7])); // NAT64
    if (h[0] === 0x2002) return v4Blocked(embeddedV4(h[1], h[2])); // 6to4
    if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
    if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // discard-only
    return false;
  }
  return true;
}

/* ────────────────────────────── errors + options ────────────────────────────── */

export type SafeFetchFailure =
  | "invalid_url"
  | "blocked" // scheme, host, port, IP range, IP literal, redirect target
  | "dns"
  | "rate_limited"
  | "timeout"
  | "too_many_redirects"
  | "http_error"
  | "bad_type"
  | "too_large"
  | "network";

export class SafeFetchError extends Error {
  constructor(
    public readonly reason: SafeFetchFailure,
    message?: string
  ) {
    super(message ?? reason);
    this.name = "SafeFetchError";
  }
}

/** Content families a caller may accept. Checked on the final 2xx response. */
export type SafeContentKind = "html" | "json" | "image" | "video" | "text" | "binary";

const CONTENT_MATCH: Record<SafeContentKind, (ct: string) => boolean> = {
  html: (ct) => ct.includes("text/html") || ct.includes("application/xhtml"),
  json: (ct) => ct.includes("application/json") || ct.includes("+json") || ct.includes("text/javascript"),
  image: (ct) => ct.startsWith("image/"),
  video: (ct) => ct.startsWith("video/") || ct.includes("mpegurl"),
  text: (ct) => ct.startsWith("text/"),
  // Object stores often serve uploads with no type or a generic one.
  binary: (ct) => !ct || ct.includes("octet-stream"),
};

export type Resolver = (host: string) => Promise<string[]>;

export interface SafeGuardOptions {
  /** Extra ports beyond 80/443 (and the scheme default). */
  allowPorts?: number[];
  /** Allow a host that is written as an IP (still range-checked). Default false. */
  allowIpLiteral?: boolean;
  /** Test seam: replaces DNS. */
  resolver?: Resolver;
}

export interface SafeFetchOptions extends SafeGuardOptions {
  /** The account that caused this fetch — counts toward the per-user limit. */
  userId?: string | null;
  /** Short label for logs and abuse evidence ("link_preview", "smart_verify"…). */
  purpose?: string;
  /** false = SSRF guard only, no rate limits (fixed, cached, admin-owned reads). */
  rateLimit?: boolean;
  userAgent?: string;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
  /** Accepted content families; omitted = any. */
  accept?: SafeContentKind[];
  /** Default 8000. Covers connect, every redirect hop and the body read. */
  timeoutMs?: number;
  /** Default 3. */
  maxRedirects?: number;
  signal?: AbortSignal;
  /** Test seam: replaces global fetch. */
  fetchImpl?: typeof fetch;
}

export const SAFE_FETCH_DEFAULTS = {
  timeoutMs: 8000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
} as const;

/* ────────────────────────────── URL guard ────────────────────────────── */

const defaultResolver: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Validate scheme, host, port and every resolved address. Throws a
 * `SafeFetchError` on anything disallowed; returns the parsed URL otherwise.
 * Blocks if ANY resolved address is private, so a hostname with one public and
 * one internal record cannot be used to reach the internal one.
 */
export async function guardUrl(raw: string | URL, opts: SafeGuardOptions = {}): Promise<URL> {
  return (await guardAndResolve(raw, opts)).url;
}

/**
 * `guardUrl`, plus the vetted addresses (null for an allowed IP-literal host).
 * `safeFetch` connects to exactly these — see `pinnedFetch`.
 */
async function guardAndResolve(
  raw: string | URL,
  opts: SafeGuardOptions
): Promise<{ url: URL; addrs: string[] | null }> {
  let u: URL;
  try {
    u = new URL(raw.toString());
  } catch {
    throw new SafeFetchError("invalid_url", "Invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new SafeFetchError("blocked", "Unsupported scheme");
  }
  if (u.username || u.password) {
    throw new SafeFetchError("blocked", "Credentials in URL");
  }
  if (u.port) {
    const port = Number(u.port);
    if (port !== 80 && port !== 443 && !(opts.allowPorts ?? []).includes(port)) {
      throw new SafeFetchError("blocked", "Non-standard port");
    }
  }
  // WHATWG URL already normalised decimal/hex/octal IPv4 forms to dotted quad;
  // IPv6 hosts keep their brackets.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new SafeFetchError("invalid_url", "No host");

  if (isIP(host)) {
    if (isBlockedIp(host)) throw new SafeFetchError("blocked", "Blocked IP");
    if (!opts.allowIpLiteral) throw new SafeFetchError("blocked", "IP-literal host");
    return { url: u, addrs: null };
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    !host.includes(".") // single-label names resolve via internal search domains
  ) {
    throw new SafeFetchError("blocked", "Blocked host");
  }
  let addrs: string[];
  try {
    addrs = await (opts.resolver ?? defaultResolver)(host);
  } catch {
    throw new SafeFetchError("dns", "DNS resolution failed");
  }
  if (!addrs.length) throw new SafeFetchError("dns", "DNS resolution failed");
  if (addrs.some(isBlockedIp)) throw new SafeFetchError("blocked", "Blocked IP");
  return { url: u, addrs };
}

/**
 * Fetch `u` while connecting ONLY to `addrs` — the addresses `guardAndResolve`
 * just vetted.
 *
 * Plain `fetch(url)` resolves the hostname a second time when it connects.
 * A hostile DNS server can answer the guard with a public address and the
 * connection with `169.254.169.254` a millisecond later (DNS rebinding), which
 * walks straight past the SSRF check. Pinning the socket's `lookup` closes
 * that gap. The Host header and TLS SNI still carry the real hostname, so
 * virtual hosting and certificates behave exactly as with `fetch`.
 *
 * Returns a standard `Response` (body decompressed like `fetch` does) so every
 * reader below works unchanged.
 */
function pinnedFetch(
  u: URL,
  addrs: string[],
  init: { method: string; signal: AbortSignal; headers: Record<string, string> }
): Promise<Response> {
  const ip = addrs[0];
  const family = isIP(ip) || 4;
  return new Promise<Response>((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: init.method,
        signal: init.signal,
        headers: {
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          ...init.headers,
        },
        // Node may ask for one address or (Happy Eyeballs) all of them.
        lookup: ((
          _host: string,
          options: { all?: boolean } | number | undefined,
          cb: (err: Error | null, address: unknown, fam?: number) => void
        ) => {
          if (typeof options === "object" && options?.all) {
            cb(null, [{ address: ip, family }]);
          } else {
            cb(null, ip, family);
          }
        }) as unknown as http.RequestOptions["lookup"],
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v == null) continue;
          try {
            if (Array.isArray(v)) for (const x of v) headers.append(k, x);
            else headers.set(k, String(v));
          } catch {
            /* a header value fetch would also reject — drop it */
          }
        }
        const status = res.statusCode ?? 502;
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
        let stream: Readable = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        if (stream !== res) {
          headers.delete("content-encoding");
          headers.delete("content-length");
        }
        const noBody = init.method === "HEAD" || status === 204 || status === 304;
        if (noBody) res.resume();
        try {
          resolve(
            new Response(
              noBody ? null : (Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>),
              { status, statusText: res.statusMessage, headers }
            )
          );
        } catch (e) {
          res.destroy();
          reject(e);
        }
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/* ────────────────────────────── rate limits ────────────────────────────── */

export interface OutboundLimits {
  domainPerMin: number;
  domainPerHour: number;
  userPerHour: number;
}

export const OUTBOUND_LIMIT_DEFAULTS: OutboundLimits = {
  domainPerMin: 30,
  domainPerHour: 600,
  userPerHour: 60,
};

let limitsOverride: OutboundLimits | null = null;
let limitsCache: { value: OutboundLimits; at: number } | null = null;
const LIMITS_TTL_MS = 60_000;

async function currentLimits(): Promise<OutboundLimits> {
  if (limitsOverride) return limitsOverride;
  if (limitsCache && Date.now() - limitsCache.at < LIMITS_TTL_MS) return limitsCache.value;
  let value = OUTBOUND_LIMIT_DEFAULTS;
  try {
    const { getSetting } = await import("@/lib/system-settings");
    const perMin = Number(
      await getSetting("security.outbound_domain_per_min", OUTBOUND_LIMIT_DEFAULTS.domainPerMin)
    );
    const perUser = Number(
      await getSetting("security.outbound_user_per_hour", OUTBOUND_LIMIT_DEFAULTS.userPerHour)
    );
    const dm = Number.isFinite(perMin) && perMin >= 1 ? Math.floor(perMin) : OUTBOUND_LIMIT_DEFAULTS.domainPerMin;
    value = {
      domainPerMin: dm,
      // The hourly ceiling follows the per-minute one: 20 busy minutes an hour.
      domainPerHour: dm * 20,
      userPerHour:
        Number.isFinite(perUser) && perUser >= 1 ? Math.floor(perUser) : OUTBOUND_LIMIT_DEFAULTS.userPerHour,
    };
  } catch {
    /* settings unreachable → defaults */
  }
  limitsCache = { value, at: Date.now() };
  return value;
}

type Window = { count: number; resetAt: number; signalled: boolean; urls?: Set<string> };
const domainMinute = new Map<string, Window>();
const domainHour = new Map<string, Window>();
const userHour = new Map<string, Window>();

function windowFor(map: Map<string, Window>, key: string, ms: number, now: number): Window {
  let w = map.get(key);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + ms, signalled: false };
    map.set(key, w);
    if (map.size > 10_000) {
      for (const [k, v] of map) if (now >= v.resetAt) map.delete(k);
    }
  }
  return w;
}

/** Our configured S3 bucket / CloudFront host (exact match — not any AWS host). */
function isOwnStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const cdn = (process.env.AWS_CLOUDFRONT_DOMAIN ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (cdn && host === cdn) return true;
  const bucket = (process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || "").toLowerCase();
  return !!bucket && host.startsWith(`${bucket}.s3`) && host.endsWith(".amazonaws.com");
}

/**
 * Shared-hosting suffixes whose subdomains belong to unrelated owners: each
 * full hostname is its own "domain" for limiting, or every S3 bucket on earth
 * would share one counter.
 */
const SHARED_HOST_SUFFIXES = [
  "amazonaws.com",
  "cloudfront.net",
  "googleusercontent.com",
  "appspot.com",
  "blogspot.com",
  "github.io",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "herokuapp.com",
  "azurewebsites.net",
  "web.app",
  "firebaseapp.com",
  "wordpress.com",
  "substack.com",
];

/**
 * The domain a limit is charged to: roughly the registrable domain, so rotating
 * subdomains (a.example.com, b.example.com…) cannot dodge it.
 */
export function limitDomain(host: string): string {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(h)) return h;
  if (SHARED_HOST_SUFFIXES.some((s) => h.endsWith(`.${s}`))) return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const sld = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  const take =
    tld.length === 2 && ["co", "com", "net", "org", "gov", "edu", "ac"].includes(sld) ? 3 : 2;
  return parts.slice(-take).join(".");
}

function signalLimit(
  w: Window,
  scope: "domain" | "user",
  key: string,
  limit: number,
  period: string,
  url: string,
  opts: SafeFetchOptions
) {
  if (w.signalled) return;
  w.signalled = true;
  signalSink({
    kind: "OUTBOUND_LIMIT",
    severity: scope === "user" ? "MEDIUM" : "LOW",
    userId: opts.userId ?? null,
    entityType: "outbound_fetch",
    entityId: null,
    summary:
      scope === "user"
        ? `One account made the server fetch more than ${limit} links in an ${period}; further fetches were skipped`
        : `Server fetches to ${key} passed ${limit} per ${period}; further fetches were skipped`,
    evidence: {
      scope,
      key,
      limit,
      period,
      purpose: opts.purpose ?? null,
      url: url.slice(0, 500),
    },
  });
}

/**
 * Charge one fetch of `u` against the limits. Returns false (and signals once
 * per window) when any limit is already spent; nothing is charged then.
 *
 * The per-user limit counts DISTINCT URLs: smart verification asks for the same
 * page twice (crawler UA, then browser UA) and a user re-opening their own
 * submission re-asks for it — neither is the user making us fetch more.
 */
async function takeRateLimit(u: URL, opts: SafeFetchOptions, chargeUser: boolean): Promise<boolean> {
  if (opts.rateLimit === false) return true;
  // Our own bucket/CDN: not a third party, nobody to flood.
  if (isOwnStorageHost(u.hostname)) return true;
  const limits = await currentLimits();
  const now = Date.now();
  const dom = limitDomain(u.hostname);
  const dMin = windowFor(domainMinute, dom, 60_000, now);
  const dHour = windowFor(domainHour, dom, 3_600_000, now);
  const uid = chargeUser && opts.userId ? opts.userId : null;
  const uWin = uid ? windowFor(userHour, uid, 3_600_000, now) : null;
  const href = u.toString();
  const userRepeat = !!uWin?.urls?.has(href);

  if (uWin && !userRepeat && uWin.count >= limits.userPerHour) {
    signalLimit(uWin, "user", uid!, limits.userPerHour, "hour", href, opts);
    return false;
  }
  if (dMin.count >= limits.domainPerMin) {
    signalLimit(dMin, "domain", dom, limits.domainPerMin, "minute", href, opts);
    return false;
  }
  if (dHour.count >= limits.domainPerHour) {
    signalLimit(dHour, "domain", dom, limits.domainPerHour, "hour", href, opts);
    return false;
  }
  dMin.count++;
  dHour.count++;
  if (uWin && !userRepeat) {
    uWin.count++;
    (uWin.urls ??= new Set()).add(href);
  }
  return true;
}

let signalSink: (s: AbuseSignal) => void = raiseAbuseSignal;

/** Test seam: capture OUTBOUND_LIMIT signals (null = the Abuse Center again). */
export function __setSignalSinkForTest(fn: ((s: AbuseSignal) => void) | null): void {
  signalSink = fn ?? raiseAbuseSignal;
}

/** Test seam: pin the limits (null = read settings again). */
export function __setOutboundLimitsForTest(l: OutboundLimits | null): void {
  limitsOverride = l;
  limitsCache = null;
}

/** Test seam: forget every counter. */
export function __resetSafeFetchState(): void {
  domainMinute.clear();
  domainHour.clear();
  userHour.clear();
}

/* ────────────────────────────── fetch ────────────────────────────── */

function isAbort(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export interface SafeResponse {
  response: Response;
  /** Where the content actually came from, after redirects. */
  finalUrl: URL;
}

/**
 * Guarded fetch. Returns the final response with its body UNREAD (use the
 * readers below, or stream it with `cappedStream`). Throws `SafeFetchError`.
 *
 * Any final status is returned (a caller may need a 404's headers); the content
 * type is only enforced on a 2xx. A 3xx with no Location is returned as-is.
 */
export async function safeFetch(raw: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_DEFAULTS.maxRedirects;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? SAFE_FETCH_DEFAULTS.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  let guarded = await guardAndResolve(raw, opts);
  let current = guarded.url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (hop > 0) {
      guarded = await guardAndResolve(current, opts);
      current = guarded.url;
    }
    // The user is charged once per call; every hop is charged to its domain.
    if (!(await takeRateLimit(current, opts, hop === 0))) {
      throw new SafeFetchError("rate_limited", "Outbound limit reached");
    }
    const method = opts.method ?? "GET";
    const headers = {
      "User-Agent": opts.userAgent ?? BROWSER_UA,
      ...(opts.headers ?? {}),
      ...IDENTITY_HEADERS,
    };
    let res: Response;
    try {
      // Test seam first; otherwise connect only to the vetted address
      // (an IP-literal host has nothing to re-resolve, so plain fetch).
      res = opts.fetchImpl
        ? await opts.fetchImpl(current, { method, signal, redirect: "manual", headers })
        : guarded.addrs
        ? await pinnedFetch(current, guarded.addrs, { method, signal, headers })
        : await fetch(current, { method, signal, redirect: "manual", headers });
    } catch (e) {
      throw new SafeFetchError(isAbort(e) ? "timeout" : "network", (e as Error)?.message);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { response: res, finalUrl: current };
      await res.body?.cancel().catch(() => {});
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new SafeFetchError("blocked", "Bad redirect target");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new SafeFetchError("blocked", "Bad redirect scheme");
      }
      current = next;
      continue;
    }
    if (res.ok && opts.accept?.length) {
      const ct = (res.headers.get("content-type") ?? "").toLowerCase().trim();
      if (!opts.accept.some((k) => CONTENT_MATCH[k](ct))) {
        await res.body?.cancel().catch(() => {});
        throw new SafeFetchError("bad_type", `Unexpected content-type ${ct || "(none)"}`);
      }
    }
    return { response: res, finalUrl: current };
  }
  throw new SafeFetchError("too_many_redirects", "Too many redirects");
}

/**
 * Read at most `maxBytes` of a body. `overflow: "truncate"` keeps the first
 * `maxBytes` (a page's meta block is near the top); `"fail"` throws
 * `too_large` (a file that is not whole is useless).
 */
export async function readCapped(
  res: Response,
  maxBytes: number = SAFE_FETCH_DEFAULTS.maxBytes,
  overflow: "truncate" | "fail" = "fail"
): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (overflow === "fail" && Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new SafeFetchError("too_large", "Response too large");
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        if (overflow === "fail") throw new SafeFetchError("too_large", "Response too large");
        chunks.push(Buffer.from(value.subarray(0, value.byteLength - (total - maxBytes))));
        break;
      }
      chunks.push(Buffer.from(value));
      // Exactly full: truncate mode is done; fail mode reads on to see if more follows.
      if (total === maxBytes && overflow === "truncate") break;
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    throw new SafeFetchError(isAbort(e) ? "timeout" : "network", (e as Error)?.message);
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

/**
 * Wrap a body for streaming back to a client, erroring the stream once more
 * than `maxBytes` has passed through (the client sees a truncated download).
 */
export function cappedStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          controller.error(new SafeFetchError("too_large", "Response too large"));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
}

export interface SafeReadOptions extends SafeFetchOptions {
  /** Default 2MB. */
  maxBytes?: number;
  /** Default "fail"; HTML readers use "truncate". */
  overflow?: "truncate" | "fail";
  /** Default true: a non-2xx final response is a failure. */
  requireOk?: boolean;
}

export interface SafeRead<T> {
  body: T;
  status: number;
  contentType: string;
  finalUrl: URL;
  headers: Headers;
}

async function readBody(raw: string | URL, opts: SafeReadOptions): Promise<SafeRead<Buffer>> {
  const { response, finalUrl } = await safeFetch(raw, opts);
  if ((opts.requireOk ?? true) && !response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new SafeFetchError("http_error", `HTTP ${response.status}`);
  }
  const body = await readCapped(
    response,
    opts.maxBytes ?? SAFE_FETCH_DEFAULTS.maxBytes,
    opts.overflow ?? "fail"
  );
  return {
    body,
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
    finalUrl,
    headers: response.headers,
  };
}

/** Guarded fetch → UTF-8 text. Throws `SafeFetchError`. */
export async function safeFetchText(raw: string | URL, opts: SafeReadOptions = {}): Promise<SafeRead<string>> {
  const r = await readBody(raw, opts);
  return { ...r, body: r.body.toString("utf8") };
}

/** Guarded fetch → bytes. Throws `SafeFetchError`. */
export async function safeFetchBytes(raw: string | URL, opts: SafeReadOptions = {}): Promise<SafeRead<Buffer>> {
  return readBody(raw, opts);
}

/** Guarded fetch → parsed JSON, or throws. */
export async function safeFetchJson<T = unknown>(raw: string | URL, opts: SafeReadOptions = {}): Promise<SafeRead<T>> {
  const r = await readBody(raw, { accept: ["json"], ...opts });
  try {
    return { ...r, body: JSON.parse(r.body.toString("utf8")) as T };
  } catch {
    throw new SafeFetchError("bad_type", "Invalid JSON");
  }
}
