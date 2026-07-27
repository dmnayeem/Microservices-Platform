import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDailyProgress,
  resolveTaskTypeBucket,
} from "@/lib/daily-mission-progress";
import {
  getUserDayContext,
  localDayKey,
  localDayKeyDaysAgo,
} from "@/lib/user-day";

/**
 * One-shot summary for the social feed right rail's earn widgets — merges the
 * balance (/api/wallet), login streak (/api/daily-reward), daily-mission
 * progress (/api/daily-mission/today) and referral (/api/referrals) into a
 * single round-trip so the rail doesn't fire four requests on mount.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      level: true,
      pointsBalance: true,
      streak: true,
      lastCheckIn: true,
      referralCode: true,
      package: { select: { accessLevel: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // All daily boundaries use the user's LOCAL midnight (country-based).
  const { startOfDayUtc, dayKey: todayKey, tz } = await getUserDayContext(userId);

  const todayAgg = await prisma.transaction.aggregate({
    // Today's earnings (points) — completed EARNING/BONUS transactions today.
    where: {
      userId,
      status: "COMPLETED",
      type: { in: ["EARNING", "BONUS"] },
      createdAt: { gte: startOfDayUtc },
    },
    _sum: { points: true },
  });
  const referralCount = await prisma.user.count({
    where: { referredById: userId },
  });
  // Highest-accessLevel active mission template the user qualifies for.
  const missionRaw = await prisma.dailyMissionTemplate.findFirst({
    where: {
      requiredAccessLevel: { lte: user.package?.accessLevel ?? 0 },
      isActive: true,
      requiredLevel: { lte: user.level },
    },
    orderBy: [
      { requiredAccessLevel: "desc" },
      { order: "asc" },
      { createdAt: "desc" },
    ],
    include: { items: { orderBy: { order: "asc" } } },
    // Mission templates change rarely and are shared across users — cache.
    cacheStrategy: { ttl: 120, swr: 300 },
  });

  // Login-streak status (mirror of /api/daily-reward GET, on the user's local day).
  let currentStreak = user.streak || 0;
  let canClaim = true;
  if (user.lastCheckIn) {
    const lastKey = localDayKey(tz, new Date(user.lastCheckIn));
    if (lastKey === todayKey) canClaim = false;
    else if (lastKey !== localDayKeyDaysAgo(tz, 1)) currentStreak = 0;
  }

  // Daily-mission progress (reuses the same builder as the mission page).
  // The Accelerate client doesn't surface the `include: { items }` payload in
  // the inferred type, so narrow it explicitly (mirrors the today route).
  type MissionItem = {
    taskType: string;
    targetCount: number;
    description: string | null;
    pointsPerComplete: number;
    xpPerComplete: number;
  };
  const missionItems =
    (missionRaw as unknown as { items: MissionItem[] } | null)?.items ?? [];
  let mission: {
    name: string;
    done: number;
    total: number;
    claimedToday: boolean;
    rewardPoints: number;
    rewardXp: number;
    items: {
      taskType: string;
      description: string | null;
      points: number;
      target: number;
      completedToday: number;
      done: boolean;
    }[];
  } | null = null;
  if (missionRaw && missionItems.length) {
    const countByType = await buildDailyProgress(userId, missionItems);
    const items = missionItems.map((it) => {
      const count = countByType[resolveTaskTypeBucket(it.taskType)] ?? 0;
      return {
        taskType: it.taskType,
        description: it.description,
        points: it.pointsPerComplete,
        target: it.targetCount,
        completedToday: Math.min(count, it.targetCount),
        done: count >= it.targetCount,
      };
    });
    const done = items.filter((it) => it.done).length;
    const claim = await prisma.dailyMissionClaim.findUnique({
      where: {
        userId_missionId_date: {
          userId,
          missionId: missionRaw.id,
          date: todayKey,
        },
      },
      select: { id: true },
    });
    mission = {
      name: missionRaw.name,
      done,
      total: items.length,
      claimedToday: !!claim,
      rewardPoints: missionRaw.completionPointsReward,
      rewardXp: missionRaw.completionXpReward,
      items,
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app";

  return NextResponse.json({
    balance: {
      points: user.pointsBalance,
      todayEarnings:
        (todayAgg as { _sum?: { points: number | null } })._sum?.points ?? 0,
    },
    streak: { current: currentStreak, canClaim },
    mission,
    referral: {
      code: user.referralCode,
      link: user.referralCode
        ? `${appUrl}/register?ref=${user.referralCode}`
        : null,
      totalReferrals: referralCount,
    },
  });
}
