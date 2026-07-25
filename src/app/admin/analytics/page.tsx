import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { Users, DollarSign, TrendingUp, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
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

      {/* Charts — Recharts */}
      <AnalyticsCharts daily={dailyData} />

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
