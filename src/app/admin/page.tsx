import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, type MoneyInput } from "@/lib/money";
import { isAdmin, type UserRole } from "@/lib/rbac";
import { Users, Activity, DollarSign, GitBranch, Clock, TrendingUp, CalendarDays, ListTodo, ClipboardCheck, Wallet, CheckCircle, Banknote, ArrowDownToLine, Megaphone } from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { UserGrowthChart } from "@/components/admin/user-growth-chart";
import { RevenueTrendChart } from "@/components/admin/revenue-trend-chart";
import { PlatformStats } from "@/components/admin/platform-stats";
import { PendingActions } from "@/components/admin/pending-actions";
import { PlatformOverview } from "@/components/admin/platform-overview";
import { RecentActivityFeed, type ActivityLogEntry } from "@/components/admin/recent-activity-feed";
import { format, startOfDay, subDays, startOfMonth } from "date-fns";

// Auto-revalidate every 30 seconds (matches PROTOTYPE_ADMIN.md §38 spec)
export const revalidate = 30;

// Build the 7-day user-growth dataset (oldest first)
function buildGrowthSeries(
  users: Array<{ createdAt: Date }>,
  days = 7
): Array<{ label: string; count: number }> {
  const today = startOfDay(new Date());
  const series: Array<{ label: string; count: number; date: Date }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(today, i);
    series.push({ label: format(d, "EEE"), count: 0, date: d });
  }
  for (const u of users) {
    const d = startOfDay(u.createdAt).getTime();
    const slot = series.find((s) => s.date.getTime() === d);
    if (slot) slot.count += 1;
  }
  return series.map(({ label, count }) => ({ label, count }));
}

// Build the 30-day revenue dataset (oldest first)
function buildRevenueSeries(
  subs: Array<{ createdAt: Date; amount: MoneyInput }>,
  days = 30
): Array<{ label: string; revenue: number }> {
  const today = startOfDay(new Date());
  const series: Array<{ label: string; revenue: number; date: Date }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(today, i);
    series.push({ label: format(d, "MMM d"), revenue: 0, date: d });
  }
  for (const s of subs) {
    const dayMs = startOfDay(s.createdAt).getTime();
    const slot = series.find((x) => x.date.getTime() === dayMs);
    if (slot) slot.revenue += Number(s.amount ?? 0);
  }
  return series.map(({ label, revenue }) => ({ label, revenue }));
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role as UserRole)) redirect("/dashboard");

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = subDays(todayStart, 7);
  const thirtyDaysAgo = subDays(todayStart, 30);

  const [
    totalUsers,
    newUsersToday,
    realtimeActive5m,
    activeUsers24h,
    last7DaysUsers,

    totalTasks,
    completionsToday,
    completionsMonth,
    pendingApprovalsCount,

    pendingKYC,
    pendingAppeals,
    pendingAccountApprovals,

    pendingWithdrawAgg,
    pendingWithdrawalsCount,
    paidWithdrawalsAgg,
    todayRevenueAgg,
    monthRevenueAgg,
    totalRevenueAgg,
    referralEarningsAgg,

    activeSubscriptions,

    totalListings,
    totalOrders,
    pendingOrders,
    openDisputes,

    totalCourses,
    totalEnrollments,
    verifiedKycCount,

    auditLogs,
    _auditLogActorIds,
    last30DaysRevenue,

    // Finance overview + ops queues (folded into the same batch to avoid waterfalls)
    pendingDepositsAgg,
    approvedDepositsAgg,
    walletLiabilityAgg,
    adCreditOutstandingAgg,
    adSpendAgg,
    pendingOfferwallCount,
    completedWithdrawalsCount,
    referralUsersCount,
    pendingCreatorAppsCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: fiveMinAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: dayAgo } } }),
    prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),

    prisma.task.count(),
    prisma.taskSubmission.count({
      where: { status: "APPROVED", reviewedAt: { gte: todayStart } },
    }),
    prisma.taskSubmission.count({
      where: { status: "APPROVED", reviewedAt: { gte: monthStart } },
    }),
    prisma.taskSubmission.count({ where: { status: "PENDING" } }),

    prisma.kYCDocument.count({ where: { status: "PENDING" } }),
    // Verification appeals don't have their own model yet — leave at 0 until added
    Promise.resolve(0),
    prisma.user.count({ where: { status: "PENDING_VERIFICATION" } }),

    prisma.withdrawal.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
    }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.subscription.aggregate({
      where: { createdAt: { gte: todayStart }, isActive: true },
      _sum: { amount: true },
    }),
    prisma.subscription.aggregate({
      where: { createdAt: { gte: monthStart }, isActive: true },
      _sum: { amount: true },
    }),
    prisma.subscription.aggregate({
      where: { isActive: true },
      _sum: { amount: true },
    }),
    prisma.referralEarning.aggregate({ _sum: { amount: true } }),

    prisma.subscription.count({ where: { isActive: true } }),

    prisma.marketplaceListing.count(),
    prisma.marketplacePurchase.count(),
    prisma.marketplacePurchase.count({ where: { status: "PENDING" } }),
    prisma.marketplaceDispute.count({
      where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } },
    }),

    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.courseEnrollment.count(),
    prisma.user.count({ where: { kycStatus: "APPROVED" } }),

    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Pre-fetch admin user names — done in next step using already-fetched logs
    Promise.resolve([] as string[]),
    prisma.subscription.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, isActive: true },
      select: { createdAt: true, amount: true },
    }),

    // Deposits awaiting review — count + $ liability sitting in the queue.
    prisma.deposit.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    // Approved deposits — lifetime funded volume.
    prisma.deposit.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    // Wallet liability — withdrawable cash the platform owes users right now.
    prisma.user.aggregate({ _sum: { cashBalance: true } }),
    // Ad credit outstanding — non-withdrawable balance advertisers can still spend.
    prisma.user.aggregate({ _sum: { adCreditBalance: true } }),
    // Ad spend — total campaign budgets committed.
    prisma.adCampaign.aggregate({ _sum: { budget: true } }),
    // Offerwall completions awaiting manual review.
    prisma.offerwallCompletion.count({ where: { status: "PENDING" } }),
    // Moved out of the post-batch waterfall.
    prisma.withdrawal.count({ where: { status: "COMPLETED" } }),
    prisma.user.count({ where: { referredById: { not: null } } }),
    // Creator/seller applications awaiting review.
    prisma.creatorApplication.count({ where: { status: "PENDING" } }),
  ]);

  // Resolve admin/user names for the audit log entries
  const actorIds = Array.from(
    new Set(auditLogs.map((l) => l.userId).filter((v): v is string => !!v))
  );
  const actorMap = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, username: true },
      })
    : [];
  const actorById = new Map(actorMap.map((a) => [a.id, a]));

  const recentEntries: ActivityLogEntry[] = auditLogs.map((log) => {
    const actor = log.userId ? actorById.get(log.userId) : null;
    let detailsString: string | null = null;
    if (log.newData && typeof log.newData === "object") {
      try {
        detailsString = JSON.stringify(log.newData);
        if (detailsString.length > 120)
          detailsString = detailsString.slice(0, 120) + "…";
      } catch {
        detailsString = null;
      }
    }
    return {
      id: log.id,
      action: log.action,
      entity: log.entity,
      adminName:
        actor?.username ?? actor?.name ?? actor?.email ?? null,
      details: detailsString,
      createdAt: log.createdAt,
    };
  });

  // Derive numbers — every money `_sum` MUST route through toNum(): a Prisma
  // Decimal's .toLocaleString(opts) silently ignores the options and drops
  // thousands-separators + 2dp formatting, so format a plain number instead.
  const pendingPayoutsAmount = toNum(pendingWithdrawAgg._sum.amount);
  const totalPaid = toNum(paidWithdrawalsAgg._sum.amount);
  const todayRevenue = toNum(todayRevenueAgg._sum.amount);
  const monthRevenue = toNum(monthRevenueAgg._sum.amount);
  const totalRevenue = toNum(totalRevenueAgg._sum.amount);
  const totalReferralEarnings = toNum(referralEarningsAgg._sum.amount);

  // Finance overview
  const pendingDepositsAmount = toNum(pendingDepositsAgg._sum.amount);
  const pendingDepositsCount = pendingDepositsAgg._count;
  const approvedDepositsAmount = toNum(approvedDepositsAgg._sum.amount);
  const walletLiability = toNum(walletLiabilityAgg._sum.cashBalance);
  const adCreditOutstanding = toNum(adCreditOutstandingAgg._sum.adCreditBalance);
  const adSpend = toNum(adSpendAgg._sum.budget);

  // activeSubscriptions captured above for future surfacing — no use today.
  void activeSubscriptions;

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Platform Stats — % rates (capped 0–100)
  const totalSubmissionsAttempted =
    completionsMonth + pendingApprovalsCount;
  const taskCompletionRate =
    totalSubmissionsAttempted > 0
      ? (completionsMonth / totalSubmissionsAttempted) * 100
      : 0;
  const totalWithdrawalRequests =
    pendingWithdrawalsCount + completedWithdrawalsCount;
  const withdrawalSuccessRate =
    totalWithdrawalRequests > 0
      ? ((totalWithdrawalRequests - pendingWithdrawalsCount) /
          totalWithdrawalRequests) *
        100
      : 0;
  const referralConvRate =
    totalUsers > 0 ? (referralUsersCount / totalUsers) * 100 : 0;
  const subsRate =
    totalUsers > 0 ? (activeSubscriptions / totalUsers) * 100 : 0;
  const kycVerifiedRate =
    totalUsers > 0 ? (verifiedKycCount / totalUsers) * 100 : 0;

  const growthSeries = buildGrowthSeries(last7DaysUsers);
  const revenueSeries = buildRevenueSeries(last30DaysRevenue);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Stats row 1 — 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Total Users"
          value={totalUsers}
          subtext={`+${newUsersToday} today`}
          icon={Users}
          tone="blue"
          href="/admin/users"
        />
        <StatCard
          title="Realtime Active"
          value={realtimeActive5m}
          subtext={`${activeUsers24h} in 24h`}
          icon={Activity}
          tone="purple"
          href="/admin/users"
        />
        <StatCard
          title="Subscription Revenue"
          value={money(monthRevenue)}
          subtext="this month"
          icon={DollarSign}
          tone="green"
          href="/admin/packages"
        />
        <StatCard
          title="Referral Earnings"
          value={money(totalReferralEarnings)}
          subtext="total paid out"
          icon={GitBranch}
          tone="indigo"
          href="/admin/referrals"
        />
        <StatCard
          title="Pending Payouts"
          value={money(pendingPayoutsAmount)}
          subtext={`${pendingWithdrawalsCount} awaiting`}
          icon={Clock}
          tone="orange"
          href="/admin/withdrawals"
        />
      </div>

      {/* Stats row 2 — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Revenue"
          value={money(totalRevenue)}
          subtext="all time"
          icon={TrendingUp}
          tone="green"
          href="/admin/analytics"
        />
        <StatCard
          title="Today Revenue"
          value={money(todayRevenue)}
          subtext={format(now, "MMM d, yyyy")}
          icon={CalendarDays}
          tone="blue"
        />
        <StatCard
          title="Pending Withdrawals"
          value={pendingWithdrawalsCount}
          subtext={`${money(pendingPayoutsAmount)} total`}
          icon={Wallet}
          tone="amber"
          href="/admin/withdrawals"
        />
        <StatCard
          title="Total Paid"
          value={money(totalPaid)}
          subtext="since launch"
          icon={CheckCircle}
          tone="purple"
          href="/admin/withdrawals?status=COMPLETED"
        />
      </div>

      {/* Finance overview — deposits, liabilities & ad economy */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
          Finance Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="Pending Deposits"
            value={money(pendingDepositsAmount)}
            subtext={`${pendingDepositsCount} awaiting review`}
            icon={Banknote}
            tone="orange"
            href="/admin/deposits"
          />
          <StatCard
            title="Deposits Funded"
            value={money(approvedDepositsAmount)}
            subtext="approved, all time"
            icon={ArrowDownToLine}
            tone="green"
            href="/admin/deposits?status=APPROVED"
          />
          <StatCard
            title="Wallet Liability"
            value={money(walletLiability)}
            subtext="withdrawable cash owed"
            icon={Wallet}
            tone="blue"
            href="/admin/withdrawals"
          />
          <StatCard
            title="Ad Credit Outstanding"
            value={money(adCreditOutstanding)}
            subtext="non-withdrawable"
            icon={Megaphone}
            tone="indigo"
            href="/admin/ads"
          />
          <StatCard
            title="Ad Spend"
            value={money(adSpend)}
            subtext="campaign budgets"
            icon={TrendingUp}
            tone="purple"
            href="/admin/ads"
          />
        </div>
      </div>

      {/* Charts row 1 — User growth (2/3) + Platform stats (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <UserGrowthChart data={growthSeries} />
        </div>
        <div>
          <PlatformStats
            bars={[
              { label: "Task Completion", percent: taskCompletionRate, tone: "blue" },
              { label: "Withdrawal Success", percent: withdrawalSuccessRate, tone: "green" },
              { label: "Referral Conv.", percent: referralConvRate, tone: "purple" },
              { label: "Subscriptions", percent: subsRate, tone: "amber" },
              { label: "KYC Verified", percent: kycVerifiedRate, tone: "pink" },
            ]}
          />
        </div>
      </div>

      {/* Charts row 2 — 30-day revenue trend */}
      <RevenueTrendChart data={revenueSeries} />


      {/* Detailed stats — Task Performance + Platform Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Task Performance — 2x2 grid of stats */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-blue-400" />
            Task Performance
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-2xl font-bold text-white tabular-nums">
                {completionsToday.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                Today&apos;s Completions
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-2xl font-bold text-white tabular-nums">
                {completionsMonth.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                Monthly Completions
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-2xl font-bold text-white tabular-nums">
                {totalTasks.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                Total Tasks
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-2xl font-bold text-white tabular-nums flex items-center gap-2">
                {pendingApprovalsCount.toLocaleString()}
                {pendingApprovalsCount > 0 && (
                  <ClipboardCheck className="w-4 h-4 text-amber-400" />
                )}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                Approval Queue
              </p>
            </div>
          </div>
        </div>

        <PlatformOverview
          marketplace={{
            listings: totalListings,
            orders: totalOrders,
            pending: pendingOrders,
          }}
          courses={{ active: totalCourses, enrollments: totalEnrollments }}
          financials={{ totalWithdrawn: totalPaid }}
        />
      </div>

      {/* Pending Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PendingActions
          pendingKYC={pendingKYC}
          pendingApprovals={pendingAccountApprovals}
          pendingWithdrawals={pendingWithdrawalsCount}
          pendingDeposits={pendingDepositsCount}
          pendingOfferwall={pendingOfferwallCount}
          pendingCreatorApps={pendingCreatorAppsCount}
          pendingAppeals={pendingAppeals}
          openDisputes={openDisputes}
        />
        <RecentActivityFeed entries={recentEntries} />
      </div>
    </div>
  );
}
