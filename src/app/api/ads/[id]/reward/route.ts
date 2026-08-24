import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { getAdClickCost } from "@/lib/ad-billing";
import { servableCampaignWhere } from "@/lib/ad-serve";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { getUserDayContext } from "@/lib/user-day";
import {
  getRewardedConfig,
  rewardReference,
  verifyWatchToken,
  watchedSeconds,
} from "@/lib/ads-rewarded";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Credit the user for watching a rewarded ad.
 *
 * This route used to be exploitable in four separate ways, all of which are
 * closed here. It had **no daily cap** (`ad-billing.ts:8-10` already said so in a
 * comment), **no rate limit**, **no enforcement of `watchSeconds`** — a bare POST
 * with no body credited immediately, with nothing recording that a video had ever
 * played — and **no real idempotency**, because `AdView` has no unique constraint
 * and the ledger reference embedded `Date.now()`, which defeated the
 * `@@unique([userId, reference])` backstop.
 *
 * It also gated on a *weaker* campaign check than the list route: `status` and
 * `endAt` only, not `startAt`, budget, or advertiser suspension. So an ad the
 * list route filtered out could still be claimed by POSTing to it directly.
 *
 * The shape is now `browse-earn/claim`, which already did all of this correctly:
 * rate limit, then cooldown **and** daily cap re-checked inside a user-row lock,
 * with partial credit when the cap is close.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const cfg = await getRewardedConfig();
  if (!cfg.enabled || cfg.dailyCap <= 0) {
    return NextResponse.json({ error: "Rewarded ads are off" }, { status: 400 });
  }

  // Correctness comes from the lock and the ledger constraint below; this keeps
  // a claim flood from being absorbed by the database in the first place.
  const limited = await enforceDbRateLimit(request, "claim", userId, 30, 60_000);
  if (limited) return limited;

  // ── Watch proof ──────────────────────────────────────────────────────────
  // The token is issued by GET /api/ads/rewarded at the moment the ad is served
  // and is bound to this user and this ad. See ads-rewarded.ts for exactly what
  // it does and does not prove.
  const body = (await request.json().catch(() => ({}))) as { watchToken?: string };
  const token = verifyWatchToken(body?.watchToken, userId, id);
  if (!token) {
    return NextResponse.json(
      { error: "Watch this ad from the app to earn", code: "BAD_WATCH_TOKEN" },
      { status: 400 }
    );
  }

  const ad = await prisma.ad.findFirst({
    where: {
      id,
      status: "ACTIVE",
      rewardPoints: { gt: 0 },
      // The SAME gate the list route applies, rather than a looser one.
      campaign: servableCampaignWhere(await getAdClickCost(), new Date(), false),
    },
  });
  if (!ad) {
    return NextResponse.json({ error: "Ad not available" }, { status: 400 });
  }

  const watched = watchedSeconds(token);
  if (watched < ad.watchSeconds) {
    return NextResponse.json(
      {
        error: "Keep watching",
        code: "TOO_SOON",
        secondsRemaining: ad.watchSeconds - watched,
      },
      { status: 429 }
    );
  }

  const pointsPerUsd = await getPointsPerUsd();
  const { startOfDayUtc } = await getUserDayContext(userId);
  const reference = rewardReference(token);

  // Serialize concurrent claims per user by locking the user row, then
  // re-checking the cooldown AND the daily cap INSIDE the lock. Without this, N
  // parallel POSTs all read the same "last view", all pass the gates, and all
  // credit.
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

    const agg = (await tx.adView.aggregate({
      where: { userId, createdAt: { gte: startOfDayUtc } },
      _sum: { rewardedPoints: true },
    })) as unknown as { _sum: { rewardedPoints: number | null } };
    const earnedToday = agg._sum.rewardedPoints ?? 0;
    const remainingBefore = cfg.dailyCap - earnedToday;
    if (remainingBefore <= 0) {
      return { capped: true, todayEarned: earnedToday } as const;
    }

    // Partial credit rather than refusing outright — the same call browse-earn
    // makes. A user one point from the cap should get that point, not nothing.
    const points = Math.min(ad.rewardPoints, remainingBefore);

    // The ledger row goes FIRST, so its unique constraint aborts the whole
    // transaction on a replay before any balance moves. The reference is derived
    // from the token id, so replaying one token credits exactly once.
    await tx.transaction.create({
      data: {
        userId,
        type: TransactionType.BONUS,
        status: TransactionStatus.COMPLETED,
        points,
        amount: points / pointsPerUsd,
        description: "Ad view reward",
        reference,
      },
    });
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
    // A watch-and-earn view is NOT a click: counting it here inflated CTR and
    // implied spend that never happened. The AdView row above records the watch.
    return {
      rewarded: points,
      todayEarned: earnedToday + points,
      newBalance: user.pointsBalance,
    } as const;
  }).catch((e: unknown) => {
    // P2002 on the ledger reference = this token was already redeemed. That is
    // the idempotency backstop doing its job, not an error worth surfacing.
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return { replayed: true } as const;
    throw e;
  });

  if ("replayed" in outcome) {
    return NextResponse.json(
      { error: "Already rewarded for this watch", code: "ALREADY_REWARDED" },
      { status: 409 }
    );
  }
  if ("cooldownRemaining" in outcome) {
    return NextResponse.json(
      {
        error: "This ad is on cooldown",
        cooldownRemaining: outcome.cooldownRemaining,
      },
      { status: 429 }
    );
  }
  if ("capped" in outcome) {
    return NextResponse.json(
      {
        error: "Daily limit reached",
        code: "DAILY_CAP",
        todayEarned: outcome.todayEarned,
        remaining: 0,
      },
      { status: 429 }
    );
  }

  return NextResponse.json({
    success: true,
    rewarded: outcome.rewarded,
    todayEarned: outcome.todayEarned,
    remaining: Math.max(0, cfg.dailyCap - outcome.todayEarned),
    newBalance: outcome.newBalance,
  });
}
