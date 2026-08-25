import { NextResponse, NextRequest } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { getBrowseEarnConfig } from "@/lib/browse-earn";
import { getUserDayContext } from "@/lib/user-day";
import { isDuplicateLedgerError } from "@/lib/idempotency";

/**
 * Credit one Browse & Earn interval. The interval cooldown AND the per-local-day
 * cap are re-checked INSIDE a user-row lock, so concurrent requests can't farm
 * multiple rewards from a single interval and the daily cap is authoritative.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Reward claim. Correctness comes from the unique ledger constraints; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(request, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;

  const userId = session.user.id;

  const cfg = await getBrowseEarnConfig();
  if (!cfg.enabled || cfg.dailyCap <= 0) {
    return NextResponse.json({ error: "Browse & Earn is off" }, { status: 400 });
  }

  const { startOfDayUtc, dayKey } = await getUserDayContext(userId);
  const pointsPerUsd = await getPointsPerUsd();

  // Per-INTERVAL idempotency key. The reference used to be `browse_${Date.now()}`,
  // unique on every call, so `Transaction @@unique([userId, reference])` could
  // never dedupe a Browse & Earn credit — the row lock below was the only guard.
  //
  // A per-day key would be wrong here: unlike the daily reward, this event is
  // *meant* to repeat all day. Bucketing by tick is what makes it safe — the
  // cooldown enforced under `FOR UPDATE` guarantees any two legitimate credits
  // are at least `tickSeconds` apart, and two timestamps that far apart cannot
  // land in the same bucket. A collision therefore only ever means a replay.
  const tickIndex = Math.floor(
    (Date.now() - startOfDayUtc.getTime()) / (cfg.tickSeconds * 1000)
  );
  const reference = `browse_${dayKey}_${tickIndex}`;

  const outcome = await prisma
    .$transaction(async (tx) => {
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
        reference,
      },
    });
    return {
      rewarded: points,
      todayEarned: earnedToday + points,
      newBalance: user.pointsBalance,
    } as const;
    })
    .catch((err: unknown) => {
      // Only reachable if an admin changes `tickSeconds` mid-day and re-indexes
      // the buckets under a claim already made. That is a conflict, not a server
      // fault, so it gets the same answer as the cooldown branch below rather
      // than a 500.
      if (isDuplicateLedgerError(err)) {
        return { cooldownRemaining: cfg.tickSeconds } as const;
      }
      throw err;
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
