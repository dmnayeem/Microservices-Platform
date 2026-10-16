/**
 * Boost prices (owner, 2026-10-16): the admin sets, per kind of event, whether
 * it is charged and how many Ad Points it costs — with an override per country
 * (the VIEWER's country). Stored as the JSON setting BOOST_PRICING_KEY.
 * Client-safe: the admin editor and the member's estimate use it too.
 */

export const BOOST_EVENT_KINDS = ["IMPRESSION", "VIEW", "CLICK", "LIKE", "COMMENT", "SHARE"] as const;
export type BoostEventKind = (typeof BOOST_EVENT_KINDS)[number];

export const BOOST_EVENT_LABEL: Record<BoostEventKind, string> = {
  IMPRESSION: "Impression (shown in the feed)",
  VIEW: "View (on screen for 1 second or more)",
  CLICK: "Click (opened the post or its link)",
  LIKE: "Like",
  COMMENT: "Comment",
  SHARE: "Share",
};

export interface BoostPricing {
  /** Default price per event kind, in Ad Points, and whether it is charged at all. */
  events: Record<BoostEventKind, { enabled: boolean; price: number }>;
  /** ISO-2 country → price overrides (a missing kind uses the default). */
  countries: Record<string, Partial<Record<BoostEventKind, number>>>;
  /** Smallest budget a member may set, in Ad Points. */
  minBudget: number;
  /** Longest run, in days. */
  maxDays: number;
  /** Every boost waits for an admin before it runs. */
  requireReview: boolean;
  /** Times one viewer is shown the same boost (0 = unlimited). */
  maxPerViewer: number;
}

export const BOOST_PRICING_KEY = "boost.pricing";

export const DEFAULT_BOOST_PRICING: BoostPricing = {
  events: {
    IMPRESSION: { enabled: false, price: 1 },
    VIEW: { enabled: true, price: 1 },
    CLICK: { enabled: true, price: 5 },
    LIKE: { enabled: true, price: 3 },
    COMMENT: { enabled: true, price: 5 },
    SHARE: { enabled: true, price: 8 },
  },
  countries: {},
  minBudget: 100,
  maxDays: 30,
  requireReview: true,
  maxPerViewer: 5,
};

const num = (v: unknown, d: number, min = 0, max = 1_000_000) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};

export function normalizeBoostPricing(raw: unknown): BoostPricing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ev = (r.events && typeof r.events === "object" ? r.events : {}) as Record<string, { enabled?: unknown; price?: unknown }>;
  const events = { ...DEFAULT_BOOST_PRICING.events };
  for (const k of BOOST_EVENT_KINDS) {
    const e = ev[k];
    if (e) events[k] = { enabled: e.enabled === true, price: num(e.price, events[k].price, 0) };
  }
  const countries: BoostPricing["countries"] = {};
  const cr = (r.countries && typeof r.countries === "object" ? r.countries : {}) as Record<string, Record<string, unknown>>;
  for (const [cc, prices] of Object.entries(cr)) {
    if (!/^[A-Z]{2}$/.test(cc) || !prices || typeof prices !== "object") continue;
    const out: Partial<Record<BoostEventKind, number>> = {};
    for (const k of BOOST_EVENT_KINDS) if (prices[k] !== undefined && prices[k] !== "") out[k] = num(prices[k], 0, 0);
    countries[cc] = out;
  }
  return {
    events,
    countries,
    minBudget: num(r.minBudget, DEFAULT_BOOST_PRICING.minBudget, 1),
    maxDays: num(r.maxDays, DEFAULT_BOOST_PRICING.maxDays, 1, 365),
    requireReview: r.requireReview === undefined ? DEFAULT_BOOST_PRICING.requireReview : r.requireReview === true,
    maxPerViewer: num(r.maxPerViewer, DEFAULT_BOOST_PRICING.maxPerViewer, 0, 1000),
  };
}

/** Ad Points one event costs for a viewer in `country`; null = not charged/counted. */
export function boostEventPrice(p: BoostPricing, kind: BoostEventKind, country: string | null | undefined): number | null {
  if (!p.events[kind]?.enabled) return null;
  const cc = (country ?? "").toUpperCase();
  const o = cc ? p.countries[cc]?.[kind] : undefined;
  return o !== undefined ? o : p.events[kind].price;
}
