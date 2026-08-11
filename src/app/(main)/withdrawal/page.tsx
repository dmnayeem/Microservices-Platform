import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithdrawalView } from "@/components/user/wallet/withdrawal-view";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getPointsPerUsd } from "@/lib/economy";
import { getWithdrawalConfig } from "@/lib/withdrawal";

export default async function WithdrawalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, methods, toggles, pointsPerUsd, wcfg] = await Promise.all([
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
  ]);

  return (
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
  );
}
