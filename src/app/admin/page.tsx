import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { USER_HOME } from "@/lib/routes";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { LISTED_TASK_WHERE } from "@/lib/task-audit";
import { toNum, type MoneyInput } from "@/lib/money";
import { isAdmin, type UserRole } from "@/lib/rbac";
import { STAFF_ROLES } from "@/lib/staff";
import {
  Users, DollarSign, GitBranch, TrendingUp, CalendarDays, ListTodo, ClipboardCheck, Wallet, CheckCircle,
  Banknote, ArrowDownToLine, Megaphone, ShieldAlert, UserCog, Landmark, ShieldCheck, Flag, BarChart3, ListPlus,
} from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { getRevenueBreakdown } from "@/lib/finance/revenue";
import { getDailySeries, getLedgerTotals } from "@/lib/finance/series";
import { thirdPartyDaily, parseDay, dayKey } from "@/lib/finance/platform-income";
import { getPointsBreakdown } from "@/lib/finance/points-breakdown";
import { POINT_SOURCE_META } from "@/lib/finance/points-source";
import { getPayrollExpense } from "@/lib/payroll/run";
import { UserGrowthChart } from "@/components/admin/user-growth-chart";
import { PlatformStats } from "@/components/admin/platform-stats";
import { PendingRequestsHub } from "@/components/admin/pending-requests-hub";
import { PlatformOverview } from "@/components/admin/platform-overview";
import { RecentActivityFeed, type ActivityLogEntry } from "@/components/admin/recent-activity-feed";
import { MetricPanel, type Metric } from "@/components/admin/dashboard/metric-panel";
import { AlertsPanel, type DashboardAlert } from "@/components/admin/dashboard/alerts-panel";
import { QuickActions, type QuickAction } from "@/components/admin/dashboard/quick-actions";
import { PlatformActivityFeed, type PlatformEvent } from "@/components/admin/dashboard/platform-activity-feed";
import { IncomeBySource, DASHBOARD_RANGES, type IncomeBySourceProps } from "@/components/admin/dashboard/income-by-source";
import { getEffectivePermissions } from "@/lib/permissions";
import { getPendingSources } from "@/lib/admin/pending-counts";
import { format, startOfDay, subDays, startOfMonth } from "date-fns";
import { AWAITING_REVIEW_WHERE, IN_PROGRESS_WHERE, completedBetween } from "@/lib/submission-status";
import { getFinanceTestUserIds, withoutUsers } from "@/lib/finance/test-users";

// Auto-revalidate every 30 seconds (matches PROTOTYPE_ADMIN.md §38 spec)
export const revalidate = 30;

/** A withdrawal still unpaid after this long is raised as an alert. */
const WITHDRAWAL_SLA_HOURS = 48;
/** Same line /admin/fraud and the withdrawal page use for "risky". */
const HIGH_RISK = 50;
const DAY_MS = 86_400_000;

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

type SP = { range?: string | string[]; from?: string | string[]; to?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The income window, with /admin/finance's own rules: presets start at UTC
 * midnight `days - 1` days back and have no upper bound, so "30 days" here and
 * "30 days" there run the same queries over the same rows. A custom range is
 * whole UTC days, inclusive, capped at a year.
 */
function resolveRange(sp: SP) {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(todayUtc.getTime() + DAY_MS);
  if (first(sp.range) === "custom") {
    const f = parseDay(first(sp.from));
    if (f) {
      const t0 = parseDay(first(sp.to));
      let last = t0 && t0 >= f ? t0 : f;
      if (last.getTime() - f.getTime() > 365 * DAY_MS) last = new Date(f.getTime() + 365 * DAY_MS);
      const endExcl = new Date(last.getTime() + DAY_MS);
      return {
        id: "custom",
        label: dayKey(f) === dayKey(last) ? dayKey(f) : `${dayKey(f)} → ${dayKey(last)}`,
        from: f,
        // Revenue and the ledger filter with `lte`; points with `lt`.
        toIncl: new Date(endExcl.getTime() - 1) as Date | undefined,
        toExcl: endExcl,
        fromStr: dayKey(f),
        toStr: dayKey(last),
      };
    }
  }
  const preset = DASHBOARD_RANGES.find((r) => r.id === first(sp.range)) ?? DASHBOARD_RANGES[2];
  return {
    id: preset.id as string,
    label: preset.label as string,
    from: new Date(todayUtc.getTime() - (preset.days - 1) * DAY_MS),
    toIncl: undefined as Date | undefined,
    toExcl: endOfToday,
    fromStr: undefined as string | undefined,
    toStr: undefined as string | undefined,
  };
}

// Restated: relation selects lose their inferred shape through safeRead's
// `[]` fallback under this Prisma build.
type FeedPerson = { name: string | null; username: string | null } | null;
type FeedSub = { id: string; status: string; submittedAt: Date | null; user: FeedPerson; task: { title: string } | null };
type FeedWithdrawal = { id: string; amount: MoneyInput; method: string; status: string; createdAt: Date; user: FeedPerson };

const MONEY_ENTITY = /withdraw|deposit|finance|transaction|wallet|payout|payroll|expense|invoice|balance/i;

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const pendingBy = new Map(pendingSources.map((s) => [s.key, s.count ?? 0]));
  // Money cards leave out finance test users, like /admin/finance does. People
  // and queue counts below do not — those are operational, not the books.
  const testIds = await getFinanceTestUserIds();
  const noTest = <W extends object>(w: NoInfer<W>, field = "userId", nullable = false): W =>
    withoutUsers<W>(w, testIds, field, { nullable });

  const range = resolveRange(await searchParams);

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = subDays(todayStart, 7);
  const thirtyDaysAgo = subDays(todayStart, 30);
  const slaCutoff = new Date(now.getTime() - WITHDRAWAL_SLA_HOURS * 3600 * 1000);
  // Active-day rows are UTC dates (lib/active-days.ts).
  const utcToday = new Date(now);
  utcToday.setUTCHours(0, 0, 0, 0);
  const utc6 = new Date(utcToday.getTime() - 6 * DAY_MS);
  const utc29 = new Date(utcToday.getTime() - 29 * DAY_MS);

  // Every read below is a display figure, so each one degrades on its own
  // (safeRead → 0 / empty) instead of one failed query taking the whole admin
  // dashboard to the error screen. The failure is logged and counted.
  // `as never` lets one empty aggregate stand in for every aggregate's shape:
  // the `_sum` fields read undefined → toNum() → 0, `_count` reads 0.
  const EMPTY_AGG = { _sum: {}, _count: 0 } as never;
  const staffRoles = Prisma.join(STAFF_ROLES as string[]);

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

    // Finance overview + ops queues (folded into the same batch to avoid waterfalls)
    pendingDepositsAgg,
    approvedDepositsAgg,
    walletLiabilityAgg,
    adCreditOutstandingAgg,
    adSpendAgg,
    completedWithdrawalsCount,
    referralUsersCount,

    // Overview panels
    newUsers7d,
    newUsers30d,
    usersByStatus,
    activeDays,
    tasksByStatus,
    subsByStatus,
    inProgressCount,
    withdrawalsByStatus,
    overdueWithdrawals,
    highRiskUsers,
    vpnUsers7d,
    abuseOpen,
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

    // ── Overview panels ────────────────────────────────────────────────────
    safeRead(prisma.user.count({ where: { createdAt: { gte: subDays(todayStart, 6) } } }), 0, "admin dashboard users 7d"),
    safeRead(prisma.user.count({ where: { createdAt: { gte: subDays(todayStart, 29) } } }), 0, "admin dashboard users 30d"),
    safeRead(prisma.user.groupBy({ by: ["status"], _count: { _all: true } }), [], "admin dashboard users by status") as Promise<
      Array<{ status: string; _count: { _all: number } }>
    >,
    // Members (not staff) seen on a UTC day — the same table and the same
    // staff rule as /admin/progress and /admin/users/returning.
    safeRead(
      prisma.$queryRaw<Array<{ today: number; d7: number; d30: number }>>`
        SELECT
          COUNT(DISTINCT a."userId") FILTER (WHERE a.date = ${utcToday})::int AS today,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.date >= ${utc6})::int AS d7,
          COUNT(DISTINCT a."userId")::int AS d30
        FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
        WHERE a.date >= ${utc29} AND u.role::text NOT IN (${staffRoles})`,
      [],
      "admin dashboard active days"
    ),
    safeRead(prisma.task.groupBy({ by: ["status"], _count: { _all: true } }), [], "admin dashboard tasks by status") as Promise<
      Array<{ status: string; _count: { _all: number } }>
    >,
    safeRead(prisma.taskSubmission.groupBy({ by: ["status"], _count: { _all: true } }), [], "admin dashboard subs by status") as Promise<
      Array<{ status: string; _count: { _all: number } }>
    >,
    safeRead(prisma.taskSubmission.count({ where: IN_PROGRESS_WHERE }), 0, "admin dashboard subs in progress"),
    // Money panel: finance test users out, like every money figure here.
    seesMoney
      ? (safeRead(
          prisma.withdrawal.groupBy({
            by: ["status"],
            where: noTest({}),
            _count: { _all: true },
            _sum: { amount: true },
          }),
          [],
          "admin dashboard withdrawals by status"
        ) as Promise<Array<{ status: string; _count: { _all: number }; _sum: { amount: MoneyInput | null } }>>)
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number }; _sum: { amount: MoneyInput | null } }>),
    // Unpaid past the SLA — an operational queue count, so test users stay in.
    perms.has("withdrawals.view")
      ? safeRead(
          prisma.withdrawal.aggregate({
            where: { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: slaCutoff } },
            _count: true,
            _min: { createdAt: true },
          }),
          { _count: 0, _min: { createdAt: null } } as never,
          "admin dashboard overdue withdrawals"
        ) as Promise<{ _count: number; _min: { createdAt: Date | null } }>
      : Promise.resolve({ _count: 0, _min: { createdAt: null } }),
    perms.has("fraud.view")
      ? safeRead(
          prisma.user.count({ where: { fraudRisk: { gte: HIGH_RISK }, status: { notIn: ["BANNED"] } } }),
          0,
          "admin dashboard high risk"
        )
      : Promise.resolve(0),
    perms.has("fraud.view")
      ? safeRead(prisma.user.count({ where: { vpnLastSeenAt: { gte: subDays(now, 7) } } }), 0, "admin dashboard vpn 7d")
      : Promise.resolve(0),
    perms.has("fraud.view")
      ? (safeRead(
          prisma.abuseCase.groupBy({ by: ["severity"], where: { status: "OPEN" }, _count: { _all: true } }),
          [],
          "admin dashboard abuse open"
        ) as Promise<Array<{ severity: string; _count: { _all: number } }>>)
      : Promise.resolve([] as Array<{ severity: string; _count: { _all: number } }>),
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
    // The raw change data of a money action carries amounts and balances —
    // finance only, like every other money figure on this page.
    const moneyRow = MONEY_ENTITY.test(`${log.entity} ${log.action}`);
    if (log.newData && typeof log.newData === "object" && (seesMoney || !moneyRow)) {
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

  // ── Money: the finance console's own functions, the finance console's window ──
  // All-time / today revenue cards and the "Income by source" block. Finance
  // only; for everyone else none of this is read.
  let income: IncomeBySourceProps | null = null;
  let allTimeRev: Awaited<ReturnType<typeof getRevenueBreakdown>> | null = null;
  let todayRev: Awaited<ReturnType<typeof getRevenueBreakdown>> | null = null;
  if (seesMoney) {
    const r = { from: range.from, to: range.toIncl };
    const [allTime, today, revenue, totals, series, payroll, points, tp] = await Promise.all([
      getRevenueBreakdown({}).catch(() => null),
      getRevenueBreakdown({ from: todayStart }).catch(() => null),
      getRevenueBreakdown(r).catch(() => null),
      getLedgerTotals(r).catch(() => null),
      getDailySeries(r).catch(() => null),
      getPayrollExpense(r).catch(() => null),
      getPointsBreakdown(range.from, range.toExcl).catch(() => null),
      thirdPartyDaily(range.from, range.toIncl ?? now).catch(() => null),
    ]);
    allTimeRev = allTime;
    todayRev = today;
    const tpByDay = new Map((tp?.days ?? []).map((d) => [d.date, d.usd]));
    const costUsd = totals?.costUsd ?? 0;
    const payrollUsd = payroll?.usd ?? 0;
    const revenueUsd = revenue?.totalUsd ?? 0;
    income = {
      range: { id: range.id, label: range.label, from: range.fromStr, to: range.toStr },
      revenueUsd,
      platformUsd: revenue?.platformUsd ?? 0,
      thirdPartyUsd: revenue?.thirdPartyUsd ?? 0,
      // Same split and same net as the finance Overview: payroll is a BONUS row
      // already inside the ledger's cost, shown on its own line.
      paidToUsersUsd: Math.max(0, costUsd - payrollUsd),
      payrollUsd,
      netUsd: revenueUsd - costUsd,
      streams: (revenue?.streams ?? []).map((s) => ({ key: s.key, label: s.label, usd: s.usd, count: s.count, group: s.group })),
      points: points
        ? {
            total: points.totalPoints,
            rows: points.totalRows,
            pointsPerUsd: points.pointsPerUsd,
            bySource: points.bySource.map((s) => ({
              key: s.source,
              label: POINT_SOURCE_META[s.source]?.label ?? s.source,
              points: s.points,
              rows: s.rows,
              users: s.users,
            })),
          }
        : null,
      series: (series ?? []).map((d) => ({
        date: format(new Date(`${d.date}T00:00:00.000Z`), "MMM d"),
        revenue: Math.round(d.revenue * 100) / 100,
        thirdParty: Math.round((tpByDay.get(d.date) ?? 0) * 100) / 100,
        cost: Math.round(d.cost * 100) / 100,
      })),
      ok: !!(revenue && totals && series && payroll && points),
    };
  }

  // ── Panel figures ────────────────────────────────────────────────────────
  const byStatus = <T extends { status: string; _count: { _all: number } }>(rows: T[]) =>
    new Map(rows.map((r) => [r.status, r._count._all]));
  const userStatus = byStatus(usersByStatus);
  const taskStatus = byStatus(tasksByStatus);
  const subStatus = byStatus(subsByStatus);
  const wd = new Map(withdrawalsByStatus.map((r) => [r.status, { n: r._count._all, usd: toNum(r._sum.amount) }]));
  const wdOf = (s: string) => wd.get(s) ?? { n: 0, usd: 0 };
  const active = activeDays[0] ?? { today: 0, d7: 0, d30: 0 };
  const abuseTotal = abuseOpen.reduce((s, r) => s + r._count._all, 0);
  const abuseSevere = abuseOpen
    .filter((r) => r.severity === "HIGH" || r.severity === "CRITICAL")
    .reduce((s, r) => s + r._count._all, 0);
  const pend = (key: string) => pendingBy.get(key);

  const userMetrics: Metric[] = [
    { label: "Total users", value: totalUsers, href: "/admin/users" },
    { label: "New today", value: newUsersToday, tone: newUsersToday > 0 ? "good" : "default" },
    { label: "New · 7 days", value: newUsers7d },
    { label: "New · 30 days", value: newUsers30d },
    { label: "Online now", value: realtimeActive5m, hint: `${activeUsers24h.toLocaleString()} signed in · 24h` },
    { label: "Active today", value: active.today, hint: "members, UTC day", href: "/admin/users/returning" },
    { label: "Active · 7 days", value: active.d7, href: "/admin/users/returning" },
    { label: "Active · 30 days", value: active.d30, href: "/admin/users/returning" },
    { label: "Unverified", value: userStatus.get("PENDING_VERIFICATION") ?? 0, tone: "muted", href: "/admin/users?status=PENDING_VERIFICATION" },
    { label: "Suspended", value: userStatus.get("SUSPENDED") ?? 0, tone: (userStatus.get("SUSPENDED") ?? 0) > 0 ? "warn" : "default", href: "/admin/users?status=SUSPENDED" },
    { label: "Banned", value: userStatus.get("BANNED") ?? 0, tone: (userStatus.get("BANNED") ?? 0) > 0 ? "bad" : "default", href: "/admin/users?status=BANNED" },
    { label: "KYC verified", value: verifiedKycCount, tone: "good", href: "/admin/users?kyc=APPROVED" },
  ];
  if (pend("kyc") !== undefined)
    userMetrics.push({ label: "KYC pending", value: pend("kyc")!, tone: pend("kyc")! > 0 ? "warn" : "default", href: "/admin/users/kyc" });
  if (pend("creatorApps") !== undefined)
    userMetrics.push({ label: "Creator apps", value: pend("creatorApps")!, tone: pend("creatorApps")! > 0 ? "warn" : "default", href: "/admin/creators" });

  const approvedSubs = (subStatus.get("APPROVED") ?? 0) + (subStatus.get("AUTO_APPROVED") ?? 0);
  const taskMetrics: Metric[] = [
    { label: "Listed tasks", value: totalTasks, href: "/admin/tasks" },
    { label: "Active", value: taskStatus.get("ACTIVE") ?? 0, tone: "good", href: "/admin/tasks?status=ACTIVE" },
    { label: "Paused", value: taskStatus.get("PAUSED") ?? 0, tone: "muted", href: "/admin/tasks?status=PAUSED" },
    { label: "Completed", value: taskStatus.get("COMPLETED") ?? 0, href: "/admin/tasks?status=COMPLETED" },
    { label: "Expired", value: taskStatus.get("EXPIRED") ?? 0, tone: "muted", href: "/admin/tasks?status=EXPIRED" },
    { label: "Buyer tasks to approve", value: taskStatus.get("PENDING_REVIEW") ?? 0, tone: (taskStatus.get("PENDING_REVIEW") ?? 0) > 0 ? "warn" : "default", href: "/admin/tasks?status=PENDING_REVIEW" },
    { label: "Awaiting review", value: pendingApprovalsCount, tone: pendingApprovalsCount > 0 ? "warn" : "default", hint: "submitted, not reviewed", href: "/admin/submissions?status=PENDING" },
    { label: "In progress", value: inProgressCount, tone: "muted", hint: "opened, not sent in" },
    { label: "Approved", value: approvedSubs, tone: "good", hint: "all time, incl. auto", href: "/admin/submissions?status=APPROVED_ANY" },
    { label: "Rejected", value: subStatus.get("REJECTED") ?? 0, tone: "bad", href: "/admin/submissions?status=REJECTED" },
    { label: "Revision asked", value: subStatus.get("REVISION_REQUESTED") ?? 0, tone: "muted", href: "/admin/submissions?status=REVISION_REQUESTED" },
    { label: "Completed today", value: completionsToday, hint: `${completionsMonth.toLocaleString()} this month` },
  ];

  const withdrawalMetrics: Metric[] = seesMoney
    ? [
        { label: "Pending", value: wdOf("PENDING").n, hint: usd(wdOf("PENDING").usd), tone: wdOf("PENDING").n > 0 ? "warn" : "default", href: "/admin/withdrawals?status=PENDING" },
        { label: "Processing", value: wdOf("PROCESSING").n, hint: `${usd(wdOf("PROCESSING").usd)} · approved, unpaid`, href: "/admin/withdrawals?status=PROCESSING" },
        { label: "Completed", value: wdOf("COMPLETED").n, hint: `${usd(wdOf("COMPLETED").usd)} paid`, tone: "good", href: "/admin/withdrawals?status=COMPLETED" },
        { label: "Rejected", value: wdOf("REJECTED").n, hint: usd(wdOf("REJECTED").usd), tone: "bad", href: "/admin/withdrawals?status=REJECTED" },
        { label: "Cancelled", value: wdOf("CANCELLED").n, hint: usd(wdOf("CANCELLED").usd), tone: "muted", href: "/admin/withdrawals?status=CANCELLED" },
        { label: `Waiting > ${WITHDRAWAL_SLA_HOURS}h`, value: overdueWithdrawals._count, tone: overdueWithdrawals._count > 0 ? "bad" : "good", href: "/admin/withdrawals?status=PENDING" },
      ]
    : [];

  // ── Alerts: only what this viewer may act on, only when non-zero ─────────
  const alerts: DashboardAlert[] = [];
  if (perms.has("withdrawals.view") && overdueWithdrawals._count > 0)
    alerts.push({
      level: "critical",
      title: `${overdueWithdrawals._count} withdrawal${overdueWithdrawals._count === 1 ? "" : "s"} waiting over ${WITHDRAWAL_SLA_HOURS}h`,
      detail: overdueWithdrawals._min.createdAt ? `oldest since ${format(overdueWithdrawals._min.createdAt, "MMM d, HH:mm")}` : undefined,
      href: "/admin/withdrawals?status=PENDING",
    });
  if (perms.has("fraud.view") && abuseSevere > 0)
    alerts.push({ level: "critical", title: `${abuseSevere} high-severity abuse case${abuseSevere === 1 ? "" : "s"} open`, detail: `${abuseTotal} open in total`, href: "/admin/abuse" });
  else if (perms.has("fraud.view") && abuseTotal > 0)
    alerts.push({ level: "warning", title: `${abuseTotal} abuse case${abuseTotal === 1 ? "" : "s"} open`, href: "/admin/abuse" });
  if ((pend("fraudOpen") ?? 0) > 0)
    alerts.push({ level: "warning", title: `${pend("fraudOpen")} open fraud alert${pend("fraudOpen") === 1 ? "" : "s"}`, href: "/admin/fraud" });
  if (perms.has("fraud.view") && highRiskUsers > 0)
    alerts.push({ level: "warning", title: `${highRiskUsers} high-risk account${highRiskUsers === 1 ? "" : "s"}`, detail: `fraud risk ${HIGH_RISK}+ · not banned`, href: "/admin/fraud" });
  if (perms.has("submissions.view") && pendingApprovalsCount > 0)
    alerts.push({
      level: pendingApprovalsCount >= 50 ? "warning" : "info",
      title: `${pendingApprovalsCount.toLocaleString()} submission${pendingApprovalsCount === 1 ? "" : "s"} awaiting review`,
      href: "/admin/submissions?status=PENDING",
    });
  if ((pend("withdrawals") ?? 0) > 0)
    alerts.push({ level: "info", title: `${pend("withdrawals")} withdrawal${pend("withdrawals") === 1 ? "" : "s"} to process`, detail: "pending + processing", href: "/admin/withdrawals" });
  if ((pend("mktDisputes") ?? 0) > 0)
    alerts.push({ level: "warning", title: `${pend("mktDisputes")} marketplace dispute${pend("mktDisputes") === 1 ? "" : "s"} open`, href: "/admin/marketplace" });
  if ((pend("socialReports") ?? 0) > 0)
    alerts.push({ level: "info", title: `${pend("socialReports")} content report${pend("socialReports") === 1 ? "" : "s"} pending`, href: "/admin/social-moderation" });
  if ((pend("suspensionAppeals") ?? 0) > 0)
    alerts.push({ level: "info", title: `${pend("suspensionAppeals")} suspension appeal${pend("suspensionAppeals") === 1 ? "" : "s"}`, href: "/admin/fraud" });
  if (perms.has("fraud.view") && vpnUsers7d > 0)
    alerts.push({ level: "info", title: `${vpnUsers7d} member${vpnUsers7d === 1 ? "" : "s"} seen on a VPN this week`, href: "/admin/fraud?tab=vpn" });

  // ── Quick actions: only screens this viewer can open ─────────────────────
  const actionDefs: Array<QuickAction & { perm: Parameters<typeof perms.has>[0] }> = [
    { label: "Review submissions", href: "/admin/submissions?status=PENDING", icon: ClipboardCheck, perm: "submissions.view", count: pendingApprovalsCount },
    { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet, perm: "withdrawals.view", count: pend("withdrawals") },
    { label: "Manage users", href: "/admin/users", icon: Users, perm: "users.view" },
    { label: "KYC queue", href: "/admin/users/kyc", icon: ShieldCheck, perm: "kyc.view", count: pend("kyc") },
    { label: "Tasks", href: "/admin/tasks", icon: ListPlus, perm: "tasks.view", count: pend("tasksPendingReview") },
    { label: "Fraud & abuse", href: "/admin/abuse", icon: ShieldAlert, perm: "fraud.view", count: abuseTotal },
    { label: "Reports", href: "/admin/social-moderation", icon: Flag, perm: "social.moderate", count: pend("socialReports") },
    { label: "Finance", href: "/admin/finance", icon: Landmark, perm: "finance.view" },
    { label: "Analytics", href: "/admin/analytics", icon: BarChart3, perm: "analytics.view" },
    { label: "Staff activity", href: "/admin/admin-activity", icon: UserCog, perm: "logs.view" },
  ];
  const quickActions: QuickAction[] = actionDefs
    .filter((a) => perms.has(a.perm))
    .slice(0, 8)
    .map(({ perm: _perm, ...a }) => a);

  // ── Member activity feed — each stream behind the permission of its page ──
  const take = 6;
  const [fSignups, fSubs, fWithdrawals, fReports, fDisputes] = await Promise.all([
    perms.has("users.view")
      ? safeRead(prisma.user.findMany({
          orderBy: { createdAt: "desc" }, take,
          select: { id: true, name: true, username: true, country: true, createdAt: true },
        }), [], "admin dashboard feed signups")
      : Promise.resolve([]),
    perms.has("submissions.view")
      ? safeRead(prisma.taskSubmission.findMany({
          where: { submittedAt: { not: null } },
          orderBy: { submittedAt: "desc" }, take,
          select: { id: true, status: true, submittedAt: true, user: { select: { name: true, username: true } }, task: { select: { title: true } } },
        }), [], "admin dashboard feed submissions") as unknown as Promise<FeedSub[]>
      : Promise.resolve([] as FeedSub[]),
    perms.has("withdrawals.view")
      ? safeRead(prisma.withdrawal.findMany({
          orderBy: { createdAt: "desc" }, take,
          select: { id: true, amount: true, method: true, status: true, createdAt: true, user: { select: { name: true, username: true } } },
        }), [], "admin dashboard feed withdrawals") as unknown as Promise<FeedWithdrawal[]>
      : Promise.resolve([] as FeedWithdrawal[]),
    perms.has("social.moderate")
      ? safeRead(prisma.socialReport.findMany({
          orderBy: { createdAt: "desc" }, take: 4,
          select: { id: true, contentType: true, reason: true, status: true, createdAt: true },
        }), [], "admin dashboard feed reports")
      : Promise.resolve([]),
    perms.has("marketplace.disputes")
      ? safeRead(prisma.marketplaceDispute.findMany({
          orderBy: { createdAt: "desc" }, take: 4,
          select: { id: true, reason: true, status: true, createdAt: true },
        }), [], "admin dashboard feed disputes")
      : Promise.resolve([]),
  ]);
  const who = (u: { name: string | null; username: string | null } | null | undefined) =>
    u?.username ? `@${u.username}` : u?.name ?? "A member";
  const memberEvents: PlatformEvent[] = [
    ...fSignups.map((u) => ({
      id: u.id, kind: "signup" as const, at: u.createdAt, href: `/admin/users/${u.id}`,
      title: `${who(u)} joined`, detail: u.country ?? undefined,
    })),
    ...fSubs.map((s) => ({
      id: s.id, kind: "submission" as const, at: s.submittedAt!, href: "/admin/submissions?status=PENDING",
      title: `${who(s.user)} submitted “${s.task?.title ?? "a task"}”`, detail: s.status.replace(/_/g, " ").toLowerCase(),
    })),
    ...fWithdrawals.map((w) => ({
      id: w.id, kind: "withdrawal" as const, at: w.createdAt, href: `/admin/withdrawals/${w.id}`,
      title: `${who(w.user)} requested a withdrawal${seesMoney ? ` of ${usd(toNum(w.amount))}` : ""}`,
      detail: `${w.method} · ${w.status.toLowerCase()}`,
    })),
    ...fReports.map((r) => ({
      id: r.id, kind: "report" as const, at: r.createdAt, href: "/admin/social-moderation",
      title: `${r.contentType.toLowerCase()} reported · ${r.reason.toLowerCase()}`, detail: r.status.toLowerCase(),
    })),
    ...fDisputes.map((d) => ({
      id: d.id, kind: "dispute" as const, at: d.createdAt, href: "/admin/marketplace",
      title: `Marketplace dispute · ${String(d.reason).replace(/_/g, " ").toLowerCase()}`, detail: String(d.status).replace(/_/g, " ").toLowerCase(),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 15);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <QuickActions actions={quickActions} />

      {/* At a glance — people, work, and what needs a person */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MetricPanel title="Users" icon={Users} accent="blue" href="/admin/users" metrics={userMetrics} />
        <MetricPanel title="Tasks & submissions" icon={ListTodo} accent="purple" href="/admin/submissions" metrics={taskMetrics} />
        <AlertsPanel alerts={alerts} />
      </div>

      {/* Money — finance only */}
      {seesMoney && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">Money</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Total Revenue"
              value={usd(allTimeRev?.totalUsd ?? totalRevenue)}
              subtext={
                allTimeRev
                  ? `all time · own ${usd(allTimeRev.platformUsd)} · third-party ${usd(allTimeRev.thirdPartyUsd)}`
                  : "all time"
              }
              icon={TrendingUp}
              tone="green"
              href="/admin/finance"
            />
            <StatCard
              title="Today Revenue"
              value={usd(todayRev?.totalUsd ?? todayRevenue)}
              subtext={format(now, "MMM d, yyyy")}
              icon={CalendarDays}
              tone="blue"
            />
            <StatCard
              title="Total Paid"
              value={usd(totalPaid)}
              subtext="withdrawals completed, since launch"
              icon={CheckCircle}
              tone="purple"
              href="/admin/withdrawals?status=COMPLETED"
            />
            <StatCard
              title="Pending Payouts"
              value={usd(pendingPayoutsAmount)}
              subtext={`${pendingWithdrawalsCount} awaiting`}
              icon={Wallet}
              tone="amber"
              href="/admin/withdrawals"
            />
          </div>

          <MetricPanel
            title="Withdrawals"
            icon={Wallet}
            accent="green"
            href="/admin/withdrawals"
            note="all time · test users excluded"
            metrics={withdrawalMetrics}
          />

          {income && <IncomeBySource {...income} />}

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
              Finance Overview
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
        </div>
      )}

      {/* Task economy — for everyone with the dashboard. */}
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 px-1">Task economy</h2>
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

      {/* Pending requests hub — all reviewable applications/submissions at a glance */}
      <PendingRequestsHub sources={pendingSources} />

      {/* Charts — User growth (2/3) + Platform stats (1/3) */}
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

      {/* Activity — what members did, what staff did */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PlatformActivityFeed events={memberEvents} />
        <RecentActivityFeed entries={recentEntries} title="Staff activity" />
      </div>

      <PlatformOverview
        marketplace={{
          listings: totalListings,
          orders: totalOrders,
          pending: pendingOrders,
        }}
        courses={{ active: totalCourses, enrollments: totalEnrollments }}
        financials={seesMoney ? { totalWithdrawn: totalPaid } : undefined}
      />
    </div>
  );
}
