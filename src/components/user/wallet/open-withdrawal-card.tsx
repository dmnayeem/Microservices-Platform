import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { prisma, safeRead } from "@/lib/prisma";
import { usd } from "@/lib/utils";
import { getWithdrawalConfig } from "@/lib/withdrawal";
import { WithdrawalTracker } from "@/components/user/wallet/withdrawal-tracker";

/**
 * Dashboard: the user's newest withdrawal that is still on its way, with the
 * step tracker — so "where is my money" is answered where they land, not only
 * on the withdrawal page. Renders nothing when nothing is open.
 */
export async function OpenWithdrawalCard({ userId }: { userId: string }) {
  const [w, cfg] = await Promise.all([
    safeRead(
      prisma.withdrawal.findFirst({
        where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, method: true, status: true, createdAt: true, reviewedAt: true, processedAt: true, netAmount: true },
      }),
      null,
      "dashboard open withdrawal"
    ),
    getWithdrawalConfig(userId).catch(() => null),
  ]);
  if (!w) return null;
  return (
    <section className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <Wallet className="h-4 w-4 text-emerald-400" />
          Your withdrawal of <span className="tabular-nums">{usd(Number(w.netAmount))}</span>
        </p>
        <Link href="/withdrawal#history" className="inline-flex items-center gap-1 text-xs font-semibold text-(--app-accent-ink) hover:underline">
          Details <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <WithdrawalTracker w={w} payoutMessage={cfg?.payoutMessage} />
    </section>
  );
}
