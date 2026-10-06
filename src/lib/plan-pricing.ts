/**
 * Plan price math — ONE definition, shared by the purchase API (what is
 * charged) and the plans page (what is quoted). Client-safe: no server imports.
 *
 * Before this the server and the client each had their own copy and they
 * disagreed: the server called a plan free only when `priceMonthly === 0 &&
 * priceYearly == null`, the client when `!priceYearly`, and neither honoured
 * `priceYearly` for a YEARLY purchase — the yearly price an admin typed was
 * shown on the card and then ignored at checkout.
 */

export type PlanDuration = "MONTHLY" | "QUARTERLY" | "YEARLY" | "LIFETIME";

export const PLAN_DURATION_DAYS: Record<PlanDuration, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
  LIFETIME: 36500, // 100 years — effectively forever
};

export const PLAN_DURATION_DISCOUNT: Record<PlanDuration, number> = {
  MONTHLY: 0,
  QUARTERLY: 0.1,
  YEARLY: 0.2,
  LIFETIME: 0.5,
};

export const PLAN_DURATION_MONTHS: Record<PlanDuration, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  LIFETIME: 36,
};

export interface PlanPriceInput {
  priceMonthly: number;
  priceYearly?: number | null;
}

/** Round to whole cents (half-up). Every charged/quoted total goes through this. */
export function roundCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const yearlySet = (p: PlanPriceInput) => p.priceYearly != null && Number(p.priceYearly) > 0;

/**
 * A free plan: nothing to pay for any duration. `priceYearly` of 0 counts as
 * "not set" (the admin form allows 0), so it can never make a plan free on
 * the client and paid on the server, or the other way round.
 */
export function isFreePlan(p: PlanPriceInput): boolean {
  return !(Number(p.priceMonthly) > 0) && !yearlySet(p);
}

/**
 * Durations a plan can be bought for. A plan with only a yearly price (monthly
 * 0, yearly set) is YEARLY-only — otherwise picking MONTHLY would have bought
 * it for $0.
 */
export function planDurations(p: PlanPriceInput): PlanDuration[] {
  if (isFreePlan(p)) return ["MONTHLY"];
  if (!(Number(p.priceMonthly) > 0)) return ["YEARLY"];
  return ["MONTHLY", "QUARTERLY", "YEARLY", "LIFETIME"];
}

/**
 * The full price (USD, whole cents) for a plan + duration, before any credit
 * from a plan being replaced. YEARLY uses `priceYearly` when the admin set
 * one; everything else is monthly × months × (1 − duration discount).
 * Returns null when the plan cannot be bought for that duration.
 */
export function planPriceUsd(p: PlanPriceInput, duration: PlanDuration): number | null {
  if (isFreePlan(p)) return 0;
  if (!planDurations(p).includes(duration)) return null;
  if (duration === "YEARLY" && yearlySet(p)) return roundCents(Number(p.priceYearly));
  const monthly = Number(p.priceMonthly);
  return roundCents(
    monthly * PLAN_DURATION_MONTHS[duration] * (1 - PLAN_DURATION_DISCOUNT[duration])
  );
}

/** The saving vs paying monthly, as a fraction (0..1) — for the "Save x%" label. */
export function planSavingFraction(p: PlanPriceInput, duration: PlanDuration): number {
  const total = planPriceUsd(p, duration);
  const monthly = Number(p.priceMonthly);
  if (total == null || !(monthly > 0)) return 0;
  const full = monthly * PLAN_DURATION_MONTHS[duration];
  return full > 0 ? Math.max(0, Math.round((1 - total / full) * 100) / 100) : 0;
}

/**
 * Credit for the unused part of the plan being replaced (a switch to a
 * DIFFERENT plan while one is active).
 *
 *   credit = what was actually paid for the current term × remaining / term
 *
 * rounded DOWN to cents, and capped at the new plan's price — a credit is only
 * ever a discount on the new plan, never cash back and never extra time. So a
 * cheaper plan can never extend a dearer one: the switch always starts now.
 */
export function proRateCreditUsd(opts: {
  paidUsd: number;
  termStart: Date;
  termEnd: Date;
  now?: Date;
  capUsd: number;
}): number {
  const now = (opts.now ?? new Date()).getTime();
  const total = opts.termEnd.getTime() - opts.termStart.getTime();
  const remaining = opts.termEnd.getTime() - now;
  if (!(opts.paidUsd > 0) || total <= 0 || remaining <= 0) return 0;
  const raw = (opts.paidUsd * Math.min(remaining, total)) / total;
  const floored = Math.floor(raw * 100) / 100;
  return Math.max(0, Math.min(floored, roundCents(opts.capUsd)));
}
