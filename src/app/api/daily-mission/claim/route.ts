import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/daily-mission-progress";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext, localDayKeyDaysAgo } from "@/lib/user-day";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  const userId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      level: true,
      package: { select: { accessLevel: true } },
    },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const accessLevel = me.package?.accessLevel ?? 0;

  const missionRaw = await prisma.dailyMissionTemplate.findFirst({
    where: {
      requiredAccessLevel: { lte: accessLevel },
      isActive: true,
      requiredLevel: { lte: me.level },
    },
    orderBy: [
      { requiredAccessLevel: "desc" },
      { order: "asc" },
      { createdAt: "desc" },
    ],
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!missionRaw) {
    return NextResponse.json(
      { error: "No active mission for your tier" },
      { status: 404 }
    );
  }
  type ItemRow = { id: string; taskType: string; targetCount: number };
  const mission = missionRaw as typeof missionRaw & { items: ItemRow[] };

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

  const points = mission.completionPointsReward;
  const xp = mission.completionXpReward;
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
        totalEarnings: { increment: points / pointsPerUsd },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.EARNING,
        status: TransactionStatus.COMPLETED,
        points,
        amount: points / pointsPerUsd,
        description: `Daily mission completed: ${mission.name}`,
        reference: `daily_mission_${mission.id}_${today}`,
        metadata: { missionId: mission.id, xp, streak, date: today },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: NotificationType.ACHIEVEMENT,
        title: "🎯 Daily Mission Complete!",
        message: `You earned ${points} pts + ${xp} XP from "${mission.name}". Streak: ${streak} day${
          streak === 1 ? "" : "s"
        }.`,
        data: { missionId: mission.id, points, xp, streak },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    points,
    xp,
    streak,
    date: today,
  });
  });
}
