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
 * Ad networks and shorteners: many forbid paid ("incentivised") traffic —
 * Adsterra and Google AdSense do. Paying users to open such a link can get the
 * account banned and its earnings withheld. The admin confirms per task that
 * the link's network allows it (`incentiveAllowed`); the form warns otherwise.
 */

export type VisitKind = "DIRECT" | "SHORTENER";

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
  /** Pay without review when every check passes. */
  autoApprove: boolean;
  /** The admin confirmed this link's network allows paid traffic. */
  incentiveAllowed: boolean;
}

export const VISIT_DEFAULTS: VisitConfig = {
  kind: "DIRECT",
  url: "",
  staySeconds: 30,
  minSeconds: 15,
  shortenerHosts: [],
  onUnknownSource: "review",
  autoApprove: true,
  incentiveAllowed: false,
};

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  DIRECT: "Direct / Smart link",
  SHORTENER: "URL shortener",
};

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

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
    autoApprove: r.autoApprove !== false,
    incentiveAllowed: r.incentiveAllowed === true,
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
  return null;
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

/** Path of the shortener destination page on this site. */
export const visitDestinationPath = (taskId: string) => `/v/${taskId}`;
