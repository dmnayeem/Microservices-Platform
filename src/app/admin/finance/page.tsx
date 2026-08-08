import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getPointsPerUsd } from "@/lib/economy";
import { StatCard } from "@/components/admin/stat-card";
import {
  Landmark,
  Banknote,
  ArrowDownToLine,
  Wallet,
  Coins,
  Megaphone,
  TrendingUp,
  CreditCard,
  GraduationCap,
  ShoppingCart,
  GitBranch,
  ArrowRightLeft,
  ClipboardList,
  Download,
} from "lucide-react";
import Link from "next/link";
import { startOfMonth } from "date-fns";

export const revalidate = 60;

// Human labels + tone for each TransactionType row in the ledger breakdown.
const TX_META: Record<string, { label: string; kind: "in" | "out" | "neutral" }> = {
  EARNING: { label: "Task / seller earnings", kind: "out" },
  WITHDRAWAL: { label: "Withdrawals", kind: "out" },
  BONUS: { label: "Bonuses", kind: "out" },
  REFERRAL: { label: "Referral commission", kind: "out" },
  PURCHASE: { label: "Purchases (marketplace / subs)", kind: "in" },
  REFUND: { label: "Refunds", kind: "neutral" },
  PENALTY: { label: "Penalties", kind: "in" },
  GIFT: { label: "Gifts", kind: "out" },
  LOTTERY_WIN: { label: "Lottery wins", kind: "out" },
  CHECKIN: { label: "Check-ins", kind: "out" },
  COURSE_PURCHASE: { label: "Course purchases", kind: "in" },
  COURSE_TUTOR_EARNING: { label: "Tutor earnings", kind: "out" },
  COURSE_REFUND: { label: "Course refunds", kind: "neutral" },
  DEPOSIT: { label: "Deposits", kind: "in" },
  AFFILIATE_COMMISSION: { label: "Affiliate commission", kind: "out" },
  ADMIN_FEE: { label: "Platform fees", kind: "in" },
  AD_CREDIT_PURCHASE: { label: "Ad credit purchases", kind: "in" },
  POINTS_CONVERSION: { label: "Points → cash conversions", kind: "neutral" },
};

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type GroupRow = {
  type: string;
  _sum: { amount: unknown; points: number | null };
  _count: number;
};

export default async function AdminFinancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "finance.view"))) redirect("/admin");

  const monthStart = startOfMonth(new Date());

  const [
    txAll,
    txMonth,
    subAll,
    subMonth,
    depositsPending,
    depositsApproved,
    userSums,
    adSpend,
    withdrawPending,
    withdrawPaid,
    offerwallPending,
    disputesOpen,
    pointsPerUsd,
  ] = await Promise.all([
    // All money movement bucketed by ledger type — the full "hisab kitab".
    prisma.transaction.groupBy({
      by: ["type"],
      where: { status: "COMPLETED" },
      _sum: { amount: true, points: true },
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { status: "COMPLETED", createdAt: { gte: monthStart } },
      _sum: { amount: true, points: true },
      _count: true,
    }),
    prisma.subscription.aggregate({ where: { isActive: true }, _sum: { amount: true } }),
    prisma.subscription.aggregate({
      where: { isActive: true, createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.deposit.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.deposit.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.user.aggregate({
      _sum: { cashBalance: true, pointsBalance: true, adCreditBalance: true },
    }),
    prisma.adCampaign.aggregate({ _sum: { budget: true } }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawal.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.offerwallCompletion.count({ where: { status: "PENDING" } }),
    prisma.marketplaceDispute.count({
      where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } },
    }),
    getPointsPerUsd(),
  ]);

  // Index the month buckets by type for the ledger table.
  const monthByType = new Map(
    (txMonth as GroupRow[]).map((r) => [r.type, r])
  );

  // Clean top-line finance figures.
  const subscriptionRevenue = toNum(subAll._sum.amount);
  const subscriptionMonth = toNum(subMonth._sum.amount);
  const depositsFunded = toNum(depositsApproved._sum.amount);
  const depositsPendingAmt = toNum(depositsPending._sum.amount);
  const walletLiability = toNum(userSums._sum.cashBalance);
  const pointsLiability = (userSums._sum.pointsBalance ?? 0) / pointsPerUsd;
  const adCreditOutstanding = toNum(userSums._sum.adCreditBalance);
  const adSpendTotal = toNum(adSpend._sum.budget);
  const pendingPayouts = toNum(withdrawPending._sum.amount);
  const totalPaid = toNum(withdrawPaid._sum.amount);

  // Ledger rows sorted by absolute all-time volume.
  const ledger = (txAll as GroupRow[])
    .map((r) => {
      const meta = TX_META[r.type] ?? { label: r.type, kind: "neutral" as const };
      const m = monthByType.get(r.type);
      return {
        type: r.type,
        label: meta.label,
        kind: meta.kind,
        allAmount: toNum(r._sum.amount),
        allPoints: r._sum.points ?? 0,
        allCount: r._count,
        monthAmount: toNum(m?._sum.amount),
        monthCount: m?._count ?? 0,
      };
    })
    .sort((a, b) => Math.abs(b.allAmount) - Math.abs(a.allAmount));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Landmark className="w-6 h-6 text-emerald-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Finance Hub</h1>
          <p className="text-sm text-slate-400">
            Every money flow on the platform — income, payouts, liabilities and reports.
          </p>
        </div>
      </div>

      {/* Revenue (money in) */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
          Revenue
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard
            title="Subscription Revenue"
            value={money(subscriptionRevenue)}
            subtext={`${money(subscriptionMonth)} this month`}
            icon={CreditCard}
            tone="green"
            href="/admin/packages"
          />
          <StatCard
            title="Deposits Funded"
            value={money(depositsFunded)}
            subtext="approved, all time"
            icon={ArrowDownToLine}
            tone="green"
            href="/admin/deposits?status=APPROVED"
          />
          <StatCard
            title="Ad Spend"
            value={money(adSpendTotal)}
            subtext="campaign budgets"
            icon={Megaphone}
            tone="indigo"
            href="/admin/ads"
          />
          <StatCard
            title="Ad Credit Outstanding"
            value={money(adCreditOutstanding)}
            subtext="advertiser balances"
            icon={Coins}
            tone="purple"
            href="/admin/ads"
          />
        </div>
      </section>

      {/* Liabilities & payouts (money out / owed) */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
          Liabilities & Payouts
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="Wallet Liability"
            value={money(walletLiability)}
            subtext="withdrawable cash owed"
            icon={Wallet}
            tone="blue"
          />
          <StatCard
            title="Points Liability"
            value={money(pointsLiability)}
            subtext="points value (pre-convert)"
            icon={Coins}
            tone="amber"
          />
          <StatCard
            title="Pending Payouts"
            value={money(pendingPayouts)}
            subtext={`${withdrawPending._count} awaiting`}
            icon={ArrowRightLeft}
            tone="orange"
            href="/admin/withdrawals"
          />
          <StatCard
            title="Total Paid Out"
            value={money(totalPaid)}
            subtext="withdrawals completed"
            icon={TrendingUp}
            tone="green"
            href="/admin/withdrawals?status=COMPLETED"
          />
          <StatCard
            title="Pending Deposits"
            value={money(depositsPendingAmt)}
            subtext={`${depositsPending._count} to review`}
            icon={Banknote}
            tone="amber"
            href="/admin/deposits"
          />
        </div>
      </section>

      {/* Ledger by transaction type — the full transactional breakdown */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Ledger by type</h2>
          <span className="text-xs text-slate-500">completed transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 px-4 font-semibold text-right">This month ($)</th>
                <th className="py-2 px-4 font-semibold text-right">All time ($)</th>
                <th className="py-2 px-4 font-semibold text-right">Points (all time)</th>
                <th className="py-2 pl-4 font-semibold text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {ledger.map((r) => (
                <tr key={r.type} className="text-slate-300">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-white">{r.label}</span>
                    <span
                      className={
                        "ml-2 text-[10px] uppercase tracking-wide " +
                        (r.kind === "in"
                          ? "text-emerald-400"
                          : r.kind === "out"
                            ? "text-orange-400"
                            : "text-slate-500")
                      }
                    >
                      {r.kind === "in" ? "in" : r.kind === "out" ? "out" : "—"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">
                    {money(Math.abs(r.monthAmount))}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">
                    {money(Math.abs(r.allAmount))}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-slate-400">
                    {r.allPoints.toLocaleString()}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-slate-400">
                    {r.allCount.toLocaleString()}
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No completed transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Queues + reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Queues</h2>
          <div className="space-y-1">
            {[
              { label: "Deposits to review", count: depositsPending._count, href: "/admin/deposits", icon: Banknote },
              { label: "Withdrawals pending", count: withdrawPending._count, href: "/admin/withdrawals", icon: Wallet },
              { label: "Offerwall completions", count: offerwallPending, href: "/admin/offerwalls", icon: ClipboardList },
              { label: "Marketplace disputes", count: disputesOpen, href: "/admin/marketplace?tab=disputes", icon: ShoppingCart },
            ].map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group"
              >
                <q.icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="flex-1 text-sm text-slate-300 group-hover:text-white">{q.label}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-slate-800 text-slate-300">
                  {q.count.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Reports & drilldowns</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet },
              { label: "Deposits", href: "/admin/deposits", icon: Banknote },
              { label: "Deposits CSV", href: "/api/admin/deposits/export?status=all", icon: Download },
              { label: "Packages", href: "/admin/packages", icon: CreditCard },
              { label: "Referrals", href: "/admin/referrals", icon: GitBranch },
              { label: "Courses", href: "/admin/courses", icon: GraduationCap },
              { label: "Marketplace", href: "/admin/marketplace", icon: ShoppingCart },
              { label: "Ad Manager", href: "/admin/ads", icon: Megaphone },
            ].map((r) => (
              <Link
                key={r.label}
                href={r.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-600 text-sm text-slate-300 hover:text-white"
              >
                <r.icon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className="truncate">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
