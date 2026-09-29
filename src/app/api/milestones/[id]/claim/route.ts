import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { getMilestones, milestoneProgress } from "@/lib/milestones";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /milestones is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/milestones");
  if (pageHidden) return pageHidden;
  // Reward claim. Correctness comes from the unique ledger constraints; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(_request, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;

  return withIdempotency(_request, session.user.id, async () => {
  const { id } = await params;
  const userId = session.user.id;
  // Live list: admin-set points and on/off (`milestones.rewards`).
  const def = (await getMilestones()).find((m) => m.id === id);
  if (!def) {
    return NextResponse.json({ error: "Unknown milestone" }, { status: 400 });
  }
  if (!def.enabled) {
    return NextResponse.json(
      { error: "This milestone is not available right now." },
      { status: 400 }
    );
  }
  const reward = def.pointsReward;

  // The milestone has to actually be reached. This route used to pay on the
  // id alone, so every reward could be claimed by anyone, done or not.
  const progress = await milestoneProgress(userId);
  if ((progress?.get(id) ?? 0) < def.target) {
    return NextResponse.json(
      { error: "You haven't reached this milestone yet." },
      { status: 400 }
    );
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
        // Prefixed so the finance breakdown files it under achievements;
        // the bare id (`refer_1`, `earn_5`…) was classified as "other".
        reference: `milestone_${id}`,
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
