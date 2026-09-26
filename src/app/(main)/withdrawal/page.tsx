import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithdrawalView } from "@/components/user/wallet/withdrawal-view";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getPointsPerUsd } from "@/lib/economy";
import { getWithdrawalConfig } from "@/lib/withdrawal";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { MyWithdrawals } from "@/components/user/wallet/my-withdrawals";

export default async function WithdrawalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const gate = await getProfileGateState(session.user.id, "withdrawals");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="withdrawals" />;

  const [user, methods, toggles, pointsPerUsd, wcfg, mine] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        cashBalance: true,
        pointsBalance: true,
        kycStatus: true,
      },
    }),
    prisma.userPaymentMethod.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    getUiToggles(),
    getPointsPerUsd(),
    // Admin-configured limits + fee (Financial settings ∪ the user's package).
    getWithdrawalConfig(session.user.id),
    prisma.withdrawal.findMany({
      where: { userId: session.user.id },
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
  ]);

  return (
    <>
      {/* Longest-dwell page on the platform by measured traffic. */}
      <AdRenderer placement="WITHDRAW_TOP" className="mb-4" />
      <WithdrawalView
      cashBalance={Number(user?.cashBalance ?? 0)}
      pointsBalance={user?.pointsBalance ?? 0}
      min={wcfg.min}
      max={wcfg.max}
      feePct={wcfg.feePct}
      withdrawalsEnabled={wcfg.enabled}
      subscriptionRequired={wcfg.subscriptionRequired}
      payoutMessage={wcfg.payoutMessage}
      kycStatus={user?.kycStatus ?? "NOT_SUBMITTED"}
      requireKyc={toggles.requireKycForWithdrawal}
      pointsPerUsd={pointsPerUsd}
      methods={methods.map((m) => ({
        id: m.id,
        type: m.method,
        label: m.accountName ?? `${m.method} · ${m.accountNumber}`,
        isDefault: m.isDefault,
      }))}
      />
      <MyWithdrawals
        items={mine.map((w) => ({
          ...w,
          amount: Number(w.amount),
          fee: Number(w.fee),
          netAmount: Number(w.netAmount),
        }))}
      />
    </>
  );
}
