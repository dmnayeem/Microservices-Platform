import { getSetting } from "@/lib/system-settings";
import { CLICK_TOKEN_TTL_MS, VIEW_TOKEN_TTL_MS } from "@/lib/ad-serve-token";

/**
 * Invalid-traffic (IVT) rules for ad measurement.
 *
 * Every measured event (viewable impression, click, estimated click, page
 * script execution) is judged here at ingestion. An event that fails a rule is
 * STORED with `valid: false` and the first failing rule as its reason — never
 * dropped silently — so the owner can see what was filtered and why, and so a
 * rule that turns out too strict can be relaxed without the evidence being gone.
 *
 * Integrity failures (forged / expired / replayed token) are always invalid.
 * Every other rule can be switched off, and every threshold edited, from
 * Ad Manager → Analytics → Measurement settings (`ads.ivt`).
 *
 * This is a data-quality filter, not a security perimeter: it catches honest
 * bots, automation that announces itself, and the patterns that cheap click
 * fraud leaves behind. The money guard is the token — single-use, signed,
 * bound to the delivery — which a bot cannot get without being served.
 */

export const IVT_SETTING_KEY = "ads.ivt";

export const IVT_RULES = [
  "botUa",
  "automation",
  "noSignals",
  "noActivity",
  "hiddenPage",
  "zeroViewport",
  "viewerMismatch",
  "timing",
  "rate",
  "selfTraffic",
  "datacenter",
] as const;
export type IvtRule = (typeof IVT_RULES)[number];

export const IVT_RULE_LABELS: Record<IvtRule, string> = {
  botUa: "Known bot / crawler / scripted client (user agent)",
  automation: "Browser automation (navigator.webdriver, script-generated click)",
  noSignals: "Event arrived without the page's measurement signals",
  noActivity: "Click with no mouse / touch / scroll / key activity on the page first",
  hiddenPage: "Page was hidden (background tab)",
  zeroViewport: "Browser window has no size",
  viewerMismatch: "Event came from a different viewer than the ad was served to",
  timing: "Impossible timing (view < 1s after serve, click too soon after the ad appeared)",
  rate: "Too many impressions / clicks from one viewer, or a burst from one IP + browser",
  selfTraffic: "Advertiser viewing or clicking their own ad",
  datacenter: "VPN / datacenter IP (uses the Fraud Monitor range list)",
};

export interface IvtSettings {
  /** Master switch. Off = only token integrity is enforced. */
  enabled: boolean;
  rules: Record<IvtRule, boolean>;
  /** Per viewer, all ads. */
  maxViewsPerMinute: number;
  /** Per viewer, same ad. */
  maxClicksPerHourPerAd: number;
  /** Per IP + browser, any measured event, in 10 seconds. */
  burstPer10s: number;
  /** A click this soon after the ad appeared is not a person. */
  minClickAfterViewMs: number;
  /** Raw `AdEvent` rows are deleted after this many days (rollups are kept). */
  rawRetentionDays: number;
}

export const IVT_DEFAULTS: IvtSettings = {
  enabled: true,
  rules: Object.fromEntries(IVT_RULES.map((r) => [r, true])) as Record<IvtRule, boolean>,
  maxViewsPerMinute: 40,
  maxClicksPerHourPerAd: 3,
  burstPer10s: 30,
  minClickAfterViewMs: 300,
  rawRetentionDays: 30,
};

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

/** Normalise whatever is stored (or posted) into a complete, bounded object. */
export function normalizeIvtSettings(raw: unknown): IvtSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<IvtSettings> & {
    rules?: Partial<Record<IvtRule, unknown>>;
  };
  const rules = { ...IVT_DEFAULTS.rules };
  for (const k of IVT_RULES) {
    if (typeof r.rules?.[k] === "boolean") rules[k] = r.rules[k] as boolean;
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : IVT_DEFAULTS.enabled,
    rules,
    maxViewsPerMinute: clampInt(r.maxViewsPerMinute, 1, 1000, IVT_DEFAULTS.maxViewsPerMinute),
    maxClicksPerHourPerAd: clampInt(r.maxClicksPerHourPerAd, 1, 100, IVT_DEFAULTS.maxClicksPerHourPerAd),
    burstPer10s: clampInt(r.burstPer10s, 1, 1000, IVT_DEFAULTS.burstPer10s),
    minClickAfterViewMs: clampInt(r.minClickAfterViewMs, 0, 5000, IVT_DEFAULTS.minClickAfterViewMs),
    rawRetentionDays: clampInt(r.rawRetentionDays, 3, 365, IVT_DEFAULTS.rawRetentionDays),
  };
}

export async function getIvtSettings(): Promise<IvtSettings> {
  return normalizeIvtSettings(await getSetting<unknown>(IVT_SETTING_KEY, null));
}

/**
 * Known non-human user agents. Compact on purpose; `bot|crawl|spider` covers
 * the long tail (Googlebot, AdsBot, bingbot, …), the rest are clients that do
 * not say "bot". An EMPTY user agent is also treated as a bot.
 */
const BOT_UA_RE = new RegExp(
  [
    // Not a bare `bot`: "CUBOT" is an Android phone brand in real user agents.
    "\\bbot\\b", "bot[/;)_-]", "crawl", "spider", "slurp", "mediapartners-google", "adsbot",
    "apis-google", "feedfetcher", "google-read-aloud", "google web preview",
    "headless", "puppeteer", "playwright", "selenium", "webdriver", "phantomjs",
    "cypress", "nightmare", "electron/", "lighthouse", "pagespeed", "gtmetrix",
    "pingdom", "uptime", "statuscake", "site24x7",
    "python-", "python/", "aiohttp", "scrapy", "httpx", "curl/", "wget", "httpclient",
    "okhttp", "axios/", "node-fetch", "undici", "got \\(", "go-http-client", "java/",
    "libwww", "perl/", "php/", "postman", "insomnia", "httpie",
    "facebookexternalhit", "facebookcatalog", "whatsapp", "skypeuripreview", "embedly", "vkshare", "preview",
  ].join("|"),
  "i"
);

export function isBotUa(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  if (s.length < 8) return true;
  return BOT_UA_RE.test(s);
}

/** What the page reports about itself with every beacon / click. */
export interface ClientSignals {
  /** navigator.webdriver */
  wd: boolean;
  /** The click event was trusted (a real input, not `el.click()`). */
  tr: boolean;
  /** Any trusted pointer / touch / scroll / key activity on the page before. */
  act: boolean;
  /** document.hidden at send time. */
  hid: boolean;
  /** Viewport is 0×0. */
  vp0: boolean;
  /** ms since the ad first crossed the visibility threshold; -1 = never. */
  dv: number;
}

/** `sg=` query form: "wd.tr.act.hid.vp0.dv". */
export function parseSignalsParam(s: string | null | undefined): ClientSignals | null {
  if (!s) return null;
  const p = s.split(".");
  if (p.length !== 6) return null;
  const b = (x: string) => x === "1";
  const dv = Number(p[5]);
  return { wd: b(p[0]!), tr: b(p[1]!), act: b(p[2]!), hid: b(p[3]!), vp0: b(p[4]!), dv: Number.isFinite(dv) ? dv : -1 };
}

export function parseSignalsBody(o: unknown): ClientSignals | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const dv = Number(r.dv);
  return {
    wd: r.wd === true || r.wd === 1,
    tr: r.tr === true || r.tr === 1,
    act: r.act === true || r.act === 1,
    hid: r.hid === true || r.hid === 1,
    vp0: r.vp0 === true || r.vp0 === 1,
    dv: Number.isFinite(dv) ? dv : -1,
  };
}

export type MeasureKind = "VIEW" | "CLICK" | "EST_CLICK" | "SCRIPT_EXEC";

export interface IvtInput {
  kind: MeasureKind;
  /** now - token issued-at. */
  tokenAgeMs: number;
  /** Token viewer key vs the beacon's. */
  tokenViewerKey: string;
  /** `adViewerKey(null, ua)` of the beacon request — compared for anon tokens. */
  anonKeyNow: string;
  sessionUserId: string | null;
  ua: string;
  signals: ClientSignals | null;
  rate: { viewsLastMin: number; clicksLastHourSameAd: number; burst10s: number } | null;
  advertiserId: string | null;
  datacenter: boolean;
}

/**
 * First failing rule, or null when the event is valid. Integrity checks run
 * first and ignore the settings.
 */
export function judgeEvent(i: IvtInput, s: IvtSettings): string | null {
  // ── integrity (always on) ────────────────────────────────────────────────
  if (i.tokenAgeMs < -60_000) return "bad_token";
  const ttl = i.kind === "CLICK" || i.kind === "EST_CLICK" ? CLICK_TOKEN_TTL_MS : VIEW_TOKEN_TTL_MS;
  if (i.tokenAgeMs > ttl) return "expired";

  if (!s.enabled) return null;
  const on = s.rules;
  const sig = i.signals;
  const isClick = i.kind === "CLICK" || i.kind === "EST_CLICK";

  if (on.botUa && isBotUa(i.ua)) return "bot_ua";
  if (on.noSignals && !sig) return "no_client_signals";
  if (on.automation && sig?.wd) return "webdriver";
  if (on.automation && isClick && sig && !sig.tr) return "untrusted_click";

  if (on.viewerMismatch) {
    if (i.tokenViewerKey.startsWith("u:")) {
      // Signed out since the serve is tolerated (session expiry); a DIFFERENT
      // signed-in account presenting the token is not.
      if (i.sessionUserId && i.tokenViewerKey !== `u:${i.sessionUserId}`) return "viewer_mismatch";
    } else if (i.tokenViewerKey !== i.anonKeyNow) {
      return "viewer_mismatch";
    }
  }

  if (on.timing) {
    if (i.kind === "VIEW" && i.tokenAgeMs < 1000) return "view_too_fast";
    if (isClick) {
      if (i.tokenAgeMs < s.minClickAfterViewMs) return "click_too_fast";
      if (sig && sig.dv >= 0 && sig.dv < s.minClickAfterViewMs) return "click_too_fast";
    }
  }

  if (on.hiddenPage && sig?.hid) return "hidden_page";
  if (on.zeroViewport && sig?.vp0) return "zero_viewport";
  if (on.noActivity && isClick && sig && !sig.act) return "no_activity";
  if (on.selfTraffic && i.sessionUserId && i.advertiserId === i.sessionUserId) return "self_traffic";
  if (on.datacenter && i.datacenter) return "datacenter_ip";

  if (on.rate && i.rate) {
    if (i.rate.burst10s >= s.burstPer10s) return "burst";
    if (i.kind === "VIEW" && i.rate.viewsLastMin >= s.maxViewsPerMinute) return "rate_views";
    if (isClick && i.rate.clicksLastHourSameAd >= s.maxClicksPerHourPerAd) return "rate_clicks";
  }
  return null;
}

/** Plain-language labels for every reason code that can be stored. */
export const IVT_REASON_LABELS: Record<string, string> = {
  bad_token: "Forged or garbled serve token",
  no_token: "No serve token",
  expired: "Token expired",
  replayed: "Same delivery counted twice (replay)",
  ad_not_found: "Ad no longer exists",
  bot_ua: "Bot / crawler user agent",
  no_client_signals: "No page signals",
  webdriver: "Browser automation (webdriver)",
  untrusted_click: "Script-generated click",
  viewer_mismatch: "Different viewer than served to",
  view_too_fast: "Viewed < 1s after serve",
  click_too_fast: "Clicked too soon after appearing",
  hidden_page: "Hidden page",
  zero_viewport: "Zero-size window",
  no_activity: "No activity before click",
  self_traffic: "Advertiser's own traffic",
  datacenter_ip: "VPN / datacenter IP",
  burst: "Burst from one IP + browser",
  rate_views: "Too many impressions per minute",
  rate_clicks: "Too many clicks per hour on one ad",
  unfilled: "Network unit did not fill",
};
