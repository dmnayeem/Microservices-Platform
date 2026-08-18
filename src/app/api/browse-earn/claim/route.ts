import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { getBrowseEarnConfig } from "@/lib/browse-earn";
import { getUserDayContext } from "@/lib/user-day";

/**
 * Credit one Browse & Earn interval. The interval cooldown AND the per-local-day
 * cap are re-checked INSIDE a user-row lock, so concurrent requests can't farm
 * multiple rewards from a single interval and the daily cap is authoritative.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const cfg = await getBrowseEarnConfig();
  if (!cfg.enabled || cfg.dailyCap <= 0) {
    return NextResponse.json({ error: "Browse & Earn is off" }, { status: 400 });
  }

  const { startOfDayUtc } = await getUserDayContext(userId);
  const pointsPerUsd = await getPointsPerUsd();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    // Interval cooldown — the last credit must be at least tickSeconds old.
    const last = await tx.browseEarnLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const readyAt = last.createdAt.getTime() + cfg.tickSeconds * 1000;
      if (Date.now() < readyAt) {
        return { cooldownRemaining: Math.ceil((readyAt - Date.now()) / 1000) } as const;
      }
    }

    // Per-local-day cap.
    const agg = (await tx.browseEarnLog.aggregate({
      where: { userId, createdAt: { gte: startOfDayUtc } },
      _sum: { points: true },
    })) as unknown as { _sum: { points: number | null } };
    const earnedToday = agg._sum.points ?? 0;
    const remainingBefore = cfg.dailyCap - earnedToday;
    if (remainingBefore <= 0) {
      return { capped: true, todayEarned: earnedToday } as const;
    }

    const points = Math.min(cfg.pointsPerTick, remainingBefore);

    await tx.browseEarnLog.create({ data: { userId, points } });
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
        description: "Browse & Earn reward",
        reference: `browse_${Date.now()}`,
      },
    });
    return {
      rewarded: points,
      todayEarned: earnedToday + points,
      newBalance: user.pointsBalance,
    } as const;
  });

  if ("cooldownRemaining" in outcome) {
    return NextResponse.json(
      { error: "Too soon", cooldownRemaining: outcome.cooldownRemaining },
      { status: 429 }
    );
  }
  if ("capped" in outcome) {
    return NextResponse.json(
      { error: "Daily limit reached", todayEarned: outcome.todayEarned, remaining: 0 },
      { status: 429 }
    );
  }

  return NextResponse.json({
    success: true,
    rewarded: outcome.rewarded,
    todayEarned: outcome.todayEarned,
    remaining: Math.max(0, cfg.dailyCap - outcome.todayEarned),
    nextInSec: cfg.tickSeconds,
  });
}
