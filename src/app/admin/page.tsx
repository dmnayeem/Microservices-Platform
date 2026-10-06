import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { USER_HOME } from "@/lib/routes";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
import { LISTED_TASK_WHERE } from "@/lib/task-audit";
import { toNum, type MoneyInput } from "@/lib/money";
import { isAdmin, type UserRole } from "@/lib/rbac";
import { Users, Activity, DollarSign, GitBranch, Clock, TrendingUp, CalendarDays, ListTodo, ClipboardCheck, Wallet, CheckCircle, Banknote, ArrowDownToLine, Megaphone } from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { UserGrowthChart } from "@/components/admin/user-growth-chart";
import { RevenueTrendChart } from "@/components/admin/revenue-trend-chart";
import { PlatformStats } from "@/components/admin/platform-stats";
import { PendingRequestsHub } from "@/components/admin/pending-requests-hub";
import { PlatformOverview } from "@/components/admin/platform-overview";
import { RecentActivityFeed, type ActivityLogEntry } from "@/components/admin/recent-activity-feed";
import { getEffectivePermissions } from "@/lib/permissions";
import { getPendingSources } from "@/lib/admin/pending-counts";
import { format, startOfDay, subDays, startOfMonth } from "date-fns";
import { AWAITING_REVIEW_WHERE, completedBetween } from "@/lib/submission-status";
import { getFinanceTestUserIds, withoutUsers } from "@/lib/finance/test-users";

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
  if (!isAdmin(session.user.role as UserRole)) redirect(USER_HOME);

  // Every pending request/application this admin may review, with live counts —
  // feeds the "Pending Requests" hub below (permission-scoped, fail-safe).
  const perms = await getEffectivePermissions(session.user.id);
  // The company's money is shown to finance only. This page used to put
  // revenue, deposits, withdrawals and the wallet liability in front of every
  // admin role — a moderator saw the platform's lifetime revenue on login. The
  // rule is super admin + finance admin + anyone a super admin has granted
  // `finance.view`; `getEffectivePermissions` already applies exactly that.
  // Hidden figures are not rendered at all, so they never reach the browser.
  const seesMoney = perms.has("finance.view");
  const pendingSources = await getPendingSources(perms);
  // Money cards leave out finance test users, like /admin/finance does. People
  // and queue counts below do not — those are operational, not the books.
  const testIds = await getFinanceTestUserIds();
  const noTest = <W extends object>(w: NoInfer<W>, field = "userId", nullable = false): W =>
    withoutUsers<W>(w, testIds, field, { nullable });

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = subDays(todayStart, 7);
  const thirtyDaysAgo = subDays(todayStart, 30);

  // Every read below is a display figure, so each one degrades on its own
  // (safeRead → 0 / empty) instead of one failed query taking the whole admin
  // dashboard to the error screen. The failure is logged and counted.
  // `as never` lets one empty aggregate stand in for every aggregate's shape:
  // the `_sum` fields read undefined → toNum() → 0, `_count` reads 0.
  const EMPTY_AGG = { _sum: {}, _count: 0 } as never;

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
    completedWithdrawalsCount,
    referralUsersCount,
  ] = await Promise.all([
    safeRead(prisma.user.count(), 0, "admin dashboard #0"),
    safeRead(prisma.user.count({ where: { createdAt: { gte: todayStart } } }), 0, "admin dashboard #1"),
    safeRead(prisma.user.count({ where: { lastLoginAt: { gte: fiveMinAgo } } }), 0, "admin dashboard #2"),
    safeRead(prisma.user.count({ where: { lastLoginAt: { gte: dayAgo } } }), 0, "admin dashboard #3"),
    safeRead(prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }), [], "admin dashboard #4"),

    safeRead(prisma.task.count({ where: LISTED_TASK_WHERE }), 0, "admin dashboard #5"),
    // Auto-approved completions are the majority here and were being left
    // out; see lib/submission-status.ts.
    safeRead(prisma.taskSubmission.count({ where: completedBetween(todayStart) }), 0, "admin dashboard #6"),
    safeRead(prisma.taskSubmission.count({ where: completedBetween(monthStart) }), 0, "admin dashboard #7"),
    safeRead(prisma.taskSubmission.count({ where: AWAITING_REVIEW_WHERE }), 0, "admin dashboard #8"),


    safeRead(prisma.withdrawal.aggregate({
      where: noTest({ status: "PENDING" }),
      _sum: { amount: true },
    }), EMPTY_AGG, "admin dashboard #9"),
    safeRead(prisma.withdrawal.count({ where: { status: "PENDING" } }), 0, "admin dashboard #10"),
    safeRead(prisma.withdrawal.aggregate({
      where: noTest({ status: "COMPLETED" }),
      _sum: { amount: true },
    }), EMPTY_AGG, "admin dashboard #11"),
    safeRead(prisma.subscription.aggregate({
      where: noTest({ createdAt: { gte: todayStart }, isActive: true }),
      _sum: { amount: true },
    }), EMPTY_AGG, "admin dashboard #12"),
    safeRead(prisma.subscription.aggregate({
      where: noTest({ createdAt: { gte: monthStart }, isActive: true }),
      _sum: { amount: true },
    }), EMPTY_AGG, "admin dashboard #13"),
    safeRead(prisma.subscription.aggregate({
      where: noTest({ isActive: true }),
      _sum: { amount: true },
    }), EMPTY_AGG, "admin dashboard #14"),
    safeRead(prisma.referralEarning.aggregate({ where: noTest({}), _sum: { amount: true } }), EMPTY_AGG, "admin dashboard #15"),

    safeRead(prisma.subscription.count({ where: { isActive: true } }), 0, "admin dashboard #16"),

    safeRead(prisma.marketplaceListing.count(), 0, "admin dashboard #17"),
    safeRead(prisma.marketplacePurchase.count(), 0, "admin dashboard #18"),
    safeRead(prisma.marketplacePurchase.count({ where: { status: "PENDING" } }), 0, "admin dashboard #19"),

    safeRead(prisma.course.count({ where: { status: "PUBLISHED" } }), 0, "admin dashboard #20"),
    safeRead(prisma.courseEnrollment.count(), 0, "admin dashboard #21"),
    safeRead(prisma.user.count({ where: { kycStatus: "APPROVED" } }), 0, "admin dashboard #22"),

    safeRead(prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }), [], "admin dashboard #23"),
    // Pre-fetch admin user names — done in next step using already-fetched logs
    Promise.resolve([] as string[]),
    safeRead(prisma.subscription.findMany({
      where: noTest({ createdAt: { gte: thirtyDaysAgo }, isActive: true }),
      select: { createdAt: true, amount: true },
    }), [], "admin dashboard #25"),

    // Deposits awaiting review — count + $ liability sitting in the queue.
    safeRead(prisma.deposit.aggregate({ where: noTest({ status: "PENDING" }), _sum: { amount: true }, _count: true }), EMPTY_AGG, "admin dashboard #26"),
    // Approved deposits — lifetime funded volume.
    safeRead(prisma.deposit.aggregate({ where: noTest({ status: "APPROVED" }), _sum: { amount: true } }), EMPTY_AGG, "admin dashboard #27"),
    // Wallet liability — withdrawable cash the platform owes users right now.
    safeRead(prisma.user.aggregate({ where: noTest({}, "id"), _sum: { cashBalance: true } }), EMPTY_AGG, "admin dashboard #28"),
    // Ad credit outstanding — non-withdrawable balance advertisers can still spend.
    safeRead(prisma.user.aggregate({ where: noTest({}, "id"), _sum: { adCreditBalance: true } }), EMPTY_AGG, "admin dashboard #29"),
    // Ad REVENUE — what advertisers have actually been billed.
    //
    // This summed `budget` and called it "Ad Spend": money COMMITTED, not money
    // earned. It counted budget still sitting unspent in live campaigns, and it
    // counted house campaigns, which bill nothing by design. The same figure was
    // wrong on the finance page until it was corrected there; the correction
    // never reached this card. `where`/`_sum` deliberately match
    // `src/lib/finance/revenue.ts`, so the two screens report one number.
    safeRead(prisma.adCampaign.aggregate({
      where: noTest({ isHouse: false }, "advertiserId", true),
      _sum: { spentTotal: true, budget: true },
    }), EMPTY_AGG, "admin dashboard #30"),
    // Moved out of the post-batch waterfall.
    safeRead(prisma.withdrawal.count({ where: { status: "COMPLETED" } }), 0, "admin dashboard #31"),
    safeRead(prisma.user.count({ where: { referredById: { not: null } } }), 0, "admin dashboard #32"),
  ]);

  // Resolve admin/user names for the audit log entries
  const actorIds = Array.from(
    new Set(auditLogs.map((l) => l.userId).filter((v): v is string => !!v))
  );
  const actorMap = actorIds.length
    ? await safeRead(
        prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, username: true },
        }),
        [],
        "admin dashboard audit actors"
      )
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
  const adRevenueTotal = toNum(adSpendAgg._sum.spentTotal);
  // What advertisers have put in but not yet used. A liability, not income —
  // which is exactly why it must not be added to the revenue figure above.
  const adBudgetUnspent = Math.max(
    0,
    toNum(adSpendAgg._sum.budget) - adRevenueTotal
  );

  // activeSubscriptions captured above for future surfacing — no use today.
  void activeSubscriptions;


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

  // Task economy — shown to every staff member who can open the dashboard.
  // The owner's rule: managers and admins see TASK-related points and income;
  // the company's cash (revenue, deposits, withdrawals, wallets) is finance.
  const [taskPtsToday, taskPts30d, taskFee30d] = (await Promise.all([
    safeRead(prisma.taskSubmission.aggregate({ where: completedBetween(todayStart), _sum: { pointsEarned: true } }), EMPTY_AGG, "admin dashboard task economy #0"),
    safeRead(prisma.taskSubmission.aggregate({ where: completedBetween(thirtyDaysAgo), _sum: { pointsEarned: true } }), EMPTY_AGG, "admin dashboard task economy #1"),
    // The platform's commission when a buyer funds a task (ADMIN_FEE,
    // `task_fee_` reference — see src/lib/tx-sources.ts). Written negative on
    // the buyer's ledger, so its magnitude is the income.
    safeRead(prisma.transaction.aggregate({
      where: noTest({ type: "ADMIN_FEE", reference: { startsWith: "task_fee_" }, createdAt: { gte: thirtyDaysAgo } }),
      _sum: { amount: true },
      _count: true,
    }), EMPTY_AGG, "admin dashboard task economy #2"),
  ])) as unknown as [
    { _sum: { pointsEarned: number | null } },
    { _sum: { pointsEarned: number | null } },
    { _sum: { amount: MoneyInput | null }; _count: number },
  ];

  const growthSeries = buildGrowthSeries(last7DaysUsers);
  const revenueSeries = buildRevenueSeries(last30DaysRevenue);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Stats row 1 — people for everyone, money for finance */}
      <div
        className={
          seesMoney
            ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
            : "grid grid-cols-2 gap-3"
        }
      >
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
        {seesMoney && (<>
        <StatCard
          title="Subscription Revenue"
          value={usd(monthRevenue)}
          subtext="this month"
          icon={DollarSign}
          tone="green"
          href="/admin/packages"
        />
        <StatCard
          title="Referral Earnings"
          value={usd(totalReferralEarnings)}
          subtext="total paid out"
          icon={GitBranch}
          tone="indigo"
          href="/admin/referrals"
        />
        <StatCard
          title="Pending Payouts"
          value={usd(pendingPayoutsAmount)}
          subtext={`${pendingWithdrawalsCount} awaiting`}
          icon={Clock}
          tone="orange"
          href="/admin/withdrawals"
        />
        </>)}
      </div>

      {/* Task economy — for everyone with the dashboard. */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-white">Task economy</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Task points paid today"
            value={(taskPtsToday._sum.pointsEarned ?? 0).toLocaleString()}
            subtext={`${completionsToday} tasks completed`}
            icon={ListTodo}
            tone="green"
            href="/admin/submissions"
          />
          <StatCard
            title="Task points paid (30 days)"
            value={(taskPts30d._sum.pointsEarned ?? 0).toLocaleString()}
            subtext="approved + auto-approved"
            icon={CheckCircle}
            tone="blue"
            href="/admin/tasks"
          />
          <StatCard
            title="Task commission (30 days)"
            value={usd(Math.abs(toNum(taskFee30d._sum.amount)))}
            subtext={`${taskFee30d._count} buyer-funded task${taskFee30d._count === 1 ? "" : "s"}`}
            icon={TrendingUp}
            tone="purple"
            href="/admin/buyers"
          />
          <StatCard
            title="Tasks this month"
            value={completionsMonth.toLocaleString()}
            subtext="completed"
            icon={ClipboardCheck}
            tone="orange"
            href="/admin/tasks"
          />
        </div>
      </div>

      {/* Stats row 2 — money only */}
      {seesMoney && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Revenue"
          value={usd(totalRevenue)}
          subtext="all time"
          icon={TrendingUp}
          tone="green"
          href="/admin/analytics"
        />
        <StatCard
          title="Today Revenue"
          value={usd(todayRevenue)}
          subtext={format(now, "MMM d, yyyy")}
          icon={CalendarDays}
          tone="blue"
        />
        <StatCard
          title="Pending Withdrawals"
          value={pendingWithdrawalsCount}
          subtext={`${usd(pendingPayoutsAmount)} total`}
          icon={Wallet}
          tone="amber"
          href="/admin/withdrawals"
        />
        <StatCard
          title="Total Paid"
          value={usd(totalPaid)}
          subtext="since launch"
          icon={CheckCircle}
          tone="purple"
          href="/admin/withdrawals?status=COMPLETED"
        />
      </div>
      )}

      {/* Pending requests hub — all reviewable applications/submissions at a glance */}
      <PendingRequestsHub sources={pendingSources} />

      {/* Finance overview — deposits, liabilities & ad economy. Finance only. */}
      {seesMoney && (
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
          Finance Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="Pending Deposits"
            value={usd(pendingDepositsAmount)}
            subtext={`${pendingDepositsCount} awaiting review`}
            icon={Banknote}
            tone="orange"
            href="/admin/deposits"
          />
          <StatCard
            title="Deposits Funded"
            value={usd(approvedDepositsAmount)}
            subtext="approved, all time"
            icon={ArrowDownToLine}
            tone="green"
            href="/admin/deposits?status=APPROVED"
          />
          <StatCard
            title="Wallet Liability"
            value={usd(walletLiability)}
            subtext="withdrawable cash owed"
            icon={Wallet}
            tone="blue"
            href="/admin/withdrawals"
          />
          <StatCard
            title="Ad Credit Outstanding"
            value={usd(adCreditOutstanding)}
            subtext="non-withdrawable"
            icon={Megaphone}
            tone="indigo"
            href="/admin/ads"
          />
          <StatCard
            title="Ad Revenue"
            value={usd(adRevenueTotal)}
            subtext="billed to advertisers"
            icon={TrendingUp}
            tone="purple"
            href="/admin/ads"
          />
          <StatCard
            title="Ad Budget Unspent"
            value={usd(adBudgetUnspent)}
            subtext="funded, not yet delivered"
            icon={Megaphone}
            tone="amber"
            href="/admin/ads"
          />
        </div>
      </div>
      )}

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

      {/* Charts row 2 — 30-day revenue trend. Finance only. */}
      {seesMoney && <RevenueTrendChart data={revenueSeries} />}


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

      {/* Recent Activity (pending requests now live in the hub above) */}
      <RecentActivityFeed entries={recentEntries} />
    </div>
  );
}
