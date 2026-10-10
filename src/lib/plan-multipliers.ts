import { getEffectivePackage, type PackageRow } from "@/lib/packages";
import { campaignMultipliers } from "@/lib/campaigns";

/**
 * The user's plan multipliers, resolved from their EFFECTIVE package — an
 * expired or inactive plan collapses to the default plan (getEffectivePackage
 * respects `packageExpiresAt`), so a lapsed subscriber never keeps a boost.
 *
 *   taskReward → multiply the task's point reward
 *   xp         → multiply the task's XP reward
 *
 * Fail-safe: any error / missing / non-finite / non-positive value → 1.
 * Values are clamped to the same [0.1, 50] range the /admin/packages form and
 * API validate, so a bad row can never mint unbounded rewards.
 */
export interface PlanMultipliers {
  taskReward: number;
  xp: number;
}

const MIN_MULTIPLIER = 0.1;
const MAX_MULTIPLIER = 50;

function clampMultiplier(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(Math.max(n, MIN_MULTIPLIER), MAX_MULTIPLIER);
}

/** Pure: multipliers from an already-loaded package row. */
export function planMultipliersFromPackage(
  pkg: Pick<PackageRow, "taskRewardMultiplier" | "xpMultiplier"> | null | undefined
): PlanMultipliers {
  if (!pkg) return { taskReward: 1, xp: 1 };
  return {
    taskReward: clampMultiplier(pkg.taskRewardMultiplier),
    xp: clampMultiplier(pkg.xpMultiplier),
  };
}

/**
 * Multipliers for a user. Pass a userId (the effective package is resolved and
 * request-deduped via React.cache), or a package row you already loaded with
 * getEffectivePackage to skip the lookup.
 */
export async function getPlanMultipliers(
  userIdOrPackage:
    | string
    | Pick<PackageRow, "taskRewardMultiplier" | "xpMultiplier">
    | null
    | undefined
): Promise<PlanMultipliers> {
  if (typeof userIdOrPackage !== "string") {
    return planMultipliersFromPackage(userIdOrPackage);
  }
  try {
    const [pkg, camp] = await Promise.all([
      getEffectivePackage(userIdOrPackage),
      // Live campaigns (Admin → Campaigns) boost task rewards on top of the plan.
      campaignMultipliers(userIdOrPackage),
    ]);
    const plan = planMultipliersFromPackage(pkg);
    return {
      taskReward: Math.min(plan.taskReward * camp.taskReward, MAX_MULTIPLIER),
      xp: Math.min(plan.xp * camp.xp, MAX_MULTIPLIER),
    };
  } catch {
    return { taskReward: 1, xp: 1 };
  }
}
