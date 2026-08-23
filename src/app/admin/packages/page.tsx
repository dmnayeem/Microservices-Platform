import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { gt, toNum } from "@/lib/money";
import {
  Crown,
  Users,
  DollarSign,
  Edit,
  TrendingUp,
  Clock,
  Plus,
  Layers,
  Power,
  CheckCircle2,
  Star,
} from "lucide-react";
import Link from "next/link";
import { AdminTable } from "@/components/admin/ui/admin-table";

export default async function AdminPackagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "packages.view"))) redirect("/admin");

  const now = new Date();

  const [packages, userCounts, activeSubCounts, recentSubs] = await Promise.all(
    [
      prisma.package.findMany({
        orderBy: [{ order: "asc" }, { accessLevel: "asc" }],
      }),
      prisma.user.groupBy({
        by: ["packageId"],
        _count: { id: true },
      }),
      prisma.subscription.groupBy({
        by: ["packageId"],
        where: { isActive: true, endDate: { gt: now } },
        _count: { id: true },
      }),
      prisma.subscription.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]
  );

  type GroupRow = { packageId: string | null; _count: { id: number } };
  const userCountByPkg: Record<string, number> = {};
  for (const r of userCounts as GroupRow[]) {
    if (r.packageId) userCountByPkg[r.packageId] = r._count.id;
  }
  const activeSubByPkg: Record<string, number> = {};
  for (const r of activeSubCounts as GroupRow[]) {
    if (r.packageId) activeSubByPkg[r.packageId] = r._count.id;
  }

  const totalUsers = packages.reduce(
    (s, p) => s + (userCountByPkg[p.id] || 0),
    0
  );
  const paidActive = packages.reduce(
    (s, p) => (gt(p.priceMonthly, 0) ? s + (activeSubByPkg[p.id] || 0) : s),
    0
  );
  const estimatedRevenue = packages.reduce(
    (s, p) => s + (activeSubByPkg[p.id] || 0) * toNum(p.priceMonthly),
    0
  );

  const subUserIds = [...new Set(recentSubs.map((s) => s.userId))];
  const subPkgIds = [
    ...new Set(recentSubs.map((s) => s.packageId).filter(Boolean) as string[]),
  ];
  const [subUsers, subPkgs] = await Promise.all([
    subUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: subUserIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    subPkgIds.length
      ? prisma.package.findMany({
          where: { id: { in: subPkgIds } },
          select: { id: true, name: true, slug: true, badgeColor: true },
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(subUsers.map((u) => [u.id, u]));
  const pkgById = new Map(subPkgs.map((p) => [p.id, p]));
  type RecentSub = (typeof recentSubs)[number];
  type Pkg = (typeof packages)[number];

  const canEdit = await can(session.user.id, "packages.edit");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Plan Management</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Build any number of plans. Each plan toggles features on/off and sets its own pricing, limits, and multipliers.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/packages/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Create Plan
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<Layers className="w-5 h-5" />} tone="indigo" value={packages.length} label="Plans" />
        <Stat icon={<Users className="w-5 h-5" />} tone="purple" value={totalUsers} label="Total Users" />
        <Stat icon={<Crown className="w-5 h-5" />} tone="amber" value={paidActive} label="Active Paid Subs" />
        <Stat
          icon={<DollarSign className="w-5 h-5" />}
          tone="emerald"
          value={`${usd(estimatedRevenue)}`}
          label="Est. Monthly Revenue"
        />
      </div>

      {/* Plans table */}
      <AdminTable<Pkg>
        rows={packages}
        getRowKey={(pkg) => pkg.id}
        empty={
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <Layers className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white">No plans yet</h3>
            <p className="text-sm text-gray-500 mt-1">
              Click <strong>Create Plan</strong> to seed your first plan. Mark it as Default so new users have somewhere to land.
            </p>
          </div>
        }
        columns={[
          {
            key: "plan",
            header: "Plan",
            primary: true,
            cell: (pkg) => (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: pkg.badgeColor || "#6366f1" }}
                />
                <div>
                  <p className="font-semibold text-white">{pkg.name}</p>
                  {pkg.description && (
                    <p className="text-[11px] text-gray-500 truncate max-w-xs">
                      {pkg.description}
                    </p>
                  )}
                </div>
                {pkg.isDefault && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase">
                    <Star className="w-3 h-3" />
                    Default
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "slug",
            header: "Slug",
            mobileHidden: true,
            cell: (pkg) => (
              <span className="font-mono text-xs text-gray-400">{pkg.slug}</span>
            ),
          },
          {
            key: "access",
            header: "Access",
            className: "text-right",
            mobileHidden: true,
            cell: (pkg) => (
              <span className="text-gray-300 tabular-nums">{pkg.accessLevel}</span>
            ),
          },
          {
            key: "monthly",
            header: "Monthly",
            className: "text-right",
            cell: (pkg) => (
              <span className="text-emerald-400 font-bold tabular-nums">
                {usd(pkg.priceMonthly)}
              </span>
            ),
          },
          {
            key: "features",
            header: "Features",
            className: "text-center",
            mobileHidden: true,
            cell: (pkg) => (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <Power className="w-3 h-3" />
                {countEnabledFlags(pkg)}/{9 + 7}
              </span>
            ),
          },
          {
            key: "users",
            header: "Users",
            className: "text-right",
            cell: (pkg) => (
              <span className="text-gray-300 tabular-nums">
                {(userCountByPkg[pkg.id] || 0).toLocaleString()}
              </span>
            ),
          },
          {
            key: "subs",
            header: "Active Subs",
            className: "text-right",
            cell: (pkg) =>
              gt(pkg.priceMonthly, 0) ? (
                <span className="text-emerald-400 tabular-nums">
                  {(activeSubByPkg[pkg.id] || 0).toLocaleString()}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
              ),
          },
          {
            key: "state",
            header: "State",
            className: "text-center",
            cell: (pkg) =>
              pkg.isActive ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] font-bold">
                  Inactive
                </span>
              ),
          },
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            cell: (pkg) =>
              canEdit ? (
                <Link
                  href={`/admin/packages/${pkg.id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-xs font-semibold"
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </Link>
              ) : null,
          },
        ]}
      />

      {/* Recent Subscriptions */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Recent Subscriptions</h2>
          <span className="text-xs text-gray-500">Latest {recentSubs.length}</span>
        </div>
        {recentSubs.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">No subscriptions yet.</p>
          </div>
        ) : (
          <AdminTable<RecentSub>
            bare
            rows={recentSubs}
            getRowKey={(s) => s.id}
            columns={[
              {
                key: "user",
                header: "User",
                primary: true,
                cell: (s) => {
                  const u = userById.get(s.userId);
                  return (
                    <Link
                      href={`/admin/users/${s.userId}`}
                      className="text-white hover:text-indigo-400 transition-colors"
                    >
                      {u?.name || u?.email || s.userId.slice(0, 8)}
                    </Link>
                  );
                },
              },
              {
                key: "plan",
                header: "Plan",
                cell: (s) => {
                  const p = s.packageId ? pkgById.get(s.packageId) : null;
                  return (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: (p?.badgeColor || "#6366f1") + "33",
                        color: p?.badgeColor || "#a5b4fc",
                      }}
                    >
                      {p?.name || s.packageId?.slice(0, 8) || "—"}
                    </span>
                  );
                },
              },
              {
                key: "method",
                header: "Method",
                className: "text-gray-400 text-xs",
                cell: (s) => s.paymentMethod ?? "—",
              },
              {
                key: "amount",
                header: "Amount",
                className: "text-right text-amber-400 font-bold tabular-nums",
                cell: (s) => <>{usd(s.amount)}</>,
              },
              {
                key: "status",
                header: "Status",
                className: "text-right",
                cell: (s) => (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      s.isActive
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {s.isActive ? "Active" : "Expired"}
                  </span>
                ),
              },
              {
                key: "activated",
                header: "Activated",
                className: "text-right text-gray-500 text-xs tabular-nums",
                cell: (s) => s.createdAt.toLocaleDateString(),
              },
            ]}
          />
        )}
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-500">
          <TrendingUp className="w-3 h-3 inline-block mr-1" />
          Tip: Plans are evaluated by <strong>accessLevel</strong>. Tasks with <code>requiredAccessLevel ≥ N</code> only show to users on plans with <code>accessLevel ≥ N</code>.
        </p>
      </div>
    </div>
  );
}

function countEnabledFlags(pkg: {
  tasksEnabled: boolean;
  socialFeedEnabled: boolean;
  referralsEnabled: boolean;
  withdrawalsEnabled: boolean;
  marketplaceEnabled: boolean;
  boostEnabled: boolean;
  dailyMissionEnabled: boolean;
  lotteryEnabled: boolean;
  coursesEnabled: boolean;
  advertiserEnabled: boolean;
  gamesEnabled: boolean;
  adFree: boolean;
  socialTasksEnabled: boolean;
  proxyTasksEnabled: boolean;
  articleTasksEnabled: boolean;
  videoTasksEnabled: boolean;
  quizTasksEnabled: boolean;
  surveyTasksEnabled: boolean;
  offerwallTasksEnabled: boolean;
  appInstallEnabled: boolean;
}) {
  return [
    pkg.tasksEnabled,
    pkg.socialFeedEnabled,
    pkg.referralsEnabled,
    pkg.withdrawalsEnabled,
    pkg.marketplaceEnabled,
    pkg.boostEnabled,
    pkg.dailyMissionEnabled,
    pkg.lotteryEnabled,
    pkg.coursesEnabled,
    pkg.advertiserEnabled,
    pkg.gamesEnabled,
    pkg.socialTasksEnabled,
    pkg.proxyTasksEnabled,
    pkg.articleTasksEnabled,
    pkg.videoTasksEnabled,
    pkg.quizTasksEnabled,
    pkg.surveyTasksEnabled,
    pkg.offerwallTasksEnabled,
    pkg.appInstallEnabled,
  ].filter(Boolean).length;
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "indigo" | "purple" | "amber" | "emerald";
  value: string | number;
  label: string;
}) {
  const cls = {
    indigo: "bg-indigo-500/10 text-indigo-400",
    purple: "bg-purple-500/10 text-purple-400",
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
  }[tone];
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
