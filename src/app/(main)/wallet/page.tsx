import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  WalletView,
  type WalletTransaction,
  type ReferralStats,
  type WalletDeposit,
} from "@/components/user/wallet/wallet-view";
import { getKycPromptState } from "@/lib/kyc-prompt-server";
import { KycPromptBanner } from "@/components/user/primitives/kyc-prompt-banner";
import { getPointsPerUsd, getPointsConvertThreshold } from "@/lib/economy";
import { getWithdrawalConfig } from "@/lib/withdrawal";
import { toNum } from "@/lib/money";
import { resolveUserTimezone, localStartOfDayUtc } from "@/lib/user-day";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [
    user,
    transactions,
    pendingWithdrawalsCount,
    withdrawnAgg,
    refEarningsByLevel,
    l1Users,
    deposits,
    kycPrompt,
    pointsPerUsd,
    convertThreshold,
  ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          pointsBalance: true,
          cashBalance: true,
          adCreditBalance: true,
          totalEarnings: true,
          country: true,
          timezone: true,
          package: { select: { slug: true, name: true } },
        },
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.withdrawal.count({
        where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      }),
      // Sums, not rows. These used to pull EVERY completed withdrawal and EVERY
      // referral-earning row for the user just to add them up in JS — unbounded,
      // and growing for exactly the users who use the platform most.
      prisma.withdrawal.aggregate({
        where: { userId, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.referralEarning.groupBy({
        by: ["level"],
        where: { userId },
        _sum: { amount: true },
      }) as unknown as Promise<
        { level: number; _sum: { amount: unknown } }[]
      >,
      prisma.user.findMany({
        where: { referredById: userId },
        select: { id: true },
      }),
      prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, amount: true, method: true, status: true, txnId: true, createdAt: true },
      }),
      // Independent of the queries above — batched here to avoid extra serial hops.
      getKycPromptState(userId),
      getPointsPerUsd(),
      getPointsConvertThreshold(),
    ]);

  // Effective withdrawal fee % (admin setting − package discount) so the wallet
  // Withdraw tab can show it too, matching the /withdrawal page.
  const wcfg = await getWithdrawalConfig(userId);

  if (!user) redirect("/login");

  const totalWithdrawn = toNum(withdrawnAgg._sum.amount ?? 0);

  // Time boundaries in the user's local day (matches the daily-reset boundary).
  const tz = resolveUserTimezone({
    country: user.country,
    timezone: user.timezone,
  });
  const now = new Date();
  const dayStart = localStartOfDayUtc(tz, now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // The two windowed sums need the user's timezone, which is only known after
  // the batch above — so they run as their own parallel pair rather than by
  // filtering a full row set in memory.
  const [monthlyAgg, todayRefAgg] = await Promise.all([
    prisma.withdrawal.aggregate({
      where: { userId, status: "COMPLETED", createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.referralEarning.aggregate({
      where: { userId, createdAt: { gte: dayStart } },
      _sum: { amount: true },
    }),
  ]);
  // Income = money withdrawn. Monthly income = withdrawn this month.
  const monthlyIncome = toNum(monthlyAgg._sum.amount ?? 0);
  // Today's referral bonus (USD) — referral earnings credited since local midnight.
  const todayReferralBonus = toNum(todayRefAgg._sum.amount ?? 0);

  // Compute L2 (children of L1 users) and L3 (grandchildren) counts
  const l1Ids = l1Users.map((u) => u.id);
  const l2Users = l1Ids.length
    ? await prisma.user.findMany({
        where: { referredById: { in: l1Ids } },
        select: { id: true },
      })
    : [];
  const l2Ids = l2Users.map((u) => u.id);
  const l3UsersCount = l2Ids.length
    ? await prisma.user.count({
        where: { referredById: { in: l2Ids } },
      })
    : 0;

  // Aggregate referral earnings by level
  const stats: ReferralStats = {
    l1Count: l1Ids.length,
    l2Count: l2Ids.length,
    l3Count: l3UsersCount,
    l1Earned: 0,
    l2Earned: 0,
    l3Earned: 0,
    totalEarned: 0,
  };
  for (const r of refEarningsByLevel) {
    const amt = toNum((r._sum.amount ?? 0) as never);
    if (r.level === 1) stats.l1Earned += amt;
    else if (r.level === 2) stats.l2Earned += amt;
    else if (r.level === 3) stats.l3Earned += amt;
    stats.totalEarned += amt;
  }

  const txList: WalletTransaction[] = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    status: tx.status,
    points: tx.points,
    amount: Number(tx.amount),
    description: tx.description,
    reference: tx.reference,
    createdAt: tx.createdAt.toISOString(),
  }));

  const depositList: WalletDeposit[] = deposits.map((d) => ({
    id: d.id,
    amount: toNum(d.amount),
    method: d.method,
    status: d.status,
    txnId: d.txnId,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <>
      {kycPrompt.show && (
        <div className="mb-4">
          <KycPromptBanner />
        </div>
      )}
      <WalletView
        pointsBalance={user.pointsBalance}
        cashBalance={Number(user.cashBalance)}
        adCreditBalance={toNum(user.adCreditBalance)}
        totalEarnings={Number(user.totalEarnings)}
        totalWithdrawn={totalWithdrawn}
        monthlyIncome={monthlyIncome}
        todayReferralBonus={todayReferralBonus}
        packageTier={user.package?.slug ?? "default"}
        transactions={txList}
        deposits={depositList}
        referralStats={stats}
        pendingWithdrawals={pendingWithdrawalsCount}
        pointsPerUsd={pointsPerUsd}
        convertThreshold={convertThreshold}
        withdrawalFeePct={wcfg.feePct}
      />
    </>
  );
}
