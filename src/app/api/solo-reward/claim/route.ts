import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getUserDayContext } from "@/lib/user-day";
import { getPointsPerUsd } from "@/lib/economy";

const CRITERIA = { tasksToday: 5, earningsToday: 1 };
const REWARD = { points: 500, xp: 100 };

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  const userId = session.user.id;

  // "Today" is the user's LOCAL day (country-based).
  const { dayKey: todayKey, startOfDayUtc: todayStart } =
    await getUserDayContext(userId);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  const [tasksToday, earnTransactions, claimedToday] = await Promise.all([
    prisma.taskSubmission.count({
      where: {
        userId,
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ["EARNING", "BONUS", "REFERRAL"] },
        status: "COMPLETED",
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      select: { amount: true },
    }),
    prisma.auditLog.findFirst({
      where: {
        userId,
        action: "SOLO_REWARD_CLAIMED",
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),
  ]);

  if (claimedToday) {
    return NextResponse.json(
      { error: "Already claimed today" },
      { status: 409 }
    );
  }

  const earningsToday = earnTransactions.reduce(
    (sum, t) => sum + toNum(t.amount),
    0
  );

  if (
    tasksToday < CRITERIA.tasksToday ||
    earningsToday < CRITERIA.earningsToday
  ) {
    return NextResponse.json(
      {
        error: "Criteria not met",
        details: { tasksToday, earningsToday, required: CRITERIA },
      },
      { status: 400 }
    );
  }

  const pointsPerUsd = await getPointsPerUsd();
  const rewardUsd = pointsPerUsd > 0 ? REWARD.points / pointsPerUsd : 0;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: REWARD.points },
        totalEarnings: { increment: rewardUsd },
        xp: { increment: REWARD.xp },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: "BONUS",
        status: "COMPLETED",
        points: REWARD.points,
        amount: rewardUsd,
        description: "Solo reward (daily)",
        // Per-day idempotency key (backs up the auditLog "already claimed" guard).
        reference: `solo_${todayKey}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "SOLO_REWARD_CLAIMED",
        entity: "User",
        entityId: userId,
        newData: REWARD,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    pointsAwarded: REWARD.points,
    xpAwarded: REWARD.xp,
  });
  });
}
