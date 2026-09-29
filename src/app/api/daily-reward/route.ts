import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateLevel } from "@/lib/level";
import { requireActiveUser } from "@/lib/require-active";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import {
  getUserDayContext,
  localDayKey,
  localDayKeyDaysAgo,
} from "@/lib/user-day";

import { getDailyRewardConfig } from "@/lib/reward-config-server";
import type { MysteryBoxOutcome } from "@/lib/reward-config";

/**
 * The 7-day ladder, from the admin setting `daily_reward.config`
 * (Admin → Levels & Achievements → Daily & solo rewards). With no row saved it
 * is exactly the ladder that used to be hardcoded here.
 */
async function loadDailyRewards() {
  const cfg = await getDailyRewardConfig();
  const rewards = cfg.days.map((d, i) => ({
    day: i + 1,
    points: d.points,
    xp: d.xp,
    ...(i === 6 && cfg.mysteryBoxEnabled ? { bonus: "mystery_box" as const } : {}),
  })) as { day: number; points: number; xp: number; bonus?: "mystery_box" }[];
  return { rewards, mysteryBox: cfg.mysteryBox };
}

// GET /api/daily-reward - Get daily reward status
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        lastCheckIn: true,
        streak: true,
        pointsBalance: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Reset boundary is the user's LOCAL day (country-based), not UTC/server.
    const { dayKey: todayKey, tz, startOfDayUtc } = await getUserDayContext(
      session.user.id
    );
    const lastKey = user.lastCheckIn
      ? localDayKey(tz, new Date(user.lastCheckIn))
      : null;
    let canClaim = true;
    let currentStreak = user.streak || 0;

    if (lastKey) {
      if (lastKey === todayKey) {
        canClaim = false; // already claimed today
      } else if (lastKey !== localDayKeyDaysAgo(tz, 1)) {
        currentStreak = 0; // missed a day → streak broken
      }
    }

    const { rewards: DAILY_REWARDS } = await loadDailyRewards();

    // Calculate next reward (streak day 1-7, then cycles)
    const nextRewardDay = (currentStreak % 7) + 1;
    const nextReward = DAILY_REWARDS[nextRewardDay - 1];

    // Time until the user's next local midnight.
    const tomorrow = new Date(startOfDayUtc.getTime() + 86_400_000);
    const timeUntilNextReward = canClaim
      ? 0
      : tomorrow.getTime() - Date.now();

    return NextResponse.json({
      canClaim,
      currentStreak,
      nextRewardDay,
      nextReward: {
        day: nextRewardDay,
        points: nextReward.points,
        xp: nextReward.xp,
        hasBonus: !!nextReward.bonus,
        bonusType: nextReward.bonus || null,
      },
      rewards: DAILY_REWARDS.map((r, idx) => ({
        ...r,
        isClaimed: idx < currentStreak % 7,
        isNext: idx === (currentStreak % 7),
      })),
      timeUntilNextReward,
      lastClaimDate: user.lastCheckIn,
    });
  } catch (error) {
    console.error("Error fetching daily reward status:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily reward status" },
      { status: 500 }
    );
  }
}

// POST /api/daily-reward - Claim daily reward
export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // A banned or suspended account must not be able to claim a reward. `User.status`
    // is otherwise only ever read at login, and the JWT lives 30 days with no
    // status claim, so a ban had no effect until the session expired.
    const active = await requireActiveUser(session.user.id);
    if (!active.ok) {
      return NextResponse.json(
        { error: active.message },
        { status: active.httpStatus }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        lastCheckIn: true,
        streak: true,
        pointsBalance: true,
        xp: true,
        level: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Reset boundary is the user's LOCAL day (country-based), not UTC/server.
    const { dayKey: todayKey, tz } = await getUserDayContext(session.user.id);
    const lastKey = user.lastCheckIn
      ? localDayKey(tz, new Date(user.lastCheckIn))
      : null;
    let newStreak = user.streak || 0;

    if (lastKey) {
      if (lastKey === todayKey) {
        return NextResponse.json(
          { error: "Daily reward already claimed today" },
          { status: 400 }
        );
      }
      if (lastKey !== localDayKeyDaysAgo(tz, 1)) {
        newStreak = 0; // missed a day → streak broken
      }
    }
    // The per-day idempotency ref uses the same local day-key so the
    // (userId, reference) unique enforces one reward per local day.

    // Calculate reward for current day
    const { rewards: DAILY_REWARDS, mysteryBox } = await loadDailyRewards();
    const rewardDay = (newStreak % 7) + 1;
    const reward = DAILY_REWARDS[rewardDay - 1];
    newStreak++;

    // Apply plan xp multiplier — handles expiry + isDefault fallback.
    const userPackage = await getEffectivePackage(session.user.id);
    const xpMultiplier = userPackage?.xpMultiplier ?? 1;

    const pointsEarned = reward.points;
    const xpEarned = Math.round(reward.xp * xpMultiplier);
    const pointsPerUsd = await getPointsPerUsd();

    // Update user and create transaction
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          pointsBalance: { increment: pointsEarned },
          totalEarnings: { increment: pointsEarned / pointsPerUsd },
          xp: { increment: xpEarned },
          streak: newStreak,
          lastCheckIn: new Date(),
        },
      }),
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points: pointsEarned,
          amount: pointsEarned / pointsPerUsd,
          description: `Daily reward (Day ${rewardDay})`,
          reference: `daily_${todayKey}`,
          metadata: {
            day: rewardDay,
            streak: newStreak,
            bonus: reward.bonus || null,
          },
        },
      }),
      prisma.notification.create({
        data: {
          userId: session.user.id,
          type: NotificationType.SYSTEM,
          title: "Daily Reward Claimed!",
          message: `You earned ${pointsEarned} points and ${xpEarned} XP! Day ${rewardDay} streak.`,
          data: { points: pointsEarned, xp: xpEarned, day: rewardDay },
        },
      }),
    ]);

    // Check for level up
    const newLevel = calculateLevel(user.xp + xpEarned);
    if (newLevel > user.level) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { level: newLevel },
      });

      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: NotificationType.ACHIEVEMENT,
          title: "Level Up!",
          message: `Congratulations! You've reached level ${newLevel}!`,
          data: { newLevel, previousLevel: user.level },
        },
      });
    }

    // Handle day 7 bonus (mystery box)
    let bonusReward = null;
    if (reward.bonus === "mystery_box") {
      bonusReward = await claimMysteryBox(session.user.id, todayKey, mysteryBox);
    }

    return NextResponse.json({
      success: true,
      message: `Daily reward claimed! Day ${rewardDay} streak.`,
      reward: {
        day: rewardDay,
        points: pointsEarned,
        xp: xpEarned,
        bonus: bonusReward,
      },
      newStreak,
      newBalance: updatedUser.pointsBalance,
      levelUp: newLevel > user.level ? { newLevel } : null,
    });
  } catch (error) {
    // Concurrent double-claim raced past the lastCheckIn guard and hit the
    // per-day (userId, reference) unique → already claimed today.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json(
        { error: "Daily reward already claimed today" },
        { status: 400 }
      );
    }
    console.error("Error claiming daily reward:", error);
    return NextResponse.json(
      { error: "Failed to claim daily reward" },
      { status: 500 }
    );
  }
}


/**
 * Day-7 mystery box.
 *
 * `dayKey` is the caller's LOCAL day — the same key the daily reward row itself
 * is written under. The reference used to be `mystery_${Date.now()}`, which was
 * unique on every call and so could never be deduped by
 * `Transaction @@unique([userId, reference])`; the box was only ever protected
 * by the one-claim-per-day guard above it.
 *
 * Returns `null` when the box has already been opened today, so the caller can
 * still report the daily reward it just credited.
 */
async function claimMysteryBox(
  userId: string,
  dayKey: string,
  // Admin-set outcomes; the defaults are the three that used to be hardcoded.
  bonusTypes: MysteryBoxOutcome[]
): Promise<{ type: string; value: number } | null> {
  if (bonusTypes.length === 0) return null;

  const selectedBonus = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
  const value =
    Math.floor(Math.random() * (selectedBonus.max - selectedBonus.min + 1)) +
    selectedBonus.min;

  // Apply bonus
  if (selectedBonus.type === "points") {
    const pointsPerUsd = await getPointsPerUsd();
    try {
      // The balance bump and the ledger row are now ONE transaction. They used
      // to be two separate awaits, so a failure between them credited points
      // with no ledger row behind them — invisible in history and unaccounted
      // for in every finance total.
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            pointsBalance: { increment: value },
            totalEarnings: { increment: value / pointsPerUsd },
          },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.BONUS,
            status: TransactionStatus.COMPLETED,
            points: value,
            amount: value / pointsPerUsd,
            description: "Mystery Box reward",
            reference: `mystery_${dayKey}`,
          },
        });
      });
    } catch (err) {
      // Caught HERE, not by the route's outer handler. The outer catch maps a
      // duplicate to "Daily reward already claimed today" (400) — which would be
      // wrong and confusing, because the daily reward has just been credited
      // successfully and only the bonus was a replay.
      if (isDuplicateLedgerError(err)) return null;
      throw err;
    }
  } else if (selectedBonus.type === "xp") {
    await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: value } },
    });
  }

  return { type: selectedBonus.type, value };
}
