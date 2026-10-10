import { parsePage } from "@/lib/paginate";
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
  BookOpen,
  ExternalLink,
  UserCircle2,
  PanelsTopLeft,
  BadgeCheck,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { DesignationAccessEditor } from "@/components/admin/access/designation-access-editor";
import { getRoleMoney } from "@/lib/role-money";
import { FINANCE_MODERATOR_CEILING, type Permission } from "@/lib/rbac";
import { isSuperAdmin, type UserRole, ADMIN_ROLES, ROLE_CONFIG, ROLE_PERMISSIONS, PERMISSION_CATALOG, FINANCE_PERMISSIONS, SUPERADMIN_ONLY_PERMISSIONS, ROLE_META, permissionLabel, permissionDescription, ADMIN_MODULES, CATEGORY_LABELS, CATEGORY_ORDER, stripProtectedForRole, customRolePermissionsForEditor } from "@/lib/rbac";
import { FEATURES } from "@/lib/features";
import { AccessCatalog } from "@/components/admin/access/access-catalog";
import {
  getRolePermissionConfig,
  can,
  getAdminModuleRules,
  getConfiguredRolePermissions,
} from "@/lib/permissions";
import {
  CONFIGURABLE_ADMIN_ROLES,
  isConfigurableModule,
  isLockedModule,
  modulesSharingPermissions,
} from "@/lib/admin-module-rules";
import { AdminPagesEditor } from "@/components/admin/access/admin-pages-editor";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { RolePermissionEditor } from "@/components/admin/access/role-permission-editor";
import { CustomRolesManager } from "@/components/admin/access/custom-roles-manager";

// Group labels for the user-facing feature bands in the catalog tab.
const FEATURE_GROUP_LABELS: Record<string, string> = {
  section: "App sections a customer can open",
  creator: "Money-making capabilities you grant a customer",
  task: "Task types a customer may publish",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    role?: string;
    search?: string;
    view?: string;
  }>;
}

type ViewId = "admins" | "designations" | "activity" | "roles" | "pages" | "catalog";

const VIEW_TABS: Array<{ id: ViewId; label: string; icon: typeof Shield }> = [
  { id: "admins", label: "Admin Accounts", icon: Users },
  { id: "designations", label: "By designation", icon: BadgeCheck },
  { id: "roles", label: "Roles & Permissions", icon: Key },
  { id: "pages", label: "Admin pages", icon: PanelsTopLeft },
  { id: "catalog", label: "What Everything Does", icon: BookOpen },
  { id: "activity", label: "Activity Log", icon: Activity },
];

export default async function AdminAccessPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!(await can(session.user.id, "admins.view"))) {
    redirect("/admin");
  }

  const params = await searchParams;
  const view: ViewId = (VIEW_TABS.find((t) => t.id === params.view)?.id ??
    "admins") as ViewId;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const roleFilter = params.role || "";
  const searchQuery = params.search || "";

  // Saved role→permission overrides (for the editable Roles & Permissions tab).
  const savedRolePerms = view === "roles" ? await getRolePermissionConfig() : {};

  // Admin pages tab: the page rules, plus which pages each role's permissions
  // reach at all (a role that can't open a page has nothing to hide).
  const pagesTab =
    view === "pages"
      ? await (async () => {
          const [rules, configured] = await Promise.all([
            getAdminModuleRules(),
            getConfiguredRolePermissions(),
          ]);
          const sharing = modulesSharingPermissions();
          const groups = CATEGORY_ORDER.map((category) => ({
            label: CATEGORY_LABELS[category],
            modules: ADMIN_MODULES.filter((m) => m.category === category).map((m) => ({
              href: m.href,
              name: m.name,
              icon: m.icon,
              configurable: isConfigurableModule(m),
              lockedReason: isLockedModule(m.href)
                ? "always on"
                : m.superAdminOnly
                  ? "super admin only"
                  : null,
              sharesWith: sharing[m.href] ?? [],
            })),
          })).filter((g) => g.modules.length > 0);
          const roleReach = Object.fromEntries(
            CONFIGURABLE_ADMIN_ROLES.map((r) => {
              const perms = stripProtectedForRole(new Set(configured[r]), r, []);
              return [
                r,
                ADMIN_MODULES.filter((m) => m.permissions.some((p) => perms.has(p))).map(
                  (m) => m.href
                ),
              ];
            })
          );
          return {
            groups,
            roleReach,
            initial: { disabled: rules.disabled, roles: rules.roles as Record<string, string[]> },
            roles: CONFIGURABLE_ADMIN_ROLES.map((r) => ({ role: r, label: ROLE_CONFIG[r].label })),
          };
        })()
      : null;
  // By designation: every staff designation with everything it gets, in one
  // place (components/admin/access/designation-access-editor.tsx).
  const designationTab =
    view === "designations"
      ? await (async () => {
          const [configured, rules, roleMoney, customs, counts, isSuper] = await Promise.all([
            getConfiguredRolePermissions(),
            getAdminModuleRules(),
            getRoleMoney(),
            prisma.customRole.findMany({
              where: { isActive: true },
              orderBy: { name: "asc" },
              select: { id: true, name: true, permissions: true, _count: { select: { users: true } } },
            }) as unknown as Promise<{ id: string; name: string; permissions: string[]; _count: { users: number } }[]>,
            prisma.user.groupBy({
              by: ["role"],
              where: { role: { in: CONFIGURABLE_ADMIN_ROLES }, customRoleId: null },
              _count: { _all: true },
            }) as unknown as Promise<{ role: string; _count: { _all: number } }[]>,
            prisma.user
              .findUnique({ where: { id: session.user.id }, select: { role: true } })
              .then((u) => u?.role === "SUPER_ADMIN"),
          ]);
          const money = new Set<string>(FINANCE_PERMISSIONS);
          const staffOnly = new Set<string>(SUPERADMIN_ONLY_PERMISSIONS);
          // What a designation really holds: money only through the designation
          // money row (or its own set for the finance roles), as the engine does.
          const shown = (role: UserRole, set: Iterable<string>, key: string) => {
            const out = new Set<string>(set);
            if (role !== "FINANCE_ADMIN") {
              for (const p of money) {
                const ceiling = role === "FINANCE_MODERATOR" && FINANCE_MODERATOR_CEILING.includes(p as Permission);
                if (!ceiling) out.delete(p);
              }
            }
            for (const p of roleMoney[key] ?? []) out.add(p);
            if (role !== "MANAGER") for (const p of staffOnly) out.delete(p);
            out.delete("users.adjust_balance");
            return [...out];
          };
          const notOfferedFor = (role: UserRole | "custom") =>
            role === "MANAGER" ? ["users.adjust_balance"] : [...staffOnly, "users.adjust_balance"];
          const designations = [
            ...CONFIGURABLE_ADMIN_ROLES.map((r) => ({
              key: r as string,
              label: ROLE_CONFIG[r].label,
              kind: "role" as const,
              staff: counts.find((c) => c.role === r)?._count._all ?? 0,
              permissions: shown(r, configured[r], r),
              hiddenPages: rules.roles[r] ?? [],
              defaults: shown(r, ROLE_PERMISSIONS[r], "__default__"),
              notOffered: notOfferedFor(r),
            })),
            ...customs.map((c) => {
              const key = `custom:${c.id}`;
              return {
                key,
                label: c.name,
                kind: "custom" as const,
                staff: c._count.users,
                permissions: shown("ADMIN", customRolePermissionsForEditor(c.permissions), key),
                hiddenPages: rules.customRoles?.[c.id] ?? [],
                defaults: null,
                notOffered: notOfferedFor("custom"),
              };
            }),
          ];
          const groups = PERMISSION_CATALOG.map((g) => ({
            label: g.label,
            permissions: g.permissions.map((p) => ({
              key: p,
              label: permissionLabel(p),
              description: permissionDescription(p) ?? "",
              money: money.has(p),
            })),
          }));
          const pages = CATEGORY_ORDER.flatMap((category) =>
            ADMIN_MODULES.filter((m) => m.category === category && isConfigurableModule(m)).map((m) => ({
              href: m.href,
              name: m.name,
              group: CATEGORY_LABELS[category],
              permissions: m.permissions as string[],
              offForAll: rules.disabled.includes(m.href),
            }))
          );
          return { designations, groups, pages, canEdit: isSuper };
        })()
      : null;

  const customRolesRaw =
    view === "roles"
      ? await prisma.customRole.findMany({
          orderBy: { name: "asc" },
          include: { _count: { select: { users: true } } },
        })
      : [];
  const customRoles = (
    customRolesRaw as unknown as Array<{
      id: string;
      name: string;
      color: string | null;
      permissions: string[];
      isActive: boolean;
      _count: { users: number };
    }>
  ).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    permissions: customRolePermissionsForEditor(r.permissions),
    isActive: r.isActive,
    userCount: r._count.users,
  }));

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
  const canManage = await can(session.user.id, "admins.manage");

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
          <h1 className="text-2xl font-bold text-white">Access Control</h1>
          <p className="text-slate-400 text-sm mt-1">
            One place for staff roles, admin permissions, customer features and
            the reports on who changed what.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* The two reports that already exist, reachable from here rather
              than only from the sidebar — the owner asked for both to be
              findable from the access page. */}
          <Link
            href="/admin/admin-activity"
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-700 text-slate-300 rounded-lg hover:text-white hover:border-slate-600 transition-colors text-sm"
          >
            <Shield className="w-4 h-4" />
            Admin report
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
          <Link
            href="/admin/user-activity"
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-700 text-slate-300 rounded-lg hover:text-white hover:border-slate-600 transition-colors text-sm"
          >
            <UserCircle2 className="w-4 h-4" />
            User report
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
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

      {/* BY DESIGNATION */}
      {view === "designations" && designationTab && (
        <DesignationAccessEditor
          designations={designationTab.designations}
          groups={designationTab.groups}
          pages={designationTab.pages}
          canEdit={designationTab.canEdit}
        />
      )}

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

      {/* WHAT EVERYTHING DOES — the searchable, plain-language reference across
          BOTH access systems. It explains; it does not edit. Editing staff
          access happens on the Roles tab and on each staff account; editing a
          customer's capabilities happens on that customer's user record. The
          two enforcement paths stay separate — only the explanation is
          unified, which is what the owner actually asked for. */}
      {view === "catalog" && (
        <AccessCatalog
          permissions={PERMISSION_CATALOG.flatMap((c) =>
            c.permissions.map((p) => ({
              key: p,
              label: permissionLabel(p),
              description:
                permissionDescription(p) ??
                "No description yet — add one in PERMISSION_META (src/lib/rbac.ts).",
              group: c.label,
            }))
          )}
          features={FEATURES.map((f) => ({
            key: f.key,
            label: f.label,
            description: f.description,
            group: FEATURE_GROUP_LABELS[f.group] ?? f.group,
          }))}
        />
      )}

      {/* ROLES & PERMISSIONS TAB — super-admin editable (module toggles + advanced) */}
      {view === "roles" &&
        (() => {
          // Editable roles = admin roles minus SUPER_ADMIN (always full).
          const editableRoles = ADMIN_ROLES.filter(
            (r) => r !== "SUPER_ADMIN"
          ).map((r) => ({
            role: r,
            label: ROLE_CONFIG[r].label,
            color: ROLE_CONFIG[r].color,
            bgColor: ROLE_CONFIG[r].bgColor,
          }));
          const defaults = Object.fromEntries(
            editableRoles.map((r) => [r.role, ROLE_PERMISSIONS[r.role as UserRole]])
          );
          // Use the canonical permission catalog (rbac.ts) — the single source of
          // truth, already grouped and inclusive of every key (finance.view,
          // task-create subtypes, marketplace.mediate, etc.).
          const editorCategories = PERMISSION_CATALOG.map((c) => ({
            label: c.label,
            permissions: [...c.permissions],
          }));
          // Finance is hidden for every editable role except FINANCE_ADMIN;
          // admins.manage is hidden for all (super-admin-only). Never offered.
          const hiddenPermsByRole = Object.fromEntries(
            editableRoles.map((r) => [
              r.role,
              [
                ...SUPERADMIN_ONLY_PERMISSIONS,
                ...(r.role === "FINANCE_ADMIN" ? [] : FINANCE_PERMISSIONS),
              ],
            ])
          );
          return (
            <div className="space-y-6">
              {/* Every role, in one list, with a line saying what it does.
                  Employees first, then customers — the owner's line between
                  "people who work here" and "people who use it". */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">
                    Every role, and what it actually does
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    The violet block is staff — platform employees. The grey
                    block is clients — the customers who use the platform.
                  </p>
                </header>
                {(["staff", "client"] as const).map((kind) => (
                  <div key={kind} className="px-4 py-3 border-b border-slate-800 last:border-b-0">
                    <p className="text-[11px] uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5 text-slate-400">
                      {kind === "staff" ? (
                        <>
                          <Shield className="w-3.5 h-3.5 text-violet-300" />
                          Platform employees
                        </>
                      ) : (
                        <>
                          <UserCircle2 className="w-3.5 h-3.5 text-slate-400" />
                          Platform clients
                        </>
                      )}
                    </p>
                    <ul className="space-y-2">
                      {(Object.keys(ROLE_META) as UserRole[])
                        .filter((r) => ROLE_META[r].kind === kind)
                        .map((r) => (
                          <li key={r} className="flex flex-col sm:flex-row sm:gap-4">
                            <span
                              className={`shrink-0 sm:w-40 self-start px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_CONFIG[r].bgColor} ${ROLE_CONFIG[r].color}`}
                            >
                              {ROLE_CONFIG[r].label}
                            </span>
                            <p className="text-sm text-slate-400 flex-1 mt-1 sm:mt-0">
                              {ROLE_META[r].description}
                            </p>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              <RolePermissionEditor
                editableRoles={editableRoles}
                categories={editorCategories}
                defaults={defaults as Record<string, string[]>}
                config={savedRolePerms as Record<string, string[]>}
                canManage={isSuperAdmin(adminRole)}
                hiddenPermsByRole={hiddenPermsByRole as Record<string, string[]>}
              />
              <CustomRolesManager
                initial={customRoles}
                canManage={isSuperAdmin(adminRole)}
              />
            </div>
          );
        })()}

      {/* ADMIN PAGES TAB — which admin pages exist, for all admins / per role */}
      {view === "pages" && pagesTab && (
        <AdminPagesEditor
          groups={pagesTab.groups}
          roles={pagesTab.roles}
          initial={pagesTab.initial}
          roleReach={pagesTab.roleReach}
          canManage={isSuperAdmin(adminRole)}
        />
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
