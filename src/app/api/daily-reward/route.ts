import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

// Daily reward configuration (points per streak day)
const DAILY_REWARDS = [
  { day: 1, points: 50, xp: 10 },
  { day: 2, points: 75, xp: 15 },
  { day: 3, points: 100, xp: 20 },
  { day: 4, points: 125, xp: 25 },
  { day: 5, points: 150, xp: 30 },
  { day: 6, points: 200, xp: 40 },
  { day: 7, points: 300, xp: 60, bonus: "mystery_box" },
];

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
      bonusReward = await claimMysteryBox(session.user.id);
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

// Helper function to calculate level from XP
function calculateLevel(xp: number): number {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 2000) return 5;
  if (xp < 4000) return 6;
  if (xp < 7000) return 7;
  if (xp < 11000) return 8;
  if (xp < 16000) return 9;
  if (xp < 22000) return 10;
  return Math.floor(10 + (xp - 22000) / 10000);
}

// Helper function for mystery box bonus
async function claimMysteryBox(
  userId: string
): Promise<{ type: string; value: number }> {
  // Random bonus: extra points, XP, or special reward
  const bonusTypes = [
    { type: "points", min: 100, max: 500 },
    { type: "xp", min: 50, max: 200 },
    { type: "points", min: 200, max: 1000 }, // Rare jackpot
  ];

  const selectedBonus = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
  const value =
    Math.floor(Math.random() * (selectedBonus.max - selectedBonus.min + 1)) +
    selectedBonus.min;

  // Apply bonus
  if (selectedBonus.type === "points") {
    const pointsPerUsd = await getPointsPerUsd();
    await prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: value },
        totalEarnings: { increment: value / pointsPerUsd },
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.BONUS,
        status: TransactionStatus.COMPLETED,
        points: value,
        amount: value / pointsPerUsd,
        description: "Mystery Box reward",
        reference: `mystery_${Date.now()}`,
      },
    });
  } else if (selectedBonus.type === "xp") {
    await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: value } },
    });
  }

  return { type: selectedBonus.type, value };
}
