import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import {
  buildDailyProgress,
  resolveTaskTypeBucket,
  getActiveMissionForUser,
} from "@/lib/daily-mission-progress";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { getUserDayContext, localDayKeyDaysAgo } from "@/lib/user-day";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Reward claim. Correctness comes from the unique ledger constraints; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(request, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;

  return withIdempotency(request, session.user.id, async () => {
  const userId = session.user.id;

  // The SAME resolver /api/daily-mission/today uses. This route pays out, so
  // resolving the mission a second way is how the displayed mission and the
  // paid one drift apart.
  const mission = await getActiveMissionForUser(userId);
  if (!mission) {
    return NextResponse.json(
      { error: "No active mission for your tier" },
      { status: 404 }
    );
  }

  const { dayKey: today, tz } = await getUserDayContext(userId);

  // Server-side completion check using shared progress builder
  const countByType = await buildDailyProgress(userId, mission.items);

  for (const it of mission.items) {
    const sourceType = resolveTaskTypeBucket(it.taskType);
    const got = countByType[sourceType] ?? 0;
    if (got < it.targetCount) {
      return NextResponse.json(
        {
          error: `Mission incomplete — need ${
            it.targetCount - got
          } more ${it.taskType.toLowerCase()} task${
            it.targetCount - got > 1 ? "s" : ""
          }.`,
        },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.dailyMissionClaim.findUnique({
    where: {
      userId_missionId_date: { userId, missionId: mission.id, date: today },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Already claimed today's mission reward" },
      { status: 400 }
    );
  }

  // Compute streak: consecutive days ending yesterday for this user.
  const recent = await prisma.dailyMissionClaim.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 30,
    select: { date: true },
  });
  const seen = new Set(recent.map((r) => r.date));
  let streak = 1;
  for (let i = 0; i < 30; i++) {
    // Consecutive prior LOCAL days for this user.
    if (seen.has(localDayKeyDaysAgo(tz, i + 1))) {
      streak += 1;
    } else {
      break;
    }
  }

  const basePoints = mission.completionPointsReward;
  const xp = mission.completionXpReward;
  const cash = toNum(mission.completionCashReward);

  // Streak bonus. `DailyMissionClaim.streak` was already being computed and
  // stored on every claim but rewarded nothing — it was a number in a column.
  // Paid every Nth consecutive day, so day 7/14/21 of a 7-day cycle all pay.
  const streakBonus =
    mission.streakBonusEvery > 0 &&
    mission.streakBonusPoints > 0 &&
    streak % mission.streakBonusEvery === 0
      ? mission.streakBonusPoints
      : 0;
  const points = basePoints + streakBonus;
  const pointsPerUsd = await getPointsPerUsd();

  await prisma.$transaction([
    prisma.dailyMissionClaim.create({
      data: { userId, missionId: mission.id, date: today, streak },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: points },
        xp: { increment: xp },
        // Cash goes to the cash wallet; points convert at the configured rate.
        ...(cash > 0 ? { cashBalance: { increment: cash } } : {}),
        totalEarnings: { increment: points / pointsPerUsd + cash },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.EARNING,
        status: TransactionStatus.COMPLETED,
        points,
        amount: points / pointsPerUsd + cash,
        description: `Daily mission completed: ${mission.name}`,
        // Unchanged, and it must stay this way: one claim per mission per local
        // day is enforced by `Transaction @@unique([userId, reference])` as much
        // as by the DailyMissionClaim row above.
        reference: `daily_mission_${mission.id}_${today}`,
        metadata: {
          missionId: mission.id,
          xp,
          cash,
          streak,
          streakBonus,
          date: today,
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: NotificationType.ACHIEVEMENT,
        title: "🎯 Daily Mission Complete!",
        message: `You earned ${points} pts${cash > 0 ? ` + ${usd(cash)}` : ""} + ${xp} XP from "${mission.name}".${
          streakBonus > 0 ? ` Streak bonus: +${streakBonus} pts!` : ""
        } Streak: ${streak} day${streak === 1 ? "" : "s"}.`,
        data: { missionId: mission.id, points, xp, cash, streak, streakBonus },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    points,
    xp,
    cash,
    streak,
    streakBonus,
    date: today,
  });
  });
}
