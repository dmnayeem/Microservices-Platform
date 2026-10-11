import "server-only";
import { Prisma, NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { creditPoints } from "@/lib/ledger";
import { requireActiveUser } from "@/lib/require-active";
import { LEVEL_REWARDS_KEY, normalizeLevelRewards, type LevelRewardsConfig } from "@/lib/level-rewards";

export async function getLevelRewards(): Promise<LevelRewardsConfig> {
  return normalizeLevelRewards(await getSetting<unknown>(LEVEL_REWARDS_KEY, null));
}

export interface LevelRewardView {
  level: number;
  points: number;
  reached: boolean;
  claimed: boolean;
}

/** The ladder as one user sees it. */
export async function levelRewardsFor(userId: string): Promise<{
  enabled: boolean;
  level: number;
  rows: LevelRewardView[];
  claimable: number;
}> {
  const [cfg, user, claims] = await Promise.all([
    getLevelRewards(),
    prisma.user.findUnique({ where: { id: userId }, select: { level: true } }),
    prisma.levelRewardClaim.findMany({ where: { userId }, select: { level: true } }),
  ]);
  const level = user?.level ?? 1;
  const done = new Set(claims.map((c) => c.level));
  const rows = cfg.rows.map((r) => ({
    level: r.level,
    points: r.points,
    reached: level >= r.level,
    claimed: done.has(r.level),
  }));
  return {
    enabled: cfg.enabled,
    level,
    rows,
    claimable: cfg.enabled ? rows.filter((r) => r.reached && !r.claimed).length : 0,
  };
}

export type ClaimResult =
  | { ok: true; points: number }
  | { ok: false; error: string; status: number };

/**
 * Claim one level's reward. Once per account per level: the LevelRewardClaim
 * row (unique user + level) and the ledger reference are written in the same
 * transaction as the credit, so a double tap or two tabs pay once.
 */
export async function claimLevelReward(userId: string, level: number): Promise<ClaimResult> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return { ok: false, error: active.message, status: active.httpStatus };

  const cfg = await getLevelRewards();
  if (!cfg.enabled) return { ok: false, error: "Level rewards are switched off right now.", status: 400 };
  const row = cfg.rows.find((r) => r.level === level);
  if (!row) return { ok: false, error: "There is no reward for that level.", status: 404 };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  if (!user || user.level < level) {
    return { ok: false, error: `Reach level ${level} first.`, status: 400 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.levelRewardClaim.create({ data: { userId, level, points: row.points } });
      await creditPoints(tx, {
        userId,
        points: row.points,
        type: TransactionType.BONUS,
        description: `Level ${level} reward`,
        reference: `level_reward_${level}`,
        metadata: { source: "level_reward", level },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "You already claimed this reward.", status: 409 };
    }
    throw e;
  }
  return { ok: true, points: row.points };
}

/**
 * Called when a user's level goes up: a celebration popup for each newly
 * reached level that has a reward (usually one). Never throws — a level-up
 * must not fail because a notification did not write.
 */
export async function notifyLevelRewards(userId: string, fromLevel: number, toLevel: number): Promise<void> {
  try {
    const cfg = await getLevelRewards();
    if (!cfg.enabled) return;
    const hits = cfg.rows.filter((r) => r.level > fromLevel && r.level <= toLevel);
    if (hits.length === 0) return;
    const total = hits.reduce((n, r) => n + r.points, 0);
    const top = hits[hits.length - 1]!.level;
    await prisma.notification.create({
      data: {
        userId,
        type: NotificationType.ACHIEVEMENT,
        title: `🎉 Level ${top} reached!`,
        message: `You unlocked ${total.toLocaleString()} points — claim ${hits.length === 1 ? "your reward" : "your rewards"} now.`,
        popup: true,
        data: {
          link: "/level-rewards",
          popup: {
            kind: "achievement",
            headline: `Level ${top} reached!`,
            amount: `${total.toLocaleString()} points to claim`,
            cta: { label: "Claim my reward", href: "/level-rewards" },
          },
        },
      },
    });
  } catch (e) {
    console.error("[level-rewards] notify failed:", e);
  }
}
