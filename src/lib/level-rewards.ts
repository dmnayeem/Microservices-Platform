/**
 * Level rewards — points for reaching a level (3, 5, 10 …), set by the admin
 * on /admin/gamification → Level rewards. Client-safe; the claim lives in
 * ./level-rewards-server.ts.
 *
 * Each reward is claimed once per account (LevelRewardClaim is unique on
 * user + level), and only by an account that has really reached the level —
 * the stored level, which only XP from completed work raises.
 */

export interface LevelRewardRow {
  level: number;
  points: number;
}

export interface LevelRewardsConfig {
  enabled: boolean;
  rows: LevelRewardRow[];
}

export const LEVEL_REWARDS_KEY = "gamification.level_rewards";

/** Nothing pays until the admin sets the ladder. */
export const LEVEL_REWARDS_DEFAULT: LevelRewardsConfig = { enabled: true, rows: [] };

export const LEVEL_REWARD_MAX_POINTS = 100_000;
export const LEVEL_REWARD_MAX_LEVEL = 200;

/** Stored value → clean, sorted ladder (one row per level, 2–200, points 1–100k). */
export function normalizeLevelRewards(raw: unknown): LevelRewardsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byLevel = new Map<number, number>();
  for (const row of Array.isArray(r.rows) ? r.rows : []) {
    const o = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const level = Math.round(Number(o.level));
    const points = Math.round(Number(o.points));
    if (!Number.isFinite(level) || level < 2 || level > LEVEL_REWARD_MAX_LEVEL) continue;
    if (!Number.isFinite(points) || points <= 0) continue;
    byLevel.set(level, Math.min(LEVEL_REWARD_MAX_POINTS, points));
  }
  return {
    enabled: r.enabled !== false,
    rows: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, points]) => ({ level, points })),
  };
}

/** Problems that stop a save, or null (the admin is told, nothing is clamped silently). */
export function validateLevelRewards(raw: unknown): string | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(r.rows)) return "Send the list of levels.";
  const seen = new Set<number>();
  for (const row of r.rows) {
    const o = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const level = Number(o.level);
    const points = Number(o.points);
    if (!Number.isInteger(level) || level < 2 || level > LEVEL_REWARD_MAX_LEVEL) {
      return `Levels go from 2 to ${LEVEL_REWARD_MAX_LEVEL} (got ${String(o.level)}).`;
    }
    if (seen.has(level)) return `Level ${level} is listed twice.`;
    seen.add(level);
    if (!Number.isInteger(points) || points < 1 || points > LEVEL_REWARD_MAX_POINTS) {
      return `Level ${level}: points must be 1–${LEVEL_REWARD_MAX_POINTS.toLocaleString()}.`;
    }
  }
  return null;
}
