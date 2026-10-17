/**
 * VISIT tasks — paid visits to an outside link. Client-safe (no Prisma).
 *
 * Two kinds:
 *  - DIRECT: an ad network's direct / smart link. The user opens it through
 *    /go/task/[id] (the server notes the time), stays at least `staySeconds`,
 *    and comes back to the task tab; the server measures the time away. Back
 *    too early = no points (they may try again).
 *  - SHORTENER: a URL-shortener link (ouo.io, shrinkme, …) whose destination
 *    is OUR page /v/[taskId]. Arriving there (same browser, signed in) shows a
 *    personal code; the user enters it to claim. Arrival is checked: it must
 *    come through the shortener (referrer) and not faster than `minSeconds`.
 *    Anything doubtful goes to review instead of paying.
 *
 * DIRECT options (2026-10-17):
 *  - `viewer`: "tab" (default) opens the link in a new tab and only the time
 *    away is checked. "inapp" shows it inside RevType's own viewer (an iframe
 *    under a checklist): scroll X%, stay N seconds, click N times. The page is
 *    cross-origin, so scroll and clicks are what the viewer REPORTS — only the
 *    time (server clock, /api/tasks/[id]/visit-progress) is a hard check. If
 *    the site refuses to be framed, the member falls back to a new tab and a
 *    task with scroll/click steps goes to review instead of paying.
 *  - `source`: "direct" (default), "social" (/go/task sends the member to a
 *    real social post; they tap the link in it, so the site sees real social
 *    traffic) or "search" (a real search for `searchKeyword`; they pick the
 *    site from the results). Nothing here fakes or spoofs a referrer.
 *  - `utmSource/utmMedium/utmCampaign`: appended to the target link (never to
 *    the post / search page), without overwriting tags the link already has.
 *
 * Ad networks and shorteners: many forbid paid ("incentivised") traffic —
 * Adsterra and Google AdSense do. Paying users to open such a link can get the
 * account banned and its earnings withheld. The admin confirms per task that
 * the link's network allows it (`incentiveAllowed`); the form warns otherwise.
 */

export type VisitKind = "DIRECT" | "SHORTENER";
export type VisitViewer = "tab" | "inapp";
export type VisitSource = "direct" | "social" | "search";
export type VisitSearchEngine = "google" | "bing";

export interface VisitConfig {
  kind: VisitKind;
  /** The link users open (direct/smart link or the shortened URL). */
  url: string;
  /** DIRECT: seconds the user must stay away on the link. */
  staySeconds: number;
  /** SHORTENER: the fewest seconds a real pass through the shortener takes. */
  minSeconds: number;
  /** SHORTENER: hosts the user must arrive from (empty = the url's own host). */
  shortenerHosts: string[];
  /** SHORTENER: arrival with no / another referrer → review (default) or block. */
  onUnknownSource: "review" | "block";
  /**
   * SHORTENER: the end page opened in a browser that isn't signed in (apps
   * often open links in the phone's other browser). "off" = ask them to sign
   * in; "review" (default) = show a one-time code, claim held for an admin;
   * "auto" = one-time code, paid like a signed-in arrival.
   */
  signedOutCode: "off" | "review" | "auto";
  /** Pay without review when every check passes. */
  autoApprove: boolean;
  /** The admin confirmed this link's network allows paid traffic. */
  incentiveAllowed: boolean;
  /** DIRECT: new tab (time only) or RevType's in-app viewer (checklist). */
  viewer: VisitViewer;
  /** In-app only: page scroll % to reach (0 = off). Client-reported. */
  scrollPercent: number;
  /** In-app only: taps / clicks on the page (0 = off). Client-reported. */
  clicks: number;
  /** DIRECT: how the member reaches the link. */
  source: VisitSource;
  /** source = social: the post (with the link in it) the member opens first. */
  socialPostUrl: string;
  /** source = search: what the member searches for. */
  searchKeyword: string;
  searchEngine: VisitSearchEngine;
  /** Optional tracking tags appended to the target link. */
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

export const VISIT_DEFAULTS: VisitConfig = {
  kind: "DIRECT",
  url: "",
  staySeconds: 30,
  minSeconds: 15,
  shortenerHosts: [],
  onUnknownSource: "review",
  signedOutCode: "review",
  autoApprove: true,
  incentiveAllowed: false,
  viewer: "tab",
  scrollPercent: 0,
  clicks: 0,
  source: "direct",
  socialPostUrl: "",
  searchKeyword: "",
  searchEngine: "google",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
};

/** Most clicks an in-app task may ask for. */
export const VISIT_MAX_CLICKS = 20;

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  DIRECT: "Direct / Smart link",
  SHORTENER: "URL shortener",
};

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Normalise whatever is stored / submitted. */
export function normalizeVisitConfig(raw: unknown): VisitConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: VisitKind = r.kind === "SHORTENER" ? "SHORTENER" : "DIRECT";
  const url = typeof r.url === "string" ? r.url.trim().slice(0, 1000) : "";
  const hosts = Array.isArray(r.shortenerHosts)
    ? r.shortenerHosts
    : typeof r.shortenerHosts === "string"
      ? r.shortenerHosts.split(/[\s,]+/)
      : [];
  const source: VisitSource =
    kind === "DIRECT" && (r.source === "social" || r.source === "search") ? r.source : "direct";
  // Social posts and search pages refuse to be framed, so those visits always
  // go through a new tab; the checklist steps only exist in the viewer.
  const viewer: VisitViewer = kind === "DIRECT" && source === "direct" && r.viewer === "inapp" ? "inapp" : "tab";
  const inapp = viewer === "inapp";
  return {
    kind,
    url,
    staySeconds: int(r.staySeconds, VISIT_DEFAULTS.staySeconds, 5, 600),
    minSeconds: int(r.minSeconds, VISIT_DEFAULTS.minSeconds, 0, 600),
    shortenerHosts: [
      ...new Set(
        hosts
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""))
          .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h))
      ),
    ].slice(0, 20),
    onUnknownSource: r.onUnknownSource === "block" ? "block" : "review",
    signedOutCode: r.signedOutCode === "off" || r.signedOutCode === "auto" ? r.signedOutCode : "review",
    // A shortener arrival rests on a Referer header a script can forge, so a
    // shortener task is reviewed unless the admin turns auto-pay on.
    autoApprove: kind === "SHORTENER" ? r.autoApprove === true : r.autoApprove !== false,
    incentiveAllowed: r.incentiveAllowed === true,
    viewer,
    scrollPercent: inapp ? int(r.scrollPercent, 0, 0, 100) : 0,
    clicks: inapp ? int(r.clicks, 0, 0, VISIT_MAX_CLICKS) : 0,
    source,
    socialPostUrl: source === "social" ? str(r.socialPostUrl, 1000) : "",
    searchKeyword: source === "search" ? str(r.searchKeyword, 200) : "",
    searchEngine: r.searchEngine === "bing" ? "bing" : "google",
    utmSource: kind === "DIRECT" ? str(r.utmSource, 100) : "",
    utmMedium: kind === "DIRECT" ? str(r.utmMedium, 100) : "",
    utmCampaign: kind === "DIRECT" ? str(r.utmCampaign, 100) : "",
  };
}

/** Problems that stop a Visit task from being saved, or null. */
export function validateVisitConfig(c: VisitConfig): string | null {
  if (!c.url) return "Add the link users should open.";
  let u: URL;
  try {
    u = new URL(c.url);
  } catch {
    return "The link must be a full address starting with https://";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "The link must start with https://";
  if (c.kind === "DIRECT" && c.viewer === "inapp" && u.protocol !== "https:") {
    return "The in-app viewer needs an https:// link — an http page can't be shown inside RevType.";
  }
  if (c.kind === "DIRECT" && c.source === "social") {
    if (!c.socialPostUrl) return "Add the social post the member should open (the one with your link in it).";
    let p: URL;
    try {
      p = new URL(c.socialPostUrl);
    } catch {
      return "The social post must be a full address starting with https://";
    }
    if (p.protocol !== "https:" && p.protocol !== "http:") return "The social post must start with https://";
  }
  if (c.kind === "DIRECT" && c.source === "search" && !c.searchKeyword) {
    return "Add the keyword the member should search for.";
  }
  return null;
}

/** Does this task need the in-app viewer's scroll / click steps? */
export const visitHasViewerSteps = (c: VisitConfig) =>
  c.kind === "DIRECT" && c.viewer === "inapp" && (c.scrollPercent > 0 || c.clicks > 0);

/**
 * The member's checklist, in order (scroll first; the timer is shown after
 * it). Used by the admin preview and the in-app viewer.
 */
export function visitChecklist(c: Pick<VisitConfig, "viewer" | "scrollPercent" | "staySeconds" | "clicks">): {
  key: "scroll" | "stay" | "clicks";
  text: string;
}[] {
  const out: { key: "scroll" | "stay" | "clicks"; text: string }[] = [];
  if (c.viewer === "inapp" && c.scrollPercent > 0) out.push({ key: "scroll", text: `Scroll ${c.scrollPercent}% of the page` });
  out.push({ key: "stay", text: `Stay ${c.staySeconds} seconds` });
  if (c.viewer === "inapp" && c.clicks > 0) {
    out.push({ key: "clicks", text: `Click ${c.clicks} time${c.clicks === 1 ? "" : "s"} on the page` });
  }
  return out;
}

/** The target link with the UTM tags added (tags already on the link win). */
export function withUtm(url: string, c: Pick<VisitConfig, "utmSource" | "utmMedium" | "utmCampaign">): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const tags: [string, string][] = [
    ["utm_source", c.utmSource],
    ["utm_medium", c.utmMedium],
    ["utm_campaign", c.utmCampaign],
  ];
  for (const [k, v] of tags) if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
}

/** A real results page for the keyword on the chosen engine. */
export function visitSearchUrl(engine: VisitSearchEngine, keyword: string): string {
  const base = engine === "bing" ? "https://www.bing.com/search" : "https://www.google.com/search";
  return `${base}?q=${encodeURIComponent(keyword)}`;
}

/**
 * Where /go/task sends a DIRECT visit: the target (with UTM tags), the social
 * post, or the search results page. Shortener: the short link as stored.
 */
export function visitOutboundUrl(c: VisitConfig): string {
  if (c.kind !== "DIRECT") return c.url;
  if (c.source === "social") return c.socialPostUrl;
  if (c.source === "search") return visitSearchUrl(c.searchEngine, c.searchKeyword);
  return withUtm(c.url, c);
}

/** The hosts a shortener arrival may come from. */
export function allowedShortenerHosts(c: VisitConfig): string[] {
  const own = hostOf(c.url);
  return [...new Set([...(c.shortenerHosts ?? []), ...(own ? [own] : [])])];
}

/** Does a referrer host belong to the allowed shortener hosts (or a subdomain)? */
export function hostMatches(host: string | null, allowed: string[]): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** Minutes a signed-out one-time code stays valid. */
export const VISIT_PASS_TTL_MIN = 30;

/** Upper-case letters and digits only, for comparing typed codes. */
export const normVisitCode = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Path of the shortener destination page on this site. */
export const visitDestinationPath = (taskId: string) => `/v/${taskId}`;
