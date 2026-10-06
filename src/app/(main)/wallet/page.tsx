import { auth } from "@/lib/auth";
import { ledgerForUser } from "@/lib/ledger-display";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
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
import { getTeamSummary } from "@/lib/team";
import { summarizeEarnings } from "@/lib/dashboard-earnings";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const userP = prisma.user.findUnique({
    where: { id: userId },
    select: {
      pointsBalance: true,
      cashBalance: true,
      adCreditBalance: true,
      taskCreditPoints: true,
      totalEarnings: true,
      country: true,
      timezone: true,
      package: { select: { slug: true, name: true } },
    },
  });
  const now = new Date();
  // Calendar month in UTC — does not depend on the user's timezone.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Today's referral bonus needs the user's local midnight, so it chains off
  // the user read above — it still runs inside the one parallel round below
  // instead of in a second round of its own after everything else.
  const todayRefP = userP.then((u) => {
    if (!u) return null;
    const tz = resolveUserTimezone({ country: u.country, timezone: u.timezone });
    return prisma.referralEarning.aggregate({
      where: { userId, createdAt: { gte: localStartOfDayUtc(tz, now) } },
      _sum: { amount: true },
    });
  });

  const [
    user,
    ledgerRaw,
    pendingWithdrawalsCount,
    withdrawalRows,
    withdrawnAgg,
    teamSummary,
    deposits,
    kycPrompt,
    pointsPerUsd,
    convertThreshold,
    monthlyAgg,
    todayRefAgg,
    wcfg,
  ] = await Promise.all([
      userP,
      // The last 30 days of the ledger, read once: the earnings breakdown
      // (same rules as the dashboard and the admin console) and the recent
      // list both come from it.
      //
      // Non-critical (history + breakdown) → degrades to an empty list instead
      // of failing the wallet. Only the columns the ledger code reads: the full
      // row (1000 × every column) was the heaviest read on this page.
      safeRead(
        prisma.transaction.findMany({
          where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: {
            id: true,
            type: true,
            status: true,
            points: true,
            amount: true,
            reference: true,
            description: true,
            // ledgerForUser reads metadata.adjustedPoints.
            metadata: true,
            createdAt: true,
          },
        }),
        [],
        "wallet ledger"
      ),
      prisma.withdrawal.count({
        where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      }),
      // The status cards (pending / paid / rejected) and the withdrawal record.
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amount: true,
          fee: true,
          netAmount: true,
          method: true,
          status: true,
          createdAt: true,
          processedAt: true,
          transactionId: true,
          paidFrom: true,
          adminNote: true,
          paymentProof: true,
          rejectionReason: true,
        },
      }),
      // Sums, not rows. These used to pull EVERY completed withdrawal and EVERY
      // referral-earning row for the user just to add them up in JS — unbounded,
      // and growing for exactly the users who use the platform most.
      prisma.withdrawal.aggregate({
        where: { userId, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      // The team at the depth and rates the admin set (lib/team.ts) — this
      // used to load every direct referral's id and stop at level 3.
      safeRead(
        getTeamSummary(userId),
        { levels: [], totalCount: 0, totalEarnedUsd: 0, members: [] },
        "wallet team summary"
      ),
      safeRead(
        prisma.deposit.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, amount: true, method: true, status: true, txnId: true, createdAt: true },
        }),
        [],
        "wallet deposits"
      ),
      // Independent of the queries above — batched here to avoid extra serial hops.
      getKycPromptState(userId),
      getPointsPerUsd(),
      getPointsConvertThreshold(),
      prisma.withdrawal.aggregate({
        where: { userId, status: "COMPLETED", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      safeRead(todayRefP, null, "wallet today referral"),
      // Effective withdrawal fee % (admin setting − package discount) so the
      // wallet Withdraw tab can show it too, matching the /withdrawal page.
      getWithdrawalConfig(userId),
    ]);

  if (!user) redirect("/login");

  const totalWithdrawn = toNum(withdrawnAgg._sum.amount ?? 0);

  // Income = money withdrawn. Monthly income = withdrawn this month.
  const monthlyIncome = toNum(monthlyAgg._sum.amount ?? 0);
  // Today's referral bonus (USD) — referral earnings credited since local midnight.
  const todayReferralBonus = toNum(todayRefAgg?._sum.amount ?? 0);

  const stats: ReferralStats = {
    levels: teamSummary.levels,
    totalCount: teamSummary.totalCount,
    totalEarned: teamSummary.totalEarnedUsd,
  };
  // Corrections folded into the rows they correct (lib/ledger-display.ts).
  const ledger30 = ledgerForUser(ledgerRaw);
  const earned = summarizeEarnings(ledger30);
  const earningSources = earned.sources.map((x) => ({
    key: x.source,
    label: x.label,
    color: x.swatch,
    value: x.points,
  }));

  const txList: WalletTransaction[] = ledger30.slice(0, 50).map((tx) => ({
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
        taskCreditPoints={user.taskCreditPoints}
        totalEarnings={Number(user.totalEarnings)}
        totalWithdrawn={totalWithdrawn}
        monthlyIncome={monthlyIncome}
        todayReferralBonus={todayReferralBonus}
        packageTier={user.package?.slug ?? "default"}
        transactions={txList}
        earningSources={earningSources}
        earnPeriods={{ today: earned.today, week: earned.week, month: earned.month }}
        deposits={depositList}
        referralStats={stats}
        pendingWithdrawals={pendingWithdrawalsCount}
        withdrawals={withdrawalRows.map((w) => ({
          ...w,
          amount: Number(w.amount),
          fee: Number(w.fee),
          netAmount: Number(w.netAmount),
        }))}
        pointsPerUsd={pointsPerUsd}
        convertThreshold={convertThreshold}
        withdrawalFeePct={wcfg.feePct}
      />
    </>
  );
}
