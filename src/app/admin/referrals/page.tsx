import { usd } from "@/lib/utils";
import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Users, DollarSign, TrendingUp, ChevronLeft, ChevronRight, Crown, Gift, Settings, Eye, Download } from "lucide-react";
import Link from "next/link";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { getReferralBonusConfig } from "@/lib/referral-bonus";
import { ReferralBonusConfigForm } from "@/components/admin/referrals/referral-bonus-config-form";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
  }>;
}

export default async function AdminReferralsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "referrals.view"))) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Fetch only active referral levels for display
  const referralLevels = await prisma.referralLevel.findMany({
    where: { isActive: true },
    orderBy: { level: "asc" },
  });

  const bonusConfig = await getReferralBonusConfig();

  // Fetch top referrers
  const topReferrersRaw = await prisma.user.findMany({
    where: {
      referrals: {
        some: {},
      },
    },
    orderBy: {
      referrals: {
        _count: "desc",
      },
    },
    take: pageSize,
    skip,
    include: {
      _count: {
        select: { referrals: true },
      },
      package: { select: { id: true, slug: true, name: true } },
    },
  });

  // Type assertion for Prisma Accelerate
  type UserWithCount = typeof topReferrersRaw[0] & {
    _count: { referrals: number };
  };
  const topReferrers = topReferrersRaw as UserWithCount[];

  // Get stats
  const [totalReferrals, totalEarnings, activeReferrers] = await Promise.all([
    prisma.user.count({
      where: { referredById: { not: null } },
    }),
    prisma.referralEarning.aggregate({
      _sum: { amount: true },
    }),
    prisma.user.count({
      where: {
        referrals: { some: {} },
      },
    }),
  ]);

  const canEdit = await can(session.user.id, "referrals.configure");

  const buildQueryString = (newPage: number) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (params.search) queryParams.set("search", params.search);
    return queryParams.toString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Referral Management</h1>
          <p className="text-gray-400 mt-1">
            Manage referral levels and commission rates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/referrals/export"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV Export
          </a>
          {canEdit && (
            <Link
              href="/admin/referrals/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Commission Settings
            </Link>
          )}
        </div>
      </div>

      {/* Referral signup bonus config (feature #9) */}
      {canEdit && <ReferralBonusConfigForm initial={bonusConfig} />}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalReferrals.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Referrals</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Crown className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeReferrers.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Active Referrers</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {usd(totalEarnings._sum.amount ?? 0)}
              </p>
              <p className="text-sm text-gray-500">Total Commissions</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {totalReferrals > 0
                  ? ((activeReferrers / totalReferrals) * 100).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-sm text-gray-500">Conversion Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Commission Levels */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Commission Levels (10-Level MLM)</h2>
          {canEdit && (
            <Link
              href="/admin/referrals/settings"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Edit Rates
            </Link>
          )}
        </div>

        {referralLevels.length > 0 ? (
          <div className={`grid gap-4 ${
            referralLevels.length <= 5
              ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
              : "grid-cols-2 md:grid-cols-5 lg:grid-cols-10"
          }`}>
            {referralLevels.map((level) => (
              <div
                key={level.id}
                className="p-4 rounded-lg border bg-gray-800/50 border-gray-700 text-center"
              >
                <p className="text-sm text-gray-500 mb-1">Level {level.level}</p>
                <p className="text-xl font-bold text-white">
                  {level.commissionType === "PERCENTAGE"
                    ? `${level.commissionValue}%`
                    : `${usd(level.commissionValue)}`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400">No active commission levels configured.</p>
            {canEdit && (
              <Link
                href="/admin/referrals/settings"
                className="inline-block mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Configure Levels
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Top Referrers */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Top Referrers</h2>
        </div>

        {topReferrers.length > 0 ? (
          <AdminTable
            bare
            rows={topReferrers.map((user, index) => ({ user, rank: skip + index + 1 }))}
            getRowKey={(r) => r.user.id}
            columns={[
              {
                key: "rank",
                header: "Rank",
                mobileHidden: true,
                cell: (r) => (
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                      r.rank === 1
                        ? "bg-amber-500/10 text-amber-400"
                        : r.rank === 2
                        ? "bg-gray-400/10 text-gray-300"
                        : r.rank === 3
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {r.rank}
                  </span>
                ),
              },
              {
                key: "user",
                header: "User",
                primary: true,
                cell: (r) => (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
                      {r.user.name?.charAt(0) || r.user.email.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${r.user.id}`}
                        className="text-white hover:text-indigo-400 font-medium transition-colors"
                      >
                        {r.user.name || "Unnamed"}
                      </Link>
                      <p className="text-xs text-gray-500 truncate">{r.user.email}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: "code",
                header: "Referral Code",
                cell: (r) => (
                  <code className="px-2 py-1 bg-gray-800 rounded text-sm text-indigo-400">
                    {r.user.referralCode}
                  </code>
                ),
              },
              {
                key: "total",
                header: "Total Referrals",
                cell: (r) => (
                  <span className="text-white font-semibold">
                    {r.user._count.referrals.toLocaleString()}
                  </span>
                ),
              },
              {
                key: "package",
                header: "Package",
                mobileHidden: true,
                cell: (r) => (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400">
                    {(r.user as { package?: { name?: string } | null }).package?.name ?? "—"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (r) => (
                  <Link
                    href={`/admin/referrals/${r.user.id}`}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors inline-flex"
                    title="View Tree"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <Gift className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No referrers yet</h3>
            <p className="text-gray-400">Users with referrals will appear here</p>
          </div>
        )}

        {/* Pagination */}
        {topReferrers.length > 0 && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1} - {skip + topReferrers.length}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/referrals?${buildQueryString(page - 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page > 1
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Link>
              <Link
                href={
                  topReferrers.length === pageSize
                    ? `/admin/referrals?${buildQueryString(page + 1)}`
                    : "#"
                }
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  topReferrers.length === pageSize
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
