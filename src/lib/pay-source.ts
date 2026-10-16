/**
 * Which balance pays — client-safe names and helpers (no prisma, no server-only)
 * shared by the payment choosers and the API routes.
 *
 * The owner's four balances (2026-10-16), see src/lib/ad-wallet.ts:
 *   Earn Points → convert to Cash or Ad Points only, never spent directly.
 *   Cash        → withdraw, or buy products / services / courses.
 *   Ad Points   → platform spending only.
 *   Ad Fund     → platform spending AND products / services / courses.
 */

/** Pays for platform items (boosts, ads, tasks, lottery, plans, badge…). */
export type PaySource = "AD_POINTS" | "AD_FUND";
/** Pays for marketplace products, services and courses. */
export type ShopSource = "CASH" | "AD_FUND";

export function parsePaySource(v: unknown): PaySource | null {
  return v === "AD_POINTS" || v === "AD_FUND" ? v : null;
}

/** Shop purchases default to Cash, as they always have. */
export function parseShopSource(v: unknown): ShopSource {
  return v === "AD_FUND" ? "AD_FUND" : "CASH";
}

export const BALANCE_INFO = {
  EARN_POINTS: {
    name: "Earn Points",
    meaning: "Earned from tasks, referrals and prizes. Convert to Cash to withdraw, or to Ad Points to spend.",
  },
  CASH: {
    name: "Cash",
    meaning: "Withdrawable. Also buys products, services and courses.",
  },
  AD_POINTS: {
    name: "Ad Points",
    meaning: "Spend on boosts, ads, tasks, lottery, plans and the badge. Not withdrawable.",
  },
  AD_FUND: {
    name: "Ad Fund",
    meaning: "Money you added. Spend on platform items and buy products, services and courses. Not withdrawable.",
  },
} as const;

/**
 * Link to Add fund that pre-fills the amount and brings the member back to
 * where they were. `amountUsd` is rounded UP to the cent so the top-up always
 * covers the shortfall.
 */
export function addFundHref(amountUsd?: number, returnTo?: string): string {
  const q = new URLSearchParams();
  if (amountUsd && Number.isFinite(amountUsd) && amountUsd > 0) {
    q.set("amount", (Math.ceil(amountUsd * 100) / 100).toFixed(2));
  }
  // Same-origin paths only — never an open redirect.
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) q.set("returnTo", returnTo);
  const s = q.toString();
  return s ? `/deposit?${s}` : "/deposit";
}

/** USD an Ad Points price costs from Ad Fund (rounded up, as payPlatform does). */
export function adPointsToUsd(adPoints: number, rate: number): number {
  if (!(rate > 0)) return 0;
  return Math.ceil((Math.ceil(adPoints) / rate) * 1e6) / 1e6;
}

/** Ad Points for a USD price (rounded up so the platform is never short). */
export function usdToAdPoints(usdAmount: number, rate: number): number {
  return Math.ceil(Math.round(usdAmount * rate * 1e6) / 1e6);
}

/**
 * The default source: Ad Points if they cover it, else Ad Fund if it does,
 * else null (neither covers — show Add fund).
 */
export function defaultPaySource(
  adPoints: number,
  balances: { adPoints: number; adFundUsd: number },
  rate: number
): PaySource | null {
  if (balances.adPoints >= Math.ceil(adPoints)) return "AD_POINTS";
  if (balances.adFundUsd + 1e-9 >= adPointsToUsd(adPoints, rate)) return "AD_FUND";
  return null;
}

/**
 * A platform price in both spend units. Prices set in points are Ad Points;
 * prices set in USD are charged as that USD from Ad Fund, or as Ad Points at
 * the rate (owner, 2026-10-16). `usdFixed` says the USD figure is the price
 * itself rather than derived from Ad Points.
 */
export interface PlatformQuote {
  adPoints: number;
  usd: number;
  usdFixed: boolean;
}

export function quotePlatformPrice(price: { points?: number; usd?: number }, rate: number): PlatformQuote {
  const pts = Number(price.points) || 0;
  const usdP = Number(price.usd) || 0;
  // Priced in both (e.g. promotion packages): Ad Points pay the points price,
  // Ad Fund pays the dollar price — each balance pays the price set for it.
  if (pts > 0 && usdP > 0) {
    return { adPoints: Math.ceil(pts), usd: Math.round(usdP * 1e6) / 1e6, usdFixed: true };
  }
  if (pts > 0) return { adPoints: Math.ceil(pts), usd: adPointsToUsd(pts, rate), usdFixed: false };
  if (usdP > 0) {
    return { adPoints: usdToAdPoints(usdP, rate), usd: Math.round(usdP * 1e6) / 1e6, usdFixed: true };
  }
  return { adPoints: 0, usd: 0, usdFixed: false };
}

/** defaultPaySource for a quote (Ad Fund coverage checked against its USD). */
export function defaultPaySourceForQuote(
  q: PlatformQuote,
  balances: { adPoints: number; adFundUsd: number }
): PaySource | null {
  if (balances.adPoints >= q.adPoints) return "AD_POINTS";
  if (balances.adFundUsd + 1e-9 >= q.usd) return "AD_FUND";
  return null;
}
