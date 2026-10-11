/**
 * Ambassador program — settings (client-safe). Everything is the admin's call;
 * the bonus is paid on its own, monthly, and never changes the referral
 * commission chain (lib/referral-commissions.ts stays exactly as it is).
 */

export interface AmbassadorConfig {
  enabled: boolean;
  /** Level a member needs to apply. */
  minLevelToApply: number;
  /** Active referrals a member needs to apply (0 = none). */
  minReferralsToApply: number;
  /** Approved KYC needed to apply. */
  requireKyc: boolean;
  /** A new referral counts once it has this many approved tasks. */
  qualifyTasks: number;
  /** Points per qualified new referral in a month. */
  pointsPerReferral: number;
  /** Extra points when the month's qualified referrals reach `monthlyTarget` (0 = no target). */
  monthlyTarget: number;
  targetBonus: number;
  /** Most points one ambassador can get in a month (0 = no cap). */
  monthlyCap: number;
}

export const AMBASSADOR_KEY = "community.ambassadors";

export const AMBASSADOR_DEFAULTS: AmbassadorConfig = {
  enabled: false,
  minLevelToApply: 5,
  minReferralsToApply: 0,
  requireKyc: true,
  qualifyTasks: 3,
  pointsPerReferral: 100,
  monthlyTarget: 10,
  targetBonus: 1000,
  monthlyCap: 0,
};

export function normalizeAmbassadorConfig(raw: unknown): AmbassadorConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = AMBASSADOR_DEFAULTS;
  const int = (v: unknown, def: number, lo: number, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  return {
    enabled: r.enabled === true,
    minLevelToApply: int(r.minLevelToApply, d.minLevelToApply, 0, 200),
    minReferralsToApply: int(r.minReferralsToApply, d.minReferralsToApply, 0, 10_000),
    requireKyc: r.requireKyc !== false,
    qualifyTasks: int(r.qualifyTasks, d.qualifyTasks, 1, 1000),
    pointsPerReferral: int(r.pointsPerReferral, d.pointsPerReferral, 0, 100_000),
    monthlyTarget: int(r.monthlyTarget, d.monthlyTarget, 0, 10_000),
    targetBonus: int(r.targetBonus, d.targetBonus, 0, 1_000_000),
    monthlyCap: int(r.monthlyCap, d.monthlyCap, 0, 10_000_000),
  };
}

/** Points for a month's qualified referrals under these settings. */
export function ambassadorBonus(cfg: AmbassadorConfig, qualified: number): number {
  let pts = qualified * cfg.pointsPerReferral;
  if (cfg.monthlyTarget > 0 && qualified >= cfg.monthlyTarget) pts += cfg.targetBonus;
  if (cfg.monthlyCap > 0) pts = Math.min(pts, cfg.monthlyCap);
  return pts;
}

/** "2026-10" for a date (UTC). */
export const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** [start, end) of a "YYYY-MM" month in UTC. */
export function monthRange(month: string): [Date, Date] {
  const [y, m] = month.split("-").map(Number);
  return [new Date(Date.UTC(y!, m! - 1, 1)), new Date(Date.UTC(y!, m!, 1))];
}
