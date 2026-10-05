// Client-safe: no server imports. The plan comparison shown to users on
// /packages and the landing page, and the list the admin picks rows from.
//
// Every value is computed from the plan's REAL columns and the same global
// withdrawal settings `getWithdrawalConfig` uses (lib/withdrawal.ts), so the
// table can never promise what the plan does not do. It replaced hard-coded
// bullets that offered free users a "$5–$500 withdrawal range" they did not
// have.

import { FEATURES, FEATURE_TO_COLUMN, type PackageFeatureKey } from "@/lib/features";
import { usd as fmtUsd } from "@/lib/utils";

/** Global settings a plan's real numbers depend on. */
export interface PlanCompareContext {
  withdrawalFeePct: number;
  minWithdrawal: number;
  allowWithdrawals: boolean;
  withdrawalRequiresSubscription: boolean;
}

/** The plain plan columns the comparison reads (numbers, not Decimals). */
export interface PlanForCompare {
  isDefault: boolean;
  priceMonthly: number;
  dailyTaskLimit: number;
  dailyPostLimit: number;
  withdrawalFeeDiscount: number;
  minWithdrawal: number;
  xpMultiplier: number;
  taskRewardMultiplier: number;
  referralCommissionLevels: number;
  adFree: boolean;
  [column: string]: unknown;
}

/** A cell: true/false shows ✓/✗; a string is shown as is. */
export type CompareCell = boolean | string;

export interface CompareRowDef {
  key: string;
  label: string;
  group: "Earning" | "Cash out" | "Create & sell" | "Community" | "Extras";
  hint?: string;
}

const LIMIT_ROWS: CompareRowDef[] = [
  { key: "dailyTaskLimit", label: "Tasks per day", group: "Earning" },
  { key: "taskRewardMultiplier", label: "Task reward multiplier", group: "Earning" },
  { key: "xpMultiplier", label: "XP multiplier", group: "Earning" },
  { key: "referralLevels", label: "Referral commission levels", group: "Earning" },
  { key: "cashOut", label: "Withdraw your cash", group: "Cash out" },
  { key: "minWithdrawal", label: "Minimum withdrawal", group: "Cash out" },
  { key: "withdrawalFee", label: "Withdrawal fee", group: "Cash out" },
  { key: "dailyPostLimit", label: "Feed posts per day", group: "Community" },
  { key: "adFree", label: "No ads", group: "Extras" },
];

const FEATURE_GROUP: Partial<Record<PackageFeatureKey, CompareRowDef["group"]>> = {
  createTasks: "Create & sell",
  sellCourses: "Create & sell",
  sellMarketplace: "Create & sell",
  advertiser: "Create & sell",
  agencyMode: "Create & sell",
  targetTasks: "Create & sell",
  boost: "Community",
  shareLinks: "Community",
  shareYouTube: "Community",
  donations: "Community",
  socialFeed: "Community",
};

/** Every row an admin can choose to show. "Withdrawals" is the cashOut row. */
export const COMPARE_ROWS: CompareRowDef[] = [
  ...LIMIT_ROWS,
  ...FEATURES.filter((f) => f.group !== "task" && f.key !== "withdrawals").map((f) => ({
    key: `f:${f.key}`,
    label: f.label,
    group: FEATURE_GROUP[f.key] ?? ("Extras" as const),
    hint: f.description,
  })),
];

/** What users see until an admin picks: the rows that differ most between plans. */
export const DEFAULT_COMPARE_ROWS = [
  "dailyTaskLimit",
  "taskRewardMultiplier",
  "referralLevels",
  "cashOut",
  "minWithdrawal",
  "withdrawalFee",
  "f:createTasks",
  "f:sellMarketplace",
  "f:sellCourses",
  "f:boost",
  "f:shareLinks",
  "adFree",
];

export const COMPARE_ROWS_SETTING = "packages.compare_rows";

export function sanitizeCompareRows(v: unknown): string[] {
  const known = new Set(COMPARE_ROWS.map((r) => r.key));
  if (!Array.isArray(v)) return DEFAULT_COMPARE_ROWS;
  const out = v.filter((k): k is string => typeof k === "string" && known.has(k));
  return out.length ? [...new Set(out)] : DEFAULT_COMPARE_ROWS;
}

const num = (v: unknown) => Number(v) || 0;
const usd = (n: number) => fmtUsd(n, { dp: n % 1 === 0 ? 0 : 2 });
const mult = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2).replace(/0$/, "")}×`;

/** Can members of this plan withdraw at all? Same rule as getWithdrawalConfig. */
export function planCanWithdraw(p: PlanForCompare, ctx: PlanCompareContext): boolean {
  const enabled = p[FEATURE_TO_COLUMN.withdrawals] !== false;
  const blockedForFree = ctx.withdrawalRequiresSubscription && p.isDefault;
  return ctx.allowWithdrawals && enabled && !blockedForFree;
}

export function compareCell(key: string, p: PlanForCompare, ctx: PlanCompareContext): CompareCell {
  const canWithdraw = planCanWithdraw(p, ctx);
  switch (key) {
    case "dailyTaskLimit":
      return p.dailyTaskLimit < 0 ? "Unlimited" : String(p.dailyTaskLimit);
    case "dailyPostLimit":
      return p.dailyPostLimit < 0 ? "Unlimited" : String(p.dailyPostLimit);
    case "taskRewardMultiplier":
      return mult(num(p.taskRewardMultiplier));
    case "xpMultiplier":
      return mult(num(p.xpMultiplier));
    case "referralLevels":
      return num(p.referralCommissionLevels) > 0 ? `${num(p.referralCommissionLevels)} level${num(p.referralCommissionLevels) === 1 ? "" : "s"}` : false;
    case "cashOut":
      return canWithdraw;
    case "minWithdrawal":
      return canWithdraw ? usd(Math.max(ctx.minWithdrawal, num(p.minWithdrawal))) : "—";
    case "withdrawalFee": {
      if (!canWithdraw) return "—";
      const fee = Math.max(0, Math.min(100, ctx.withdrawalFeePct - num(p.withdrawalFeeDiscount)));
      return `${fee % 1 === 0 ? fee.toFixed(0) : fee.toFixed(1)}%`;
    }
    case "adFree":
      return !!p.adFree;
  }
  if (key.startsWith("f:")) {
    const col = FEATURE_TO_COLUMN[key.slice(2) as PackageFeatureKey];
    return col ? p[col] === true : false;
  }
  return false;
}

/** Icon keys a plan card can use (rendered by the client). */
export const PLAN_ICONS = ["shield", "zap", "sparkles", "crown", "rocket", "gem", "star"] as const;
export type PlanIcon = (typeof PLAN_ICONS)[number];
