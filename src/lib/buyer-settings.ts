import "server-only";
import { getSetting } from "@/lib/system-settings";
import { BUYER_TASK_TYPES } from "@/lib/buyer-task-types";

/**
 * Everything that governs a buyer funding a task, in one admin-controlled place.
 *
 * `POST /api/tasks/create` already let a granted user fund a task from their
 * wallet, but every rule around it was a literal in that file: the task types
 * were a hardcoded tuple, the reward and completion ceilings were Zod bounds
 * (`max(100000)`), there was no floor at all, no KYC requirement, and — the one
 * that matters for the business — **no platform fee**. A buyer paid exactly the
 * point value of the rewards and the platform earned nothing on the transaction.
 *
 * Every value below is editable from Settings → Financial → Buyer & Task
 * Funding. Defaults reproduce today's behaviour, except `feePercent`, which
 * starts at 0 so turning the section on cannot silently start charging people.
 */
export interface BuyerSettings {
  /** Master switch. Off → the create-task API refuses regardless of features. */
  enabled: boolean;
  /** Platform commission, added on top of the reward pool. 0–100. */
  feePercent: number;
  /** Smallest reward a buyer may offer per completion. */
  minPointsPerTask: number;
  /** Largest reward a buyer may offer per completion. */
  maxPointsPerTask: number;
  /** Largest number of completions one task may be funded for. */
  maxCompletions: number;
  /** Smallest task-credit purchase, in points. */
  minPurchasePoints: number;
  /** Largest task-credit purchase in one go, in points. */
  maxPurchasePoints: number;
  /** How many tasks one buyer may have live or awaiting review. 0 = no cap. */
  maxActiveTasks: number;
  /** Task types a buyer may create. Empty → none (same as `enabled: false`). */
  allowedTaskTypes: string[];
  /** Buyer must be KYC-approved before funding anything. */
  requireKyc: boolean;
  /** Skip the admin review queue and publish straight to ACTIVE. */
  autoApproveTasks: boolean;
  // (`buyer.refund_fee_on_reject` was removed 2026-10-06: buyers are charged
  // per APPROVED completion — reward + fee together — so a rejected task or
  // submission was never charged a fee and there was nothing to refund. The
  // switch did nothing.)
}

export { BUYER_TASK_TYPES } from "@/lib/buyer-task-types";

const DEFAULTS: BuyerSettings = {
  enabled: true,
  feePercent: 0,
  minPointsPerTask: 1,
  maxPointsPerTask: 100_000,
  maxCompletions: 100_000,
  minPurchasePoints: 1_000,
  maxPurchasePoints: 10_000_000,
  maxActiveTasks: 0,
  allowedTaskTypes: [...BUYER_TASK_TYPES],
  requireKyc: false,
  autoApproveTasks: false,
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function getBuyerSettings(): Promise<BuyerSettings> {
  const [
    enabled,
    feePercent,
    minPoints,
    maxPoints,
    maxCompletions,
    minPurchase,
    maxPurchase,
    maxActive,
    allowedTypes,
    requireKyc,
    autoApprove,
  ] = await Promise.all([
    getSetting<boolean>("buyer.enabled", DEFAULTS.enabled),
    getSetting<number>("buyer.fee_percent", DEFAULTS.feePercent),
    getSetting<number>("buyer.min_points_per_task", DEFAULTS.minPointsPerTask),
    getSetting<number>("buyer.max_points_per_task", DEFAULTS.maxPointsPerTask),
    getSetting<number>("buyer.max_completions", DEFAULTS.maxCompletions),
    getSetting<number>("buyer.min_purchase_points", DEFAULTS.minPurchasePoints),
    getSetting<number>("buyer.max_purchase_points", DEFAULTS.maxPurchasePoints),
    getSetting<number>("buyer.max_active_tasks", DEFAULTS.maxActiveTasks),
    getSetting<unknown>("buyer.allowed_task_types", null),
    getSetting<boolean>("buyer.require_kyc", DEFAULTS.requireKyc),
    getSetting<boolean>("buyer.auto_approve_tasks", DEFAULTS.autoApproveTasks),
  ]);

  const minPurchase_ = Math.floor(
    num(minPurchase, DEFAULTS.minPurchasePoints, 1, 1_000_000_000)
  );
  const minPointsPerTask = Math.floor(
    num(minPoints, DEFAULTS.minPointsPerTask, 1, 1_000_000)
  );
  // A max below the min would reject every possible value, so the floor wins.
  const maxPointsPerTask = Math.max(
    minPointsPerTask,
    Math.floor(num(maxPoints, DEFAULTS.maxPointsPerTask, 1, 10_000_000))
  );

  // Unknown strings are dropped rather than trusted: this list decides what a
  // user may create, and a typo must not become a task type nothing validates.
  const allowed = Array.isArray(allowedTypes)
    ? (allowedTypes as unknown[])
        .map((t) => String(t).toUpperCase())
        .filter((t): t is (typeof BUYER_TASK_TYPES)[number] =>
          (BUYER_TASK_TYPES as readonly string[]).includes(t)
        )
    : DEFAULTS.allowedTaskTypes;

  return {
    enabled: enabled !== false,
    feePercent: num(feePercent, DEFAULTS.feePercent, 0, 100),
    minPointsPerTask,
    maxPointsPerTask,
    maxCompletions: Math.floor(
      num(maxCompletions, DEFAULTS.maxCompletions, 1, 10_000_000)
    ),
    minPurchasePoints: minPurchase_,
    maxActiveTasks: Math.floor(num(maxActive, DEFAULTS.maxActiveTasks, 0, 10_000)),
    // A ceiling below the floor would refuse every possible purchase, so the
    // floor wins — the same rule the reward bounds follow.
    maxPurchasePoints: Math.max(
      minPurchase_,
      Math.floor(num(maxPurchase, DEFAULTS.maxPurchasePoints, 1, 1_000_000_000))
    ),
    allowedTaskTypes: [...new Set(allowed)],
    requireKyc: requireKyc === true,
    autoApproveTasks: autoApprove === true,
  };
}

// Pricing lives in `buyer-quote.ts` so the buyer's calculator (a client
// component) and this server module share one implementation.
export { quoteTask, type TaskQuote } from "@/lib/buyer-quote";
