import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Shield,
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Search,
  Activity,
  Key,
  Check,
  Minus,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import {
  hasPermission,
  type UserRole,
  ADMIN_ROLES,
  ROLE_CONFIG,
  ROLE_PERMISSIONS,
} from "@/lib/rbac";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { AdminTableShell } from "@/components/admin/ui/admin-table-shell";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    role?: string;
    search?: string;
    view?: string;
  }>;
}

type ViewId = "admins" | "activity" | "roles";

const VIEW_TABS: Array<{ id: ViewId; label: string; icon: typeof Shield }> = [
  { id: "admins", label: "Admin Accounts", icon: Users },
  { id: "activity", label: "Activity Log", icon: Activity },
  { id: "roles", label: "Roles & Permissions", icon: Key },
];

const PERMISSION_CATEGORIES: Array<{ label: string; permissions: string[] }> = [
  {
    label: "Users & KYC",
    permissions: [
      "users.view",
      "users.edit",
      "users.ban",
      "users.delete",
      "users.adjust_balance",
      "users.impersonate",
      "kyc.view",
      "kyc.approve",
      "kyc.reject",
    ],
  },
  {
    label: "Content & Earning",
    permissions: [
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "tasks.delete",
      "submissions.view",
      "submissions.approve",
      "submissions.reject",
      "boards.view",
      "courses.view",
      "courses.manage",
      "quizzes.view",
      "quizzes.manage",
      "missions.view",
      "missions.manage",
      "lottery.view",
      "lottery.manage",
    ],
  },
  {
    label: "Finance",
    permissions: [
      "withdrawals.view",
      "withdrawals.process",
      "withdrawals.approve",
      "withdrawals.reject",
      "payment_methods.view",
      "payment_methods.manage",
      "packages.view",
      "packages.edit",
      "referrals.view",
      "referrals.configure",
    ],
  },
  {
    label: "Marketplace & Social",
    permissions: [
      "marketplace.view",
      "marketplace.manage",
      "marketplace.disputes",
      "social.moderate",
      "moderation.view",
      "moderation.manage",
    ],
  },
  {
    label: "Marketing",
    permissions: [
      "campaigns.view",
      "campaigns.manage",
      "notifications.view",
      "notifications.send",
      "banners.view",
      "banners.manage",
      "ads.view",
      "ads.manage",
      "landing.view",
      "landing.edit",
      "ticker.view",
      "ticker.edit",
    ],
  },
  {
    label: "System",
    permissions: [
      "analytics.view",
      "analytics.export",
      "ai.view",
      "ai.manage",
      "settings.view",
      "settings.edit",
      "admins.view",
      "admins.manage",
      "logs.view",
      "fraud.view",
      "fraud.manage",
      "proxy.view",
      "proxy.manage",
      "media.view",
      "media.manage",
      "leaderboards.view",
      "leaderboards.manage",
      "offerwalls.view",
      "offerwalls.manage",
    ],
  },
];

export default async function AdminAccessPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "admins.view")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const view: ViewId = (VIEW_TABS.find((t) => t.id === params.view)?.id ??
    "admins") as ViewId;
  const page = Math.max(1, parseInt(params.page || "1"));
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const roleFilter = params.role || "";
  const searchQuery = params.search || "";

  // Activity log fetch (only for activity tab)
  const activityLogs =
    view === "activity"
      ? await prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [];
  const activityActorIds = Array.from(
    new Set(activityLogs.map((l) => l.userId).filter((v): v is string => !!v))
  );
  const activityActors = activityActorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: activityActorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const actorMap = new Map(activityActors.map((a) => [a.id, a]));

  // Stats counts for top cards
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [activeAdmins, suspendedAdmins, recentLogs] = await Promise.all([
    prisma.user.count({
      where: { role: { in: ADMIN_ROLES.filter((r) => r !== "USER") }, status: "ACTIVE" },
    }),
    prisma.user.count({
      where: { role: { in: ADMIN_ROLES.filter((r) => r !== "USER") }, status: "SUSPENDED" },
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),
  ]);

  // Build where clause
  const where: Record<string, unknown> = {
    role: { in: ADMIN_ROLES },
  };

  if (roleFilter) {
    where.role = roleFilter as UserRole;
  }

  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  // Fetch admin users
  const [admins, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      take: pageSize,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Get role counts
  const roleCounts = await prisma.user.groupBy({
    by: ["role"],
    where: {
      role: { in: ADMIN_ROLES },
    },
    _count: { id: true },
  });

  // Type assertion for groupBy
  type RoleCount = { role: string; _count: { id: number } };
  const typedRoleCounts = roleCounts as RoleCount[];

  const roleCountMap = typedRoleCounts.reduce((acc, item) => {
    acc[item.role] = item._count.id;
    return acc;
  }, {} as Record<string, number>);

  const totalPages = Math.ceil(totalCount / pageSize);
  const canManage = hasPermission(adminRole, "admins.manage");

  const buildQueryString = (newPage: number, newRole?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (newRole || roleFilter) queryParams.set("role", newRole || roleFilter);
    if (searchQuery) queryParams.set("search", searchQuery);
    return queryParams.toString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Access Control</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage admin accounts, roles, and audit history
          </p>
        </div>
        {canManage && view === "admins" && (
          <Link
            href="/admin/access/invite"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Admin
          </Link>
        )}
      </div>

      {/* 4 Stats per spec */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {activeAdmins + suspendedAdmins}
              </p>
              <p className="text-sm text-slate-500">Total Admins</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {activeAdmins}
              </p>
              <p className="text-sm text-slate-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Minus className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {suspendedAdmins}
              </p>
              <p className="text-sm text-slate-500">Suspended</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {recentLogs}
              </p>
              <p className="text-sm text-slate-500">Activity (7d)</p>
            </div>
          </div>
        </div>
      </div>

      {/* View tabs */}
      <div className="border-b border-slate-800 flex gap-1">
        {VIEW_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={`/admin/access${t.id === "admins" ? "" : `?view=${t.id}`}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 ${
                view === t.id
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ACTIVITY TAB */}
      {view === "activity" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          {activityLogs.length === 0 ? (
            <div className="p-16 text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <h3 className="text-lg font-medium text-white mb-1">
                No activity yet
              </h3>
              <p className="text-sm text-slate-400">
                Admin actions will be logged here
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {activityLogs.map((log) => {
                const actor = log.userId ? actorMap.get(log.userId) : null;
                const actorName =
                  actor?.name ?? actor?.email ?? "system";
                let detailsString: string | null = null;
                if (log.newData && typeof log.newData === "object") {
                  try {
                    detailsString = JSON.stringify(log.newData);
                    if (detailsString.length > 200)
                      detailsString = detailsString.slice(0, 200) + "…";
                  } catch {
                    detailsString = null;
                  }
                }
                return (
                  <li key={log.id} className="px-6 py-4 hover:bg-slate-800/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white">{log.action}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          by{" "}
                          <span className="text-slate-300">{actorName}</span>{" "}
                          on{" "}
                          <span className="text-slate-300">{log.entity}</span>
                          {log.entityId && (
                            <>
                              {" "}
                              ·{" "}
                              <span className="font-mono text-slate-400">
                                {log.entityId.slice(0, 8)}
                              </span>
                            </>
                          )}
                        </p>
                        {detailsString && (
                          <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                            {detailsString}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                        {format(log.createdAt, "MMM d, HH:mm")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ROLES & PERMISSIONS TAB */}
      {view === "roles" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 overflow-x-auto">
          <h2 className="text-lg font-semibold text-white mb-1">
            Permission Matrix
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Cells with ✓ mean the role has that permission. Edit code-level
            permissions in <code className="text-slate-300">src/lib/rbac.ts</code>.
          </p>

          {PERMISSION_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-6">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">
                {cat.label}
              </p>
              <AdminTableShell className="rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">
                        Permission
                      </th>
                      {ADMIN_ROLES.filter((r) => r !== "USER").map((r) => {
                        const c = ROLE_CONFIG[r];
                        return (
                          <th
                            key={r}
                            className={`px-2 py-2 text-center text-xs ${c.color}`}
                          >
                            {c.label.replace(" Admin", "")}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {cat.permissions.map((perm) => (
                      <tr key={perm} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-xs text-slate-300">
                          {perm}
                        </td>
                        {ADMIN_ROLES.filter((r) => r !== "USER").map((r) => {
                          const has = ROLE_PERMISSIONS[r].includes(
                            perm as never
                          );
                          return (
                            <td
                              key={r}
                              className="px-2 py-2 text-center"
                            >
                              {has ? (
                                <Check className="w-4 h-4 text-emerald-400 inline" />
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableShell>
            </div>
          ))}
        </div>
      )}

      {/* ADMINS TAB */}
      {view === "admins" && (
        <>

      {/* Old role-count stats kept as quick filters */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {ADMIN_ROLES.filter(r => r !== "USER").map((role) => {
          const config = ROLE_CONFIG[role];
          return (
            <Link
              key={role}
              href={`/admin/access?${buildQueryString(1, role)}`}
              className={`bg-gray-900 rounded-xl border p-4 transition-colors ${
                roleFilter === role
                  ? "border-indigo-500"
                  : "border-gray-800 hover:border-gray-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.bgColor}`}>
                  <Shield className={`w-4 h-4 ${config.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">
                    {roleCountMap[role] || 0}
                  </p>
                  <p className="text-xs text-gray-500">{config.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <form className="flex-1 max-w-md" action="/admin/access" method="GET">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Search admins..."
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
            />
            {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
          </div>
        </form>

        <div className="flex gap-2">
          <Link
            href="/admin/access"
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              !roleFilter
                ? "bg-indigo-500 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            All Roles
          </Link>
        </div>
      </div>

      {/* Admin List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {admins.length > 0 ? (
          <AdminTable
            bare
            rows={admins}
            getRowKey={(admin) => admin.id}
            columns={[
              {
                key: "admin",
                header: "Admin",
                primary: true,
                cell: (admin) => (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
                      {admin.name?.charAt(0) || admin.email.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">
                        {admin.name || "Unnamed"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{admin.email}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: "role",
                header: "Role",
                cell: (admin) => {
                  const roleConfig = ROLE_CONFIG[admin.role as UserRole];
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleConfig.bgColor} ${roleConfig.color}`}
                    >
                      <Shield className="w-3 h-3" />
                      {roleConfig.label}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                cell: (admin) => (
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      admin.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : admin.status === "SUSPENDED"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {admin.status}
                  </span>
                ),
              },
              {
                key: "lastLogin",
                header: "Last Login",
                mobileHidden: true,
                cell: (admin) => (
                  <span className="text-sm text-gray-400">
                    {admin.lastLoginAt
                      ? formatDistanceToNow(new Date(admin.lastLoginAt), {
                          addSuffix: true,
                        })
                      : "Never"}
                  </span>
                ),
              },
              {
                key: "joined",
                header: "Joined",
                mobileHidden: true,
                cell: (admin) => (
                  <span className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(admin.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                ),
              },
              ...(canManage
                ? [
                    {
                      key: "actions",
                      header: "Actions",
                      cell: (admin: (typeof admins)[number]) => (
                        <Link
                          href={`/admin/users/${admin.id}/edit`}
                          className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Manage
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No admins found</h3>
            <p className="text-gray-400">
              {searchQuery
                ? "Try adjusting your search criteria"
                : "Invite team members to help manage the platform"}
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of{" "}
              {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/access?${buildQueryString(page - 1)}` : "#"}
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
                  page < totalPages
                    ? `/admin/access?${buildQueryString(page + 1)}`
                    : "#"
                }
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page < totalPages
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

        </>
      )}
    </div>
  );
}
