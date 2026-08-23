import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import {
  getEffectivePackage,
  resolveUserFeature,
  parseFeatureOverrides,
} from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { getReferralBonusMission } from "@/lib/daily-mission-progress";
import { getUserDayContext } from "@/lib/user-day";

const DEFAULT_DAILY_PER_REFERRAL = 5; // points per L1 referral, used if Package.referralBonus is 0

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userPackage = await getEffectivePackage(userId);
  // Daily claim is L1 commission, so plan must unlock at least L1.
  const commissionLevels = userPackage?.referralCommissionLevels ?? 0;
  const canEarnReferralCommission = commissionLevels >= 1;

  const { dayKey: today } = await getUserDayContext(userId);
  const existing = await prisma.dailyReferralClaim.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  // L1 referral count — ACTIVE accounts only.
  //
  // This is a RECURRING daily payout of `perReferral × count`, and it used to
  // count every row with `referredById = you`: accounts that never verified
  // their email, accounts banned for fraud, and self-deleted accounts (which
  // are soft-deleted to BANNED but keep their `referredById`). Registering
  // throwaway addresses that are never opened therefore bought a permanent
  // daily income. `audienceWhere()` already treats `status: "ACTIVE"` as the
  // house rule for who counts as a real user.
  const referralCount = await prisma.user.count({
    where: { referredById: userId, status: "ACTIVE" },
  });

  // Per-referral bonus from the user's plan; default 5 if 0/null. Plan that
  // doesn't unlock L1 earns nothing regardless of bonus value.
  const perReferral =
    canEarnReferralCommission &&
    userPackage?.dailyReferralPoints &&
    userPackage.dailyReferralPoints > 0
      ? userPackage.dailyReferralPoints
      : canEarnReferralCommission
        ? DEFAULT_DAILY_PER_REFERRAL
        : 0;
  const points = Math.round(perReferral * referralCount);

  // Mission gating — use the highest-level mission template the user qualifies for.
  // Shared resolver — same tier/schedule/targeting rules as everywhere else.
  const mission = await getReferralBonusMission(userId);
  let missionRequired = false;
  let missionComplete = false;
  if (mission) {
    missionRequired = true;
    const claim = await prisma.dailyMissionClaim.findUnique({
      where: {
        userId_missionId_date: {
          userId,
          missionId: mission.id,
          date: today,
        },
      },
    });
    missionComplete = !!claim;
  }

  return NextResponse.json({
    points,
    perReferral,
    referralCount,
    canClaim: !existing && referralCount > 0 && (!missionRequired || missionComplete),
    claimed: !!existing,
    missionRequired,
    missionComplete,
    missionId: mission?.id ?? null,
    today,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A banned or suspended account must not be able to claim a reward. `User.status`
  // is otherwise only ever read at login, and the JWT lives 30 days with no
  // status claim, so a ban had no effect until the session expired.
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json(
      { error: active.message },
      { status: active.httpStatus }
    );
  }
  return withIdempotency(request, session.user.id, async () => {
  const userId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, featureOverrides: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userPackage = await getEffectivePackage(userId);

  if (
    !resolveUserFeature(
      userPackage,
      parseFeatureOverrides(me.featureOverrides),
      "referrals"
    )
  ) {
    return NextResponse.json(
      { error: "Referral rewards are disabled for your plan" },
      { status: 403 }
    );
  }

  // Plan must unlock at least L1 commission for the daily claim to count.
  if ((userPackage?.referralCommissionLevels ?? 0) < 1) {
    return NextResponse.json(
      { error: "Your plan does not earn referral commissions. Upgrade to start earning." },
      { status: 403 }
    );
  }

  const { dayKey: today } = await getUserDayContext(userId);

  const existing = await prisma.dailyReferralClaim.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Already claimed today's referral bonus" },
      { status: 400 }
    );
  }

  const referralCount = await prisma.user.count({
    where: { referredById: userId },
  });
  if (referralCount === 0) {
    return NextResponse.json(
      { error: "You don't have any referrals yet" },
      { status: 400 }
    );
  }

  // Mission gate
  const mission = await getReferralBonusMission(userId);
  if (mission) {
    const missionClaim = await prisma.dailyMissionClaim.findUnique({
      where: {
        userId_missionId_date: {
          userId,
          missionId: mission.id,
          date: today,
        },
      },
    });
    if (!missionClaim) {
      return NextResponse.json(
        {
          error: `Complete today's daily mission "${mission.name}" first to unlock the referral bonus.`,
        },
        { status: 400 }
      );
    }
  }

  const perReferral =
    userPackage?.dailyReferralPoints && userPackage.dailyReferralPoints > 0
      ? userPackage.dailyReferralPoints
      : DEFAULT_DAILY_PER_REFERRAL;
  const points = Math.round(perReferral * referralCount);
  const pointsPerUsd = await getPointsPerUsd();
  const cashAmount = points / pointsPerUsd;

  await prisma.$transaction([
    prisma.dailyReferralClaim.create({
      data: { userId, date: today, points, amount: cashAmount },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: points },
        totalEarnings: { increment: cashAmount },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.REFERRAL,
        status: TransactionStatus.COMPLETED,
        points,
        amount: cashAmount,
        description: `Daily referral bonus (${referralCount} referrals × ${perReferral} pts)`,
        reference: `daily_referral_${today}_${userId}`,
        metadata: { referralCount, perReferral, date: today },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: NotificationType.REFERRAL,
        title: "💸 Daily referral bonus claimed",
        message: `You earned ${points} pts from ${referralCount} active referrals.`,
        data: { points, referralCount, date: today },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    points,
    referralCount,
    perReferral,
    date: today,
  });
  });
}
