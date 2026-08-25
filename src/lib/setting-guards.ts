/**
 * Bounds for the numeric SystemSetting keys where a typo is expensive.
 *
 * `POST /api/admin/settings` used to upsert **any** key with **any** value, no
 * validation and no audit row. The worst of those keys is `points_per_usd` —
 * it is how many points equal one dollar, and every money boundary reads it
 * (withdrawals, the USD mirror written at earn time, ad credits). Typing `1`
 * where `1000` was meant revalues every balance on the platform by 1000×
 * instantly: a 10,000-point balance becomes $10,000 instead of $10.
 *
 * Deliberately a *rejection*, not a silent clamp: an admin who typed the wrong
 * number should be told, not quietly corrected into a third value they also
 * didn't choose. `getPointsPerUsd()` clamps separately as a runtime safety net
 * for values that reached the row some other way.
 *
 * Prisma-free so verification scripts can import it.
 */

export interface SettingBound {
  min: number;
  max: number;
  /** Reject a fractional value. */
  integer?: boolean;
  /** Human name for the error message. */
  label: string;
  /** Why the bound exists — shown to the admin so the limit isn't mysterious. */
  why: string;
}

export const POINTS_PER_USD_MIN = 10;
export const POINTS_PER_USD_MAX = 1_000_000;

export const NUMERIC_SETTING_BOUNDS: Record<string, SettingBound> = {
  points_per_usd: {
    min: POINTS_PER_USD_MIN,
    max: POINTS_PER_USD_MAX,
    label: "Points per USD",
    why: "This revalues every balance on the platform. Below 10 would make a single point worth more than 10 cents.",
  },
  min_withdrawal: {
    min: 0,
    max: 1_000_000,
    label: "Minimum withdrawal",
    why: "Money columns are Decimal(18, 6).",
  },
  max_withdrawal: {
    min: 0,
    max: 1_000_000,
    label: "Maximum withdrawal",
    why: "Money columns are Decimal(18, 6).",
  },
  withdrawal_fee_percent: {
    min: 0,
    max: 100,
    label: "Withdrawal fee",
    why: "It is a percentage.",
  },
  vat_pct: { min: 0, max: 100, label: "VAT", why: "It is a percentage." },
  "ads.credit_bonus_pct": {
    min: 0,
    max: 100,
    label: "Ad credit bonus",
    why: "It is a percentage.",
  },
  "antifraud.max_users_per_ip": {
    min: 1,
    max: 10_000,
    integer: true,
    label: "Max accounts per IP",
    why: "0 would lock every user out of the platform.",
  },
  "ads.interstitial_min_gap_sec": {
    min: 0,
    max: 3600,
    integer: true,
    label: "Minimum gap between full-screen ads",
    why: "Seconds. 0 disables the gap, which means back-to-back full-screen ads.",
  },
  "ads.interstitial_daily_max": {
    min: 0,
    max: 500,
    integer: true,
    label: "Full-screen ads per user per day",
    why: "0 disables the cap entirely.",
  },
  "ads.cpcUsd": {
    min: 0.001,
    max: 100,
    label: "Cost per click",
    why: "What an advertiser is billed per click — it moves real money.",
  },
  "billing.tax_pct": {
    min: 0,
    max: 100,
    label: "Invoice tax rate",
    why: "It is added to every invoice issued from now on. 0 removes the tax line entirely.",
  },
  "ai.daily_limit_per_user": {
    min: 0,
    max: 10_000,
    integer: true,
    label: "AI daily limit",
    why: "Each call costs money at the provider.",
  },
};

export interface SettingRejection {
  key: string;
  message: string;
}

/**
 * Check a `{ key: value }` bag against the bounds above. Keys with no bound
 * pass through untouched — this guards the expensive ones, it is not a
 * whitelist, so the many admin forms that write their own keys keep working.
 *
 * Returns every problem rather than the first, so an admin fixing a form sees
 * all of it at once.
 */
export function validateSettingValues(
  settings: Record<string, unknown>
): SettingRejection[] {
  const out: SettingRejection[] = [];
  for (const [key, raw] of Object.entries(settings)) {
    const bound = NUMERIC_SETTING_BOUNDS[key];
    if (!bound) continue;
    if (raw === null || raw === undefined || raw === "") continue;

    const n = typeof raw === "string" ? Number(raw) : raw;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      out.push({ key, message: `${bound.label} must be a number.` });
      continue;
    }
    if (bound.integer && !Number.isInteger(n)) {
      out.push({ key, message: `${bound.label} must be a whole number.` });
      continue;
    }
    if (n < bound.min || n > bound.max) {
      out.push({
        key,
        message: `${bound.label} must be between ${bound.min.toLocaleString()} and ${bound.max.toLocaleString()}. ${bound.why}`,
      });
    }
  }
  return out;
}
