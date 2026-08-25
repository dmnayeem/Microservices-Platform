import "server-only";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

/**
 * Achievements — the one place that knows what an achievement type MEANS.
 *
 * This feature shipped as three disconnected halves that had never agreed with
 * each other:
 *
 *  - `prisma/seed.ts` wrote types `tasks` / `referrals` / `withdrawals`
 *  - `api/achievements/route.ts` switched on `tasks_completed` / `referrals_made`
 *    / `level_reached` / `xp_earned` / `points_earned` and fell through to 0
 *  - nothing anywhere ever wrote a `UserAchievement` row, so nothing could ever
 *    unlock, and `pointsReward` was displayed as a reward that was never paid
 *
 * Both the read API and the unlock engine now measure through this single map,
 * so the vocabulary cannot drift apart again. Adding a type here is the only
 * thing needed to make it work end to end.
 */

export interface AchievementType {
  key: string;
  /** Shown on the card so a user knows what to actually do. */
  label: string;
  /** How far along this user is, in the same unit as `Achievement.threshold`. */
  measure(userId: string): Promise<number>;
}

/** Statuses that mean a submission was accepted and paid. */
const APPROVED_STATUSES = ["APPROVED", "AUTO_APPROVED"] as const;

export const ACHIEVEMENT_TYPES: Record<string, AchievementType> = {
  tasks_completed: {
    key: "tasks_completed",
    label: "tasks completed",
    // Approved only. The old API counted `_count.taskSubmissions`, which
    // includes rejected and pending ones — so a user who had every submission
    // turned down still showed progress towards "Complete 50 tasks".
    measure: (userId) =>
      prisma.taskSubmission.count({
        where: { userId, status: { in: [...APPROVED_STATUSES] } },
      }),
  },
  referrals_made: {
    key: "referrals_made",
    label: "friends referred",
    measure: (userId) => prisma.user.count({ where: { referredById: userId } }),
  },
  withdrawals_made: {
    key: "withdrawals_made",
    label: "withdrawals completed",
    measure: (userId) =>
      prisma.withdrawal.count({ where: { userId, status: "COMPLETED" } }),
  },
  level_reached: {
    key: "level_reached",
    label: "level",
    measure: async (userId) => {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });
      return u?.level ?? 0;
    },
  },
  xp_earned: {
    key: "xp_earned",
    label: "XP earned",
    measure: async (userId) => {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true },
      });
      return u?.xp ?? 0;
    },
  },
  points_earned: {
    key: "points_earned",
    label: "points earned",
    measure: async (userId) => {
      const [u, rate] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { totalEarnings: true },
        }),
        getPointsPerUsd(),
      ]);
      return Math.round(toNum(u?.totalEarnings) * rate);
    },
  },
};

/**
 * Seeded types, kept working.
 *
 * The six seeded rows use the short forms. Rather than migrate live data on a
 * table the owner may well edit by hand later, both spellings resolve to the
 * same measure.
 */
const TYPE_ALIASES: Record<string, string> = {
  tasks: "tasks_completed",
  task: "tasks_completed",
  referrals: "referrals_made",
  referral: "referrals_made",
  withdrawals: "withdrawals_made",
  withdrawal: "withdrawals_made",
  level: "level_reached",
  xp: "xp_earned",
  points: "points_earned",
};

export function resolveAchievementType(type: string): AchievementType | null {
  const key = TYPE_ALIASES[type] ?? type;
  return ACHIEVEMENT_TYPES[key] ?? null;
}

/**
 * Measure every distinct type ONCE for this user.
 *
 * Six achievements share three types, so measuring per-achievement would run
 * the same three counts twice each.
 */
export async function measureAll(
  userId: string,
  types: string[]
): Promise<Map<string, number>> {
  const resolved = new Map<string, AchievementType>();
  for (const t of types) {
    const def = resolveAchievementType(t);
    if (def) resolved.set(def.key, def);
  }
  const defs = [...resolved.values()];
  const values = await Promise.all(defs.map((d) => d.measure(userId)));
  const out = new Map<string, number>();
  defs.forEach((d, i) => out.set(d.key, values[i]));
  return out;
}

/** Progress for one achievement, from an already-measured map. */
export function progressFor(
  measured: Map<string, number>,
  type: string
): number {
  const def = resolveAchievementType(type);
  return def ? measured.get(def.key) ?? 0 : 0;
}

export interface UnlockedAchievement {
  id: string;
  name: string;
  icon: string | null;
  pointsReward: number;
  xpReward: number;
}

/**
 * Bring a user's `UserAchievement` rows up to date with what they have actually
 * done, and return anything newly completed.
 *
 * Writes NO money. Unlocking only records that a threshold was crossed; the
 * reward is paid when the user claims it (`POST /api/achievements/[id]/claim`).
 * Keeping the two apart is what makes it safe to run this against users who
 * have been active for months — the first evaluation backfills their history
 * into unlocks without moving a single balance.
 *
 * Best-effort by contract: callers invoke it after a payment has committed, and
 * it must never be able to roll one back. `runAchievementCheck` is the wrapper
 * to use from those call sites.
 */
export async function evaluateAchievements(
  userId: string
): Promise<UnlockedAchievement[]> {
  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      icon: true,
      type: true,
      threshold: true,
      pointsReward: true,
      xpReward: true,
    },
  });
  if (achievements.length === 0) return [];

  const [measured, existing] = await Promise.all([
    measureAll(
      userId,
      achievements.map((a) => a.type)
    ),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, progress: true, isCompleted: true },
    }),
  ]);
  const byId = new Map(existing.map((e) => [e.achievementId, e]));

  const unlocked: UnlockedAchievement[] = [];
  for (const a of achievements) {
    const current = progressFor(measured, a.type);
    const prev = byId.get(a.id);
    // Already completed: never re-open it. Progress is forward-only — a
    // counter that can fall (a refunded withdrawal, a reversed task) must not
    // take an achievement away that was already earned and possibly claimed.
    if (prev?.isCompleted) continue;
    if (prev && prev.progress === current && current < a.threshold) continue;

    const completed = current >= a.threshold;
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId: a.id } },
      create: {
        userId,
        achievementId: a.id,
        progress: current,
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        progress: current,
        ...(completed ? { isCompleted: true, completedAt: new Date() } : {}),
      },
    });
    if (completed) {
      unlocked.push({
        id: a.id,
        name: a.name,
        icon: a.icon,
        pointsReward: a.pointsReward,
        xpReward: a.xpReward,
      });
    }
  }
  return unlocked;
}

/**
 * Fire-and-forget wrapper for the money paths.
 *
 * Call AFTER the payment transaction has committed. Achievements are a nicety;
 * a failure here must never surface as a failed task approval or a failed
 * withdrawal.
 */
export async function runAchievementCheck(userId: string): Promise<void> {
  try {
    const unlocked = await evaluateAchievements(userId);
    if (unlocked.length === 0) return;
    const { notifyUser } = await import("@/lib/notify");
    for (const a of unlocked) {
      await notifyUser({
        userId,
        type: "SYSTEM",
        title: "Achievement unlocked 🏅",
        message:
          a.pointsReward > 0
            ? `You unlocked "${a.name}". Claim your ${a.pointsReward} points on the achievements page.`
            : `You unlocked "${a.name}".`,
        link: "/achievements",
      }).catch(() => {});
    }
  } catch (err) {
    console.error("achievement evaluation failed:", err);
  }
}
