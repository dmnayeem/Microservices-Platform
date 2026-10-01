/**
 * Link safety — is a link someone is saving onto the platform a phishing or
 * malware link?
 *
 * WHY THIS EXISTS
 * ---------------
 * A host suspends a whole platform for the phishing links its users post. Every
 * place a user saves text or a URL that other people will see (feed posts,
 * comments, profiles, listings, buyer tasks, ads, chat) runs through here at
 * save time.
 *
 * THREE LAYERS, cheapest first
 *   1. Hard rules that need no API key and have no legitimate use:
 *      `javascript:` / `data:` / `file:` / `vbscript:` URLs in a link field, and
 *      any domain (or subdomain of one) on the admin blocklist
 *      `security.blocked_domains`. These are ALWAYS rejected on user content,
 *      whatever the mode — except on admin-only surfaces, which are never
 *      blocked.
 *   2. Built-in heuristics: raw IP addresses as the host, and punycode /
 *      look-alike hosts imitating our own domain or a big brand. Flag only.
 *   3. Google Safe Browsing v4 Lookup, when a key is set
 *      (`GOOGLE_SAFE_BROWSING_KEY` env, else `security.safe_browsing_api_key`).
 *      Batched, 5s timeout, verdicts cached 6h in memory. FAILS OPEN: if Google
 *      is down or the key is wrong, nobody is blocked.
 *
 * MODE (`security.link_policy`)
 *   "flag"  (default) — Safe Browsing / look-alike hits are allowed through but
 *                       raise a LINK_UNSAFE abuse signal, which opens a case in
 *                       the Abuse Center for an admin to review.
 *   "block"           — those hits are refused with a clear message.
 *   "off"             — layers 2 and 3 are skipped. Layer 1 still applies.
 *
 * Free text only yields http(s) and bare-domain links (`findUrls`, the same
 * rule the feed uses to linkify), so a post that merely MENTIONS
 * "javascript:alert(1)" is never rejected — the scheme rule applies to fields
 * that are themselves a link.
 *
 * Deliberately has no top-level Prisma import so `scripts/verify-link-safety.ts`
 * can import it without a database.
 */

import { domainToUnicode } from "node:url";
import { findUrls } from "@/lib/post-urls";
import { raiseAbuseSignal, type AbuseSeverity } from "@/lib/abuse/signal";

// ── Types ──────────────────────────────────────────────────────────────────

export type LinkPolicyMode = "flag" | "block" | "off";

export const LINK_POLICY_KEY = "security.link_policy";
export const BLOCKED_DOMAINS_KEY = "security.blocked_domains";
export const SAFE_BROWSING_KEY_SETTING = "security.safe_browsing_api_key";
export const SAFE_BROWSING_ENV = "GOOGLE_SAFE_BROWSING_KEY";
export const LINK_POLICY_MODES: readonly LinkPolicyMode[] = ["flag", "block", "off"];

/**
 * How much a surface may refuse.
 *   full      — hard rules always; Safe Browsing / look-alike hits too when the
 *               mode is "block". User content that the public sees.
 *   hard-only — only the hard rules refuse; everything else is flagged (chat).
 *   never     — nothing is refused, everything is flagged (admin surfaces,
 *               the contact form).
 */
export type LinkEnforcement = "full" | "hard-only" | "never";

/**
 *  ok         — nothing found.
 *  hard       — bad scheme / admin blocklist. Refused on user content.
 *  unsafe     — Safe Browsing hit or look-alike. Refused only in "block" mode.
 *  suspicious — raw IP host. Only ever flagged.
 */
export type LinkStatus = "ok" | "hard" | "unsafe" | "suspicious";

export interface LinkVerdict {
  url: string;
  host: string | null;
  status: LinkStatus;
  /** Plain-language reasons, for the admin and the error message. */
  reasons: string[];
  /** Safe Browsing threat types, when that layer hit. */
  threats?: string[];
}

export interface LinkSafetyConfig {
  mode: LinkPolicyMode;
  blockedDomains: string[];
  safeBrowsingKey: string;
}

export interface LinkSafetyDeps {
  /** Injected in tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Injected in tests; defaults to reading the settings. */
  config?: LinkSafetyConfig;
}

export interface LinkCheckContext {
  userId?: string | null;
  /** "post", "comment", "profile", "listing", "task", "ad", "chat", "cpa"… */
  entityType: string;
  entityId?: string | null;
  enforcement?: LinkEnforcement;
}

// ── Config ─────────────────────────────────────────────────────────────────

export function normaliseMode(v: unknown): LinkPolicyMode {
  return v === "block" || v === "off" || v === "flag" ? v : "flag";
}

/** One domain per entry, lowercased, no scheme / path / leading "*." or ".". */
export function normaliseDomainList(v: unknown): string[] {
  const raw: unknown[] = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(/[\s,]+/)
      : [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let d = item.trim().toLowerCase();
    if (!d) continue;
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0];
    d = d.replace(/:\d+$/, "").replace(/^\*?\./, "").replace(/\.$/, "");
    if (d) out.add(d);
  }
  return [...out];
}

export async function loadLinkSafetyConfig(): Promise<LinkSafetyConfig> {
  try {
    const { getSetting, getSecret } = await import("@/lib/system-settings");
    const [mode, domains, key] = await Promise.all([
      getSetting<unknown>(LINK_POLICY_KEY, "flag"),
      getSetting<unknown>(BLOCKED_DOMAINS_KEY, []),
      getSecret(SAFE_BROWSING_ENV, SAFE_BROWSING_KEY_SETTING),
    ]);
    return {
      mode: normaliseMode(mode),
      blockedDomains: normaliseDomainList(domains),
      safeBrowsingKey: (key || "").trim(),
    };
  } catch {
    // Settings unreadable: default mode, no blocklist, no API — i.e. the
    // behaviour before this file existed, apart from the scheme rule.
    return { mode: "flag", blockedDomains: [], safeBrowsingKey: "" };
  }
}

// ── Extraction ─────────────────────────────────────────────────────────────

/** Every link in free text, as a fetchable href (scheme added when missing). */
export function extractUrls(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string") return [];
  return findUrls(text).map((f) => f.href);
}

/**
 * Links in rich-text HTML: every href with a scheme (so a
 * `href="javascript:…"` is caught) plus the links in the visible text.
 * Relative hrefs ("/x", "#y") are ours and skipped.
 */
export function extractUrlsFromHtml(html: string | null | undefined): string[] {
  if (!html || typeof html !== "string") return [];
  const out: string[] = [];
  for (const m of html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const v = m[2].replace(/&amp;/g, "&").replace(/&#x?0*3a;?/gi, ":").trim();
    if (v.startsWith("//")) out.push(`https:${v}`);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(v.replace(/[\u0000- ]/g, ""))) out.push(v);
  }
  out.push(...extractUrls(html.replace(/<[^>]*>/g, " ")));
  return out;
}

/** String values anywhere inside a JSON-ish value (listing details etc.). */
export function stringsIn(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => stringsIn(v, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as object).flatMap((v) => stringsIn(v, depth + 1));
  }
  return [];
}

// ── Layer 1 + 2: local rules ───────────────────────────────────────────────

const HARD_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:"]);

function hostOf(raw: string): { host: string | null; scheme: string | null } {
  const s = raw.trim();
  // Browsers strip control chars / whitespace inside a scheme, so
  // "java<TAB>script:" is still javascript:. Match on the cleaned form.
  const cleaned = s.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  let scheme = cleaned.match(/^([a-z][a-z0-9+.-]*:)/)?.[1] ?? null;
  // "example.com:8080/x" is a host and port, not a scheme.
  if (scheme && /^[a-z0-9.-]+:\d/i.test(s)) scheme = null;
  const candidate = scheme ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    return {
      host: u.hostname.toLowerCase().replace(/\.$/, "") || null,
      scheme: scheme ?? "https:",
    };
  } catch {
    return { host: null, scheme };
  }
}

export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") || host.includes(":")) return true; // IPv6
  if (/^\d+(\.\d+){3}$/.test(host)) return true; // dotted IPv4
  // Decimal / hex single-number IPv4 forms ("http://3232235777", "0x7f000001")
  // — the URL parser already folds these into dotted form, this is belt+braces.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return true;
  return false;
}

/** Our own domains — look-alikes of these are the most dangerous. */
function ownDomains(): string[] {
  const out = new Set<string>(["revtype.com"]);
  for (const env of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXTAUTH_URL]) {
    try {
      if (env) out.add(new URL(env).hostname.replace(/^www\./, "").toLowerCase());
    } catch {
      /* ignore */
    }
  }
  out.delete("localhost");
  return [...out];
}

/** Brand words phishing kits imitate; matched only on punycode hosts. */
const BRANDS = [
  "revtype", "google", "gmail", "paypal", "facebook", "instagram", "whatsapp",
  "apple", "icloud", "microsoft", "outlook", "office365", "amazon", "netflix",
  "binance", "coinbase", "metamask", "bkash", "nagad", "rocket", "payoneer",
  "telegram", "tiktok", "youtube", "twitter", "linkedin", "steam", "roblox",
];

/** Latin look-alikes: Cyrillic, Greek and a few others commonly substituted. */
const CONFUSABLES: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "к": "k",
  "м": "m", "т": "t", "в": "b", "н": "h", "ɡ": "g", "ο": "o", "α": "a",
  "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ρ": "p", "τ": "t", "υ": "u",
  "χ": "x", "ω": "w", "ı": "i", "ł": "l",
};

function skeleton(s: string): string {
  return [...s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")]
    .map((c) => CONFUSABLES[c] ?? c)
    .join("");
}

function lookalike(host: string): { status: "unsafe" | "suspicious"; reason: string } | null {
  const own = ownDomains();
  if (own.some((d) => domainMatches(host, d))) return null;

  if (host.split(".").some((l) => l.startsWith("xn--"))) {
    const uni = domainToUnicode(host) || host;
    const sk = skeleton(uni);
    for (const d of own) {
      if (sk === d || sk.endsWith(`.${d}`))
        return { status: "unsafe", reason: `Look-alike of our own domain (${uni})` };
    }
    for (const b of BRANDS) {
      if (sk.includes(b))
        return { status: "unsafe", reason: `Imitates "${b}" using look-alike letters (${uni})` };
    }
  }
  // "revtype-login.com", "secure-revtype.net": our name on someone else's
  // domain. Only flagged — it could be a fan blog.
  const ownNames = own.map((d) => d.split(".")[0]).filter((n) => n.length >= 5);
  for (const n of ownNames) {
    if (host.includes(n))
      return { status: "suspicious", reason: `Uses our name "${n}" on a domain we do not own` };
  }
  return null;
}

/** Layers 1 and 2 only — synchronous, no network. */
export function localVerdict(
  url: string,
  cfg: Pick<LinkSafetyConfig, "mode" | "blockedDomains">
): LinkVerdict {
  const { host, scheme } = hostOf(url);
  if (scheme && HARD_SCHEMES.has(scheme)) {
    return {
      url,
      host,
      status: "hard",
      reasons: [`"${scheme}" links can run code or hide content and are not allowed`],
    };
  }
  if (!host) return { url, host: null, status: "ok", reasons: [] };
  // Other non-web schemes (mailto:, tel:, market:, intent:, tg:) are legitimate
  // deep links on app-install and contact tasks. Not checked further.
  if (scheme && scheme !== "http:" && scheme !== "https:") {
    return { url, host, status: "ok", reasons: [] };
  }
  const blocked = cfg.blockedDomains.find((d) => domainMatches(host, d));
  if (blocked) {
    return {
      url,
      host,
      status: "hard",
      reasons: [`${host} is on the platform's blocked-domain list`],
    };
  }
  if (cfg.mode === "off") return { url, host, status: "ok", reasons: [] };
  const look = lookalike(host);
  if (look) return { url, host, status: look.status, reasons: [look.reason] };
  if (isIpLiteral(host)) {
    return {
      url,
      host,
      status: "suspicious",
      reasons: ["Links to a raw IP address instead of a domain name"],
    };
  }
  return { url, host, status: "ok", reasons: [] };
}

// ── Layer 3: Google Safe Browsing ──────────────────────────────────────────

const SB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const SB_TIMEOUT_MS = 5_000;
const SB_TTL_MS = 6 * 60 * 60 * 1000;
const SB_BATCH = 500; // API maximum per request
const SB_CACHE_MAX = 5_000;
const sbCache = new Map<string, { threats: string[]; at: number }>();

/** For the verify script. */
export function clearLinkSafetyCache(): void {
  sbCache.clear();
}

function sbCacheGet(url: string): string[] | undefined {
  const hit = sbCache.get(url);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SB_TTL_MS) {
    sbCache.delete(url);
    return undefined;
  }
  return hit.threats;
}

function sbCacheSet(url: string, threats: string[]): void {
  if (sbCache.size >= SB_CACHE_MAX) {
    const first = sbCache.keys().next().value;
    if (first !== undefined) sbCache.delete(first);
  }
  sbCache.set(url, { threats, at: Date.now() });
}

/**
 * Threats per URL. URLs Google could not be asked about are simply absent —
 * the caller treats "absent" as safe (fail open).
 */
export async function safeBrowsingLookup(
  urls: string[],
  key: string,
  fetchImpl: typeof fetch = fetch
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!key || urls.length === 0) return out;
  const todo: string[] = [];
  for (const u of new Set(urls)) {
    const c = sbCacheGet(u);
    if (c) out.set(u, c);
    else todo.push(u);
  }
  for (let i = 0; i < todo.length; i += SB_BATCH) {
    const batch = todo.slice(i, i + SB_BATCH);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SB_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${SB_ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          client: { clientId: "revtype", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: batch.map((url) => ({ url })),
          },
        }),
      });
      if (!res.ok) {
        console.warn("[link-safety] Safe Browsing HTTP", res.status);
        continue; // fail open, and don't cache a non-answer
      }
      const data = (await res.json().catch(() => ({}))) as {
        matches?: { threatType?: string; threat?: { url?: string } }[];
      };
      const hits = new Map<string, string[]>();
      for (const m of data.matches ?? []) {
        const u = m.threat?.url;
        if (!u) continue;
        const list = hits.get(u) ?? [];
        if (m.threatType && !list.includes(m.threatType)) list.push(m.threatType);
        hits.set(u, list);
      }
      for (const u of batch) {
        const t = hits.get(u) ?? [];
        sbCacheSet(u, t);
        out.set(u, t);
      }
    } catch (e) {
      console.warn("[link-safety] Safe Browsing unavailable — allowing", (e as Error)?.message);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

const THREAT_WORDS: Record<string, string> = {
  MALWARE: "malware",
  SOCIAL_ENGINEERING: "phishing / deceptive site",
  UNWANTED_SOFTWARE: "unwanted software",
  POTENTIALLY_HARMFUL_APPLICATION: "harmful app",
};

// ── The check ──────────────────────────────────────────────────────────────

/**
 * A verdict for every URL (deduplicated, input order). Never throws.
 */
export async function checkUrls(
  urls: string[],
  deps: LinkSafetyDeps = {}
): Promise<LinkVerdict[]> {
  const list = [...new Set(urls.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean))].slice(0, 200);
  if (list.length === 0) return [];
  const cfg = deps.config ?? (await loadLinkSafetyConfig());
  const verdicts = list.map((u) => localVerdict(u, cfg));

  if (cfg.mode !== "off" && cfg.safeBrowsingKey) {
    const ask = verdicts
      .filter((v) => v.status !== "hard" && v.host && /^https?:\/\//i.test(v.url))
      .map((v) => v.url);
    try {
      const found = await safeBrowsingLookup(ask, cfg.safeBrowsingKey, deps.fetch ?? fetch);
      for (const v of verdicts) {
        const t = found.get(v.url);
        if (t && t.length > 0) {
          v.status = "unsafe";
          v.threats = t;
          v.reasons.push(
            `Google Safe Browsing lists this as ${t.map((x) => THREAT_WORDS[x] ?? x).join(", ")}`
          );
        }
      }
    } catch {
      /* fail open */
    }
  }
  return verdicts;
}

/** Whether a verdict refuses the save, for this surface and mode. */
export function refuses(
  v: LinkVerdict,
  mode: LinkPolicyMode,
  enforcement: LinkEnforcement
): boolean {
  if (enforcement === "never") return false;
  if (v.status === "hard") return true;
  if (enforcement === "hard-only") return false;
  return v.status === "unsafe" && mode === "block";
}

export interface LinkScreenResult {
  ok: boolean;
  /** Present when !ok — shown to the user as-is. */
  message?: string;
  verdicts: LinkVerdict[];
  /** Verdicts that were let through but must be reviewed. */
  flagged: LinkVerdict[];
  /**
   * Raise the abuse signal for flagged links once the row exists. Called
   * automatically when `entityId` was passed; call it with the new id after a
   * create. Safe to call more than once (only the first call reports).
   */
  report: (entityId?: string | null) => void;
}

const SEVERITY: Record<LinkStatus, AbuseSeverity> = {
  ok: "LOW",
  suspicious: "LOW",
  unsafe: "HIGH",
  hard: "MEDIUM",
};

/**
 * The one call a save route makes.
 *
 *   const links = await screenLinks({ texts: [content], urls: [targetUrl] },
 *                                   { userId, entityType: "post" });
 *   if (!links.ok) return NextResponse.json({ error: links.message }, { status: 400 });
 *   const post = await prisma.post.create(...);
 *   links.report(post.id);
 *
 * Never throws: on any internal error it lets the save through.
 */
export async function screenLinks(
  input: {
    /** Free text: links are extracted. */
    texts?: (string | null | undefined)[];
    /** Fields that ARE a link: checked as-is, including the scheme rule. */
    urls?: (string | null | undefined)[];
    /** Rich-text HTML: href/src values plus links in the visible text. */
    html?: (string | null | undefined)[];
  },
  ctx: LinkCheckContext,
  deps: LinkSafetyDeps = {}
): Promise<LinkScreenResult> {
  const noop: LinkScreenResult = { ok: true, verdicts: [], flagged: [], report: () => {} };
  try {
    const urls: string[] = [];
    for (const t of input.texts ?? []) urls.push(...extractUrls(t));
    for (const h of input.html ?? []) urls.push(...extractUrlsFromHtml(h));
    for (const u of input.urls ?? []) if (typeof u === "string" && u.trim()) urls.push(u.trim());
    if (urls.length === 0) return noop;

    const cfg = deps.config ?? (await loadLinkSafetyConfig());
    const verdicts = await checkUrls(urls, { ...deps, config: cfg });
    const enforcement = ctx.enforcement ?? "full";
    const refused = verdicts.filter((v) => refuses(v, cfg.mode, enforcement));
    const flagged = verdicts.filter((v) => v.status !== "ok" && !refused.includes(v));

    if (refused.length > 0) {
      // The attempt itself is worth knowing about: someone tried to post it.
      signal(refused, ctx, null, true);
      const v = refused[0];
      return {
        ok: false,
        message: `This link can't be posted: ${v.host ?? v.url.slice(0, 60)} — ${v.reasons[0] ?? "it was flagged as unsafe"}. Remove it and try again.`,
        verdicts,
        flagged,
        report: () => {},
      };
    }

    let done = false;
    const report = (entityId?: string | null) => {
      if (done || flagged.length === 0) return;
      done = true;
      signal(flagged, ctx, entityId ?? ctx.entityId ?? null, false);
    };
    if (ctx.entityId) report(ctx.entityId);
    return { ok: true, verdicts, flagged, report };
  } catch (e) {
    console.error("[link-safety] screen failed — allowing", e);
    return noop;
  }
}

function signal(
  verdicts: LinkVerdict[],
  ctx: LinkCheckContext,
  entityId: string | null,
  blocked: boolean
): void {
  const worst = verdicts.some((v) => v.status === "unsafe")
    ? "unsafe"
    : verdicts.some((v) => v.status === "hard")
      ? "hard"
      : "suspicious";
  const first = verdicts[0];
  raiseAbuseSignal({
    kind: "LINK_UNSAFE",
    severity: SEVERITY[worst],
    userId: ctx.userId ?? null,
    entityType: ctx.entityType,
    entityId,
    summary: `${blocked ? "Blocked" : "Flagged"} ${verdicts.length === 1 ? "a link" : `${verdicts.length} links`} in a ${ctx.entityType}: ${first.host ?? first.url.slice(0, 80)} — ${first.reasons[0] ?? "unsafe"}`,
    evidence: {
      blocked,
      links: verdicts.map((v) => ({
        url: v.url.slice(0, 500),
        host: v.host,
        status: v.status,
        reasons: v.reasons,
        threats: v.threats ?? [],
      })),
    },
  });
}
