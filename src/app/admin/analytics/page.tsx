import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { Users, DollarSign, TrendingUp, Activity, ArrowUpRight, ArrowDownRight, Eye, Clock, MousePointer2, FileText, ListChecks } from "lucide-react";
import Link from "next/link";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { ExportDropdown } from "./_components/ExportDropdown";
import { AnalyticsCharts } from "@/components/admin/analytics/analytics-charts";

interface PageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

// Prisma's aggregate/groupBy generics degrade to `{}` inside this large
// Promise.all tuple, so the traffic result shapes are declared explicitly.
type TrafficSum = { views: number | null; uniqueVisitors: number | null; totalDwellSec: number | null };
type TrafficBatch = [
  { _sum: TrafficSum },
  { _sum: { views: number | null; uniqueVisitors: number | null } },
  Array<{ key: string; _sum: TrafficSum }>,
  Array<{ key: string; label: string | null; _sum: TrafficSum }>,
  Array<{ date: Date; _sum: { views: number | null; uniqueVisitors: number | null } }>,
  Array<{ type: string; _count: { _all: number } }>,
];

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "analytics.view")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const period = params.period || "7d";

  // Calculate date ranges
  const now = new Date();
  let startDate: Date;
  let previousStartDate: Date;
  let previousEndDate: Date;

  switch (period) {
    case "24h":
      startDate = subDays(now, 1);
      previousStartDate = subDays(now, 2);
      previousEndDate = subDays(now, 1);
      break;
    case "30d":
      startDate = subDays(now, 30);
      previousStartDate = subDays(now, 60);
      previousEndDate = subDays(now, 30);
      break;
    case "90d":
      startDate = subDays(now, 90);
      previousStartDate = subDays(now, 180);
      previousEndDate = subDays(now, 90);
      break;
    default: // 7d
      startDate = subDays(now, 7);
      previousStartDate = subDays(now, 14);
      previousEndDate = subDays(now, 7);
  }

  // Fetch current period stats
  const [
    totalUsers,
    newUsers,
    previousNewUsers,
    totalTasks,
    completedTasks,
    previousCompletedTasks,
    totalWithdrawals,
    previousWithdrawals,
    _totalEarnings,
    _previousEarnings,
    activeUsers,
    previousActiveUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: startDate } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: previousStartDate, lt: previousEndDate } },
    }),
    prisma.task.count({ where: { status: "ACTIVE" } }),
    prisma.taskSubmission.count({
      where: {
        status: "APPROVED",
        createdAt: { gte: startDate },
      },
    }),
    prisma.taskSubmission.count({
      where: {
        status: "APPROVED",
        createdAt: { gte: previousStartDate, lt: previousEndDate },
      },
    }),
    prisma.withdrawal.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: startDate },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.withdrawal.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: previousStartDate, lt: previousEndDate },
      },
      _sum: { amount: true },
    }),
    prisma.referralEarning.aggregate({
      where: { createdAt: { gte: startDate } },
      _sum: { amount: true },
    }),
    prisma.referralEarning.aggregate({
      where: { createdAt: { gte: previousStartDate, lt: previousEndDate } },
      _sum: { amount: true },
    }),
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startDate } },
    }),
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: previousStartDate, lt: previousEndDate } },
    }),
  ]);

  // Calculate percentage changes
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const userChange = calculateChange(newUsers, previousNewUsers);
  const taskChange = calculateChange(completedTasks, previousCompletedTasks);
  const withdrawalChange = calculateChange(
    toNum(totalWithdrawals._sum.amount),
    toNum(previousWithdrawals._sum.amount)
  );
  const activeUserChange = calculateChange(
    activeUsers.length,
    previousActiveUsers.length
  );

  // Get daily data for chart (last 7 days)
  const dailyData = await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const date = subDays(now, 6 - i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const [users, tasks, withdrawals] = await Promise.all([
        prisma.user.count({
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
        }),
        prisma.taskSubmission.count({
          where: {
            status: "APPROVED",
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.withdrawal.aggregate({
          where: {
            status: "COMPLETED",
            createdAt: { gte: dayStart, lte: dayEnd },
          },
          _sum: { amount: true },
        }),
      ]);

      return {
        date: format(date, "MMM d"),
        users,
        tasks,
        withdrawals: toNum(withdrawals._sum.amount),
      };
    })
  );

  // Get top performers
  const topEarners = await prisma.user.findMany({
    orderBy: { totalEarnings: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      email: true,
      totalEarnings: true,
    },
  });

  // ── Traffic analytics (page-wise + task-page-wise, from PageDailyStat) ──────
  const trafficStart = startOfDay(startDate);
  const prevTrafficStart = startOfDay(previousStartDate);
  const prevTrafficEnd = startOfDay(previousEndDate);

  const [
    trafficAgg,
    prevTrafficAgg,
    topPagesRaw,
    topTaskPagesRaw,
    trafficDailyRaw,
    taskTypeDist,
  ] = (await Promise.all([
    prisma.pageDailyStat.aggregate({
      where: { kind: "PAGE", date: { gte: trafficStart } },
      _sum: { views: true, uniqueVisitors: true, totalDwellSec: true },
    }),
    prisma.pageDailyStat.aggregate({
      where: { kind: "PAGE", date: { gte: prevTrafficStart, lt: prevTrafficEnd } },
      _sum: { views: true, uniqueVisitors: true },
    }),
    prisma.pageDailyStat.groupBy({
      by: ["key"],
      where: { kind: "PAGE", date: { gte: trafficStart } },
      _sum: { views: true, uniqueVisitors: true, totalDwellSec: true },
      orderBy: { _sum: { views: "desc" } },
      take: 20,
    }),
    prisma.pageDailyStat.groupBy({
      by: ["key", "label"],
      where: { kind: "TASK", date: { gte: trafficStart } },
      _sum: { views: true, uniqueVisitors: true, totalDwellSec: true },
      orderBy: { _sum: { views: "desc" } },
      take: 20,
    }),
    prisma.pageDailyStat.groupBy({
      by: ["date"],
      where: { kind: "PAGE", date: { gte: trafficStart } },
      _sum: { views: true, uniqueVisitors: true },
      orderBy: { date: "asc" },
    }),
    prisma.task.groupBy({ by: ["type"], _count: { _all: true } }),
  ])) as unknown as TrafficBatch;

  // Resolve task titles for the task-page rows.
  const taskIds = topTaskPagesRaw.map((t) => t.key);
  const taskRows = taskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true, type: true },
      })
    : [];
  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  const totalViews = trafficAgg._sum.views ?? 0;
  const totalVisitors = trafficAgg._sum.uniqueVisitors ?? 0;
  const totalDwellSec = trafficAgg._sum.totalDwellSec ?? 0;
  const avgTimeSec = totalViews > 0 ? Math.round(totalDwellSec / totalViews) : 0;
  const viewsChange = calculateChange(totalViews, prevTrafficAgg._sum.views ?? 0);
  const visitorsChange = calculateChange(
    totalVisitors,
    prevTrafficAgg._sum.uniqueVisitors ?? 0
  );

  const fmtDuration = (sec: number) => {
    if (sec <= 0) return "0s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };
  const avgOf = (dwell: number | null, views: number | null) =>
    views && views > 0 ? Math.round((dwell ?? 0) / views) : 0;

  const topPages = topPagesRaw.map((p) => ({
    key: p.key,
    views: p._sum.views ?? 0,
    visitors: p._sum.uniqueVisitors ?? 0,
    avgSec: avgOf(p._sum.totalDwellSec, p._sum.views),
  }));
  const topTaskPages = topTaskPagesRaw.map((t) => ({
    id: t.key,
    title: taskById.get(t.key)?.title ?? "(deleted task)",
    type: t.label ?? taskById.get(t.key)?.type ?? "",
    views: t._sum.views ?? 0,
    visitors: t._sum.uniqueVisitors ?? 0,
    avgSec: avgOf(t._sum.totalDwellSec, t._sum.views),
  }));
  const trafficDaily = trafficDailyRaw.map((d) => ({
    date: format(d.date, "MMM d"),
    views: d._sum.views ?? 0,
    visitors: d._sum.uniqueVisitors ?? 0,
  }));
  const TASK_TYPE_NAME: Record<string, string> = {
    VIDEO: "Video", SOCIAL: "Social", SURVEY: "Survey", QUIZ: "Quiz",
    ARTICLE: "Article", CUSTOM: "Custom", APPINSTALL: "App Install",
    PROXY: "Proxy", MANUAL: "Manual", BOARD: "Board", OFFERWALL: "Offerwall",
  };
  const taskBreakdown = taskTypeDist
    .map((t) => ({ name: TASK_TYPE_NAME[t.type] ?? t.type, value: t._count._all }))
    .sort((a, b) => b.value - a.value);

  const canExport = hasPermission(adminRole, "analytics.export");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics & Reports</h1>
          <p className="text-gray-400 mt-1">
            Monitor platform performance and user activity
          </p>
        </div>
        {canExport && <ExportDropdown period={period} />}
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {[
          { value: "24h", label: "24 Hours" },
          { value: "7d", label: "7 Days" },
          { value: "30d", label: "30 Days" },
          { value: "90d", label: "90 Days" },
        ].map((p) => (
          <Link
            key={p.value}
            href={`/admin/analytics?period=${p.value}`}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              period === p.value
                ? "bg-indigo-500 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <span
              className={`inline-flex items-center text-xs font-medium ${
                userChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {userChange >= 0 ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {Math.abs(userChange).toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold text-white">{newUsers.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">New Users</p>
          <p className="text-xs text-gray-600 mt-2">{totalUsers.toLocaleString()} total</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <span
              className={`inline-flex items-center text-xs font-medium ${
                taskChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {taskChange >= 0 ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {Math.abs(taskChange).toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold text-white">{completedTasks.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Tasks Completed</p>
          <p className="text-xs text-gray-600 mt-2">{totalTasks} active tasks</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-purple-400" />
            </div>
            <span
              className={`inline-flex items-center text-xs font-medium ${
                withdrawalChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {withdrawalChange >= 0 ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {Math.abs(withdrawalChange).toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold text-white">
            ${(totalWithdrawals._sum.amount || 0).toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">Withdrawals</p>
          <p className="text-xs text-gray-600 mt-2">
            {totalWithdrawals._count.id} transactions
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <span
              className={`inline-flex items-center text-xs font-medium ${
                activeUserChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {activeUserChange >= 0 ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {Math.abs(activeUserChange).toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold text-white">{activeUsers.length.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Active Users</p>
          <p className="text-xs text-gray-600 mt-2">Users who completed tasks</p>
        </div>
      </div>

      {/* ── Traffic (page-wise) ── */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Traffic</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Eye className="w-5 h-5 text-cyan-400" />
              </div>
              <span className={`inline-flex items-center text-xs font-medium ${viewsChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {viewsChange >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {Math.abs(viewsChange).toFixed(1)}%
              </span>
            </div>
            <p className="text-3xl font-bold text-white">{totalViews.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">Pageviews</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MousePointer2 className="w-5 h-5 text-purple-400" />
              </div>
              <span className={`inline-flex items-center text-xs font-medium ${visitorsChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {visitorsChange >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {Math.abs(visitorsChange).toFixed(1)}%
              </span>
            </div>
            <p className="text-3xl font-bold text-white">{totalVisitors.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">Visitors</p>
            <p className="text-xs text-gray-600 mt-2">unique per day (visitor-days)</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{fmtDuration(avgTimeSec)}</p>
            <p className="text-sm text-gray-500 mt-1">Avg. time on page</p>
          </div>
        </div>
      </div>

      {/* Charts — Recharts (now incl. traffic trend + real task-type pie) */}
      <AnalyticsCharts daily={dailyData} traffic={trafficDaily} taskBreakdown={taskBreakdown} />

      {/* Top pages + Top task pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" /> Top Pages
          </h2>
          {topPages.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No page traffic in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4 font-semibold">Page</th>
                    <th className="py-2 px-3 font-semibold text-right">Views</th>
                    <th className="py-2 px-3 font-semibold text-right">Visitors</th>
                    <th className="py-2 pl-3 font-semibold text-right">Avg time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/70">
                  {topPages.map((p) => (
                    <tr key={p.key} className="text-gray-300">
                      <td className="py-2 pr-4 font-mono text-xs text-white truncate max-w-50" title={p.key}>{p.key}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{p.views.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-400">{p.visitors.toLocaleString()}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-400">{fmtDuration(p.avgSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-400" /> Top Task Pages
          </h2>
          {topTaskPages.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No task-page traffic in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4 font-semibold">Task</th>
                    <th className="py-2 px-3 font-semibold text-right">Views</th>
                    <th className="py-2 px-3 font-semibold text-right">Visitors</th>
                    <th className="py-2 pl-3 font-semibold text-right">Avg time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/70">
                  {topTaskPages.map((t) => (
                    <tr key={t.id} className="text-gray-300">
                      <td className="py-2 pr-4 min-w-0">
                        <span className="block text-white truncate max-w-50" title={t.title}>{t.title}</span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">{t.type}</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{t.views.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-400">{t.visitors.toLocaleString()}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-400">{fmtDuration(t.avgSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Top Earners */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top Earners (All Time)</h2>
        <div className="space-y-3">
          {topEarners.map((user, index) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                    index === 0
                      ? "bg-amber-500/10 text-amber-400"
                      : index === 1
                      ? "bg-gray-400/10 text-gray-300"
                      : index === 2
                      ? "bg-orange-500/10 text-orange-400"
                      : "bg-gray-700 text-gray-500"
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="font-medium text-white hover:text-indigo-400"
                  >
                    {user.name || user.email}
                  </Link>
                  {user.name && <p className="text-xs text-gray-500">{user.email}</p>}
                </div>
              </div>
              <p className="font-semibold text-emerald-400">
                ${user.totalEarnings.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
