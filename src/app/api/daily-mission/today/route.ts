import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDailyProgress,
  resolveTaskTypeBucket,
} from "@/lib/daily-mission-progress";
import { getUserDayContext, localDayKeyDaysAgo } from "@/lib/user-day";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  // Pick the highest-accessLevel mission template the user qualifies for.
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
    return NextResponse.json({ mission: null });
  }
  type ItemRow = {
    id: string;
    taskType: string;
    description: string | null;
    targetCount: number;
    xpPerComplete: number;
    pointsPerComplete: number;
    duration: number | null;
    requiredLevel: number | null;
    order: number;
  };
  const mission = missionRaw as typeof missionRaw & { items: ItemRow[] };

  const { dayKey: today, tz } = await getUserDayContext(userId);
  const countByType = await buildDailyProgress(userId, mission.items);

  const itemsWithProgress = mission.items.map((it) => {
    const sourceType = resolveTaskTypeBucket(it.taskType);
    const completed = countByType[sourceType] ?? 0;
    return {
      id: it.id,
      taskType: it.taskType,
      description: it.description,
      targetCount: it.targetCount,
      xpPerComplete: it.xpPerComplete,
      pointsPerComplete: it.pointsPerComplete,
      duration: it.duration,
      requiredLevel: it.requiredLevel,
      order: it.order,
      completedToday: Math.min(completed, it.targetCount),
      done: completed >= it.targetCount,
    };
  });

  const totalItems = itemsWithProgress.length;
  const doneItems = itemsWithProgress.filter((it) => it.done).length;
  const allDone = totalItems > 0 && itemsWithProgress.every((it) => it.done);

  // Already claimed today?
  const claim = await prisma.dailyMissionClaim.findUnique({
    where: {
      userId_missionId_date: {
        userId,
        missionId: mission.id,
        date: today,
      },
    },
  });

  // Streak: count consecutive prior days with claims (this mission OR any).
  let streak = claim?.streak ?? 0;
  if (!claim) {
    const recent = await prisma.dailyMissionClaim.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30,
      select: { date: true },
    });
    const seen = new Set(recent.map((r) => r.date));
    let s = 0;
    for (let i = 0; i < 30; i++) {
      // Walk back over the user's LOCAL days (yesterday, day-before, …).
      if (seen.has(localDayKeyDaysAgo(tz, i + 1))) {
        s += 1;
      } else {
        break;
      }
    }
    streak = s;
  }

  return NextResponse.json({
    mission: {
      id: mission.id,
      name: mission.name,
      description: mission.description,
      requiredAccessLevel: mission.requiredAccessLevel,
      requiredLevel: mission.requiredLevel,
      completionXpReward: mission.completionXpReward,
      completionPointsReward: mission.completionPointsReward,
      linkReferralBonus: mission.linkReferralBonus,
      autoRefresh: mission.autoRefresh,
    },
    items: itemsWithProgress,
    progress: { done: doneItems, total: totalItems, allDone },
    claimedToday: !!claim,
    streak,
    today,
  });
}
