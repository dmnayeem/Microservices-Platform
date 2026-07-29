/**
 * Single source of truth for package-tier presentation + economics constants.
 *
 * Previously these lived inline in wallet/withdrawal-view.tsx (limits, fee
 * discount, base fee) and packages/packages-view.tsx (gradient). Centralising
 * them keeps the numbers in lock-step and makes future changes one-edit.
 *
 * NOTE: the human-readable feature blurbs (packages-view `FEATURES`) are NOT
 * moved here — they diverge from `TIER_LIMITS` (e.g. FREE shows a "$5–$500"
 * range in marketing copy while the real FREE withdrawal limit is 0). Reconciling
 * that copy is a product decision, not a mechanical dedup, so it stays local.
 */

export const TIER_KEYS = ["FREE", "STARTER", "PRO", "ELITE", "VIP"] as const;
export type Tier = (typeof TIER_KEYS)[number];

/** Withdrawal min/max per tier (USD). */
export const TIER_LIMITS: Record<string, { min: number; max: number }> = {
  FREE: { min: 0, max: 0 },
  STARTER: { min: 5, max: 1000 },
  PRO: { min: 10, max: 5000 },
  ELITE: { min: 20, max: 25000 },
  VIP: { min: 50, max: 100000 },
};

/** Fractional discount applied to the base withdrawal fee, per tier. */
export const TIER_FEE_DISCOUNT: Record<string, number> = {
  FREE: 0,
  STARTER: 0.1,
  PRO: 0.25,
  ELITE: 0.4,
  VIP: 0.5,
};

/** Base withdrawal fee before any tier discount (5%). */
export const BASE_FEE_PCT = 0.05;

/** Tailwind gradient stops used on tier badges/cards. */
export const TIER_GRADIENT: Record<Tier, string> = {
  FREE: "from-gray-600 to-gray-700",
  STARTER: "from-indigo-500 to-cyan-500",
  PRO: "from-purple-500 to-pink-500",
  ELITE: "from-amber-500 to-orange-500",
  VIP: "from-emerald-500 to-teal-500",
};
