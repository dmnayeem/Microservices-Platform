import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Credit the user for watching a reward ad, enforcing the per-ad cooldown. */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad || ad.status !== "ACTIVE" || ad.rewardPoints <= 0) {
    return NextResponse.json({ error: "Ad not available" }, { status: 400 });
  }

  const points = ad.rewardPoints;
  const pointsPerUsd = await getPointsPerUsd();

  // Serialize concurrent claims per user by locking the user row, then
  // re-checking the cooldown INSIDE the lock. Without this, N parallel POSTs
  // all read the same "last view", all pass the cooldown gate, and all credit
  // (the reward was farmable by firing concurrent requests).
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    const last = await tx.adView.findFirst({
      where: { userId, adId: id },
      orderBy: { createdAt: "desc" },
    });
    if (last) {
      const readyAt = last.createdAt.getTime() + ad.rewardCooldownSec * 1000;
      if (Date.now() < readyAt) {
        return {
          cooldownRemaining: Math.ceil((readyAt - Date.now()) / 1000),
        } as const;
      }
    }

    await tx.adView.create({
      data: { userId, adId: id, rewardedPoints: points },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: points },
        totalEarnings: { increment: points / pointsPerUsd },
      },
    });
    await tx.transaction.create({
      data: {
        userId,
        type: TransactionType.BONUS,
        status: TransactionStatus.COMPLETED,
        points,
        amount: points / pointsPerUsd,
        description: "Ad view reward",
        reference: `ad_${id}_${Date.now()}`,
      },
    });
    await tx.ad.update({ where: { id }, data: { clicks: { increment: 1 } } });
    return { newBalance: user.pointsBalance } as const;
  });

  if ("cooldownRemaining" in outcome) {
    return NextResponse.json(
      {
        error: "This ad is on cooldown",
        cooldownRemaining: outcome.cooldownRemaining,
      },
      { status: 429 }
    );
  }

  return NextResponse.json({
    success: true,
    rewarded: points,
    newBalance: outcome.newBalance,
  });
}
