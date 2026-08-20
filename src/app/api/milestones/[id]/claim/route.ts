import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";

const REWARDS: Record<string, number> = {
  tasks_5: 100,
  tasks_25: 500,
  tasks_100: 2000,
  checkins_7: 250,
  checkins_30: 1500,
  earn_5: 250,
  earn_50: 1000,
  earn_500: 5000,
  posts_5: 200,
  likes_50: 500,
  level_10: 1000,
  level_25: 5000,
  refer_1: 500,
  refer_10: 2500,
  refer_50: 10000,
  profile_complete: 500,
  profile_socials: 300,
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Reward claim. Correctness comes from the unique ledger constraints; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(_request, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;

  return withIdempotency(_request, session.user.id, async () => {
  const { id } = await params;
  const userId = session.user.id;
  const reward = REWARDS[id];
  if (!reward) {
    return NextResponse.json({ error: "Unknown milestone" }, { status: 400 });
  }

  // Check if already claimed
  const existing = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: "MILESTONE_CLAIMED",
      entity: "Milestone",
      entityId: id,
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Already claimed" },
      { status: 409 }
    );
  }

  // Milestone rewards count toward lifetime earnings — keep totalEarnings in sync.
  const pointsPerUsd = await getPointsPerUsd();
  const rewardUsd = pointsPerUsd > 0 ? reward / pointsPerUsd : 0;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: reward },
        totalEarnings: { increment: rewardUsd },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: "BONUS",
        status: "COMPLETED",
        points: reward,
        amount: rewardUsd,
        description: `Milestone reward: ${id}`,
        reference: id,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "MILESTONE_CLAIMED",
        entity: "Milestone",
        entityId: id,
        newData: { points: reward },
      },
    }),
  ]);

  return NextResponse.json({ success: true, pointsRewarded: reward });
  });
}
