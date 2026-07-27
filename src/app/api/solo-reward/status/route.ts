import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getUserDayContext } from "@/lib/user-day";

// Solo reward unlocks daily once user meets criteria
const CRITERIA = {
  tasksToday: 5,
  earningsToday: 1, // $1
};

const REWARD = {
  points: 500,
  xp: 100,
  cashUsd: 0,
  boostMultiplier: 2,
  boostHours: 24,
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // "Today" is the user's LOCAL day (country-based).
  const { startOfDayUtc: todayStart } = await getUserDayContext(userId);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  // Compute today's activity
  const [tasksToday, earnTransactions] = await Promise.all([
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
  ]);
  const earningsToday = earnTransactions.reduce(
    (sum, t) => sum + toNum(t.amount),
    0
  );

  // Check if already claimed today
  const claimedToday = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: "SOLO_REWARD_CLAIMED",
      createdAt: { gte: todayStart, lt: tomorrowStart },
    },
  });

  const eligible =
    tasksToday >= CRITERIA.tasksToday &&
    earningsToday >= CRITERIA.earningsToday;

  let status: "LOCKED" | "ELIGIBLE" | "CLAIMED" | "EXPIRED";
  if (claimedToday) status = "CLAIMED";
  else if (eligible) status = "ELIGIBLE";
  else status = "LOCKED";

  return NextResponse.json({
    status,
    criteria: [
      {
        label: "Tasks completed today",
        current: tasksToday,
        target: CRITERIA.tasksToday,
      },
      {
        label: "Earnings today ($)",
        current: Number(earningsToday.toFixed(2)),
        target: CRITERIA.earningsToday,
        unit: "",
      },
    ],
    reward: REWARD,
    resetAt: tomorrowStart.toISOString(),
  });
}
