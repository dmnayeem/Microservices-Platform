import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WithdrawalStatus } from "@/generated/prisma";
import { getSubscriptionStatus } from "@/lib/packages";
import { getPointsPerUsd, getPointsConvertThreshold } from "@/lib/economy";
import { toNum, type MoneyInput } from "@/lib/money";

// GET /api/wallet - Get user wallet details
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        pointsBalance: true,
        cashBalance: true,
        adCreditBalance: true,
        totalEarnings: true,
        totalWithdrawals: true,
        level: true,
        xp: true,
        kycStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Resolve the user's effective plan + raw expiry status (for the renew banner).
    const sub = await getSubscriptionStatus(session.user.id);

    const pendingWithdrawalsAgg = (await prisma.withdrawal.aggregate({
      where: {
        userId: session.user.id,
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
      },
      _sum: { amount: true },
      // `Withdrawal.amount` is Decimal, so the sum is a Decimal — typing it
      // `number` here was a lie the next reader would act on. `toNum` below does
      // the real conversion.
    })) as unknown as { _sum: { amount: MoneyInput | null } };
    const pendingWithdrawalsAmount = toNum(pendingWithdrawalsAgg._sum.amount);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayEarningsAgg, monthEarningsAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId: session.user.id,
          type: "EARNING",
          status: "COMPLETED",
          createdAt: { gte: todayStart },
        },
        _sum: { points: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId: session.user.id,
          type: "EARNING",
          status: "COMPLETED",
          createdAt: { gte: monthStart },
        },
        _sum: { points: true },
      }),
    ]);

    const todayEarningsPoints = todayEarningsAgg._sum.points ?? 0;
    const monthEarningsPoints = monthEarningsAgg._sum.points ?? 0;

    const tasksCompletedToday = await prisma.taskSubmission.count({
      where: {
        userId: session.user.id,
        createdAt: { gte: todayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
    });

    const [pointsPerUsd, convertThreshold] = await Promise.all([
      getPointsPerUsd(),
      getPointsConvertThreshold(),
    ]);
    // Withdrawable is now the CASH balance (pending withdrawals already decrement
    // it at request time). Points convert to cash once they reach the threshold.
    const cash = toNum(user.cashBalance);
    const pointsAsUsd = user.pointsBalance / pointsPerUsd;
    const canConvert = user.pointsBalance >= convertThreshold;

    const pkg = sub.effective;

    return NextResponse.json({
      balance: {
        points: user.pointsBalance,
        cash,
        adCredit: toNum(user.adCreditBalance),
        withdrawable: cash,
        pointsAsUsd,
        cashEquivalent: pointsAsUsd,
        pendingWithdrawal: pendingWithdrawalsAmount,
        totalEarnings: toNum(user.totalEarnings),
        totalWithdrawals: toNum(user.totalWithdrawals),
      },
      convert: {
        threshold: convertThreshold,
        points: user.pointsBalance,
        canConvert,
        pointsAsUsd,
        pointsPerUsd,
      },
      stats: {
        todayEarnings: todayEarningsPoints,
        monthEarnings: monthEarningsPoints,
        tasksCompletedToday,
        level: user.level,
        xp: user.xp,
      },
      package: {
        id: pkg?.id ?? null,
        slug: pkg?.slug ?? null,
        name: pkg?.name ?? "Free",
        accessLevel: pkg?.accessLevel ?? 0,
        minWithdrawal: pkg?.minWithdrawal ?? 5,
        withdrawalFeeDiscount: pkg?.withdrawalFeeDiscount ?? 0,
        dailyTaskLimit: pkg?.dailyTaskLimit ?? -1,
        // Subscription status — UI can render a "Renew" banner.
        rawPackageId: sub.rawPackageId,
        expired: sub.expired,
        expiresAt: sub.expiresAt,
      },
      kycStatus: user.kycStatus,
      canWithdraw:
        !!pkg?.withdrawalsEnabled &&
        user.kycStatus === "APPROVED" &&
        cash >= (pkg?.minWithdrawal ?? 5),
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallet" },
      { status: 500 }
    );
  }
}
