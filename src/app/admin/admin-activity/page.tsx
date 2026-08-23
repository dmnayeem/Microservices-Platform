/* eslint-disable react-hooks/purity -- This is an async Server Component: it
   runs once per request on the server and is never hydrated, so `Date.now()`
   here is not an impure render. The React Compiler lint rule cannot tell a
   Server Component from a Client one, so it flags every call. Do not "fix" this
   by passing the time in as a prop — the value is needed to build the database
   query, before any rendering happens. */
import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import Link from "next/link";
import { ShieldAlert, ChevronLeft, ChevronRight, Users, Activity, Clock } from "lucide-react";
import { ADMIN_ROLES, isSuperAdmin, type UserRole } from "@/lib/rbac";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { ActivityFilterBar } from "@/components/admin/activity/activity-filter-bar";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    actor?: string;
    action?: string;
    q?: string;
    days?: string;
  }>;
}

// Color a badge by the "verb" in the action code.
function actionTone(action: string): string {
  const a = action.toUpperCase();
  if (/(APPROVE|PAID|ADD|CREATE|GRANT|UNBAN|RESTORE)/.test(a))
    return "text-emerald-400 bg-emerald-500/10";
  if (/(REJECT|BAN|DELETE|DEDUCT|PENALTY|REMOVE|SUSPEND)/.test(a))
    return "text-red-400 bg-red-500/10";
  if (/(UPDATE|EDIT|CHANGE|REVISION)/.test(a))
    return "text-blue-400 bg-blue-500/10";
  return "text-gray-300 bg-gray-500/10";
}

export default async function AdminActivityPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  // Super-admin-only oversight surface.
  if (!isSuperAdmin(role)) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;
  const actorFilter = params.actor || "";
  const actionFilter = params.action || "";
  const q = (params.q || "").trim();
  const days = params.days ? parseInt(params.days) : 0;

  // Every admin/staff user — the actor pool the feed is scoped to.
  const adminUsers = await prisma.user.findMany({
    where: { role: { in: ADMIN_ROLES } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  const adminIds = adminUsers.map((u) => u.id);
  const adminMap = new Map(adminUsers.map((u) => [u.id, u]));

  // Optional target-user search → resolve to ids.
  let targetIds: string[] | null = null;
  if (q) {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { id: q },
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    targetIds = matches.map((m) => m.id);
    if (targetIds.length === 0) targetIds = ["__none__"];
  }

  const since =
    days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const where: Record<string, unknown> = {
    userId: actorFilter ? actorFilter : { in: adminIds.length ? adminIds : ["__none__"] },
  };
  if (actionFilter) where.action = actionFilter;
  if (since) where.createdAt = { gte: since };
  if (targetIds) {
    where.OR = [
      { targetUserId: { in: targetIds } },
      { entityId: { in: targetIds } },
    ];
  }

  const [logs, totalCount, todayCount, actionGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({
      where: {
        userId: { in: adminIds.length ? adminIds : ["__none__"] },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { userId: { in: adminIds.length ? adminIds : ["__none__"] } },
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 60,
    }) as unknown as Promise<{ action: string; _count: { action: number } }[]>,
  ]);

  // Resolve target-user display for the visible rows.
  const targetUserIds = [
    ...new Set(
      logs
        .map((l) => l.targetUserId ?? (l.entity === "User" ? l.entityId : null))
        .filter(Boolean) as string[]
    ),
  ];
  const targetUsers = targetUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const targetMap = new Map(targetUsers.map((u) => [u.id, u]));

  const totalPages = Math.ceil(totalCount / pageSize);
  const distinctAdmins = new Set(logs.map((l) => l.userId)).size;
  const topAction = actionGroups[0]?.action ?? "—";

  const buildQuery = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("page", String(p));
    if (actorFilter) sp.set("actor", actorFilter);
    if (actionFilter) sp.set("action", actionFilter);
    if (q) sp.set("q", q);
    if (params.days) sp.set("days", params.days);
    return sp.toString();
  };

  const stats = [
    { label: "Actions (filter)", value: totalCount.toLocaleString(), icon: Activity, tone: "text-indigo-400 bg-indigo-500/10" },
    { label: "Today", value: todayCount.toLocaleString(), icon: Clock, tone: "text-emerald-400 bg-emerald-500/10" },
    { label: "Admins in view", value: distinctAdmins.toLocaleString(), icon: Users, tone: "text-blue-400 bg-blue-500/10" },
    { label: "Top action", value: topAction, icon: ShieldAlert, tone: "text-amber-400 bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-red-500/10 text-red-400 grid place-items-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Activity</h1>
          <p className="text-sm text-gray-400">
            Every action other admins take — grants, approvals, edits. Super-admin only.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.tone.split(" ")[1]}`}>
                <s.icon className={`w-5 h-5 ${s.tone.split(" ")[0]}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-white truncate">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <ActivityFilterBar
        basePath="/admin/admin-activity"
        admins={adminUsers.map((u) => ({ id: u.id, label: `${u.name || u.email} · ${u.role}` }))}
        actions={actionGroups.map((a) => a.action)}
        current={{ actor: actorFilter, action: actionFilter, q, days: params.days }}
        searchLabel="Filter by affected user (name / email / id)"
      />

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {logs.length > 0 ? (
          <AdminTable
            bare
            rows={logs}
            getRowKey={(l) => l.id}
            columns={[
              {
                key: "when",
                header: "When",
                cell: (l) => (
                  <div>
                    <p className="text-sm text-white">{format(new Date(l.createdAt), "MMM d, yyyy")}</p>
                    <p className="text-xs text-gray-500">{format(new Date(l.createdAt), "h:mm:ss a")}</p>
                  </div>
                ),
              },
              {
                key: "admin",
                header: "Admin",
                cell: (l) => {
                  const a = l.userId ? adminMap.get(l.userId) : null;
                  return a ? (
                    <Link href={`/admin/users/${a.id}`} className="text-sm text-white hover:text-indigo-400">
                      {a.name || a.email}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-500">System</span>
                  );
                },
              },
              {
                key: "action",
                header: "Action",
                primary: true,
                cell: (l) => (
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${actionTone(l.action)}`}>
                    {l.action}
                  </span>
                ),
              },
              {
                key: "target",
                header: "Target user",
                mobileHidden: true,
                cell: (l) => {
                  const tid = l.targetUserId ?? (l.entity === "User" ? l.entityId : null);
                  const t = tid ? targetMap.get(tid) : null;
                  return t ? (
                    <Link href={`/admin/users/${t.id}?tab=activity`} className="text-sm text-white hover:text-indigo-400">
                      {t.name || t.email}
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500">{l.entity}{l.entityId ? ` · ${l.entityId.slice(0, 8)}…` : ""}</span>
                  );
                },
              },
              {
                key: "summary",
                header: "Details",
                cell: (l) => (
                  <div className="max-w-sm">
                    <p className="text-sm text-gray-300 truncate">{l.summary || "—"}</p>
                    {l.ipAddress && <p className="text-[11px] text-gray-600">IP {l.ipAddress}</p>}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No admin activity</h3>
            <p className="text-gray-400">Try adjusting the filters, or actions will appear here as admins work.</p>
          </div>
        )}

        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1}–{Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/admin-activity?${buildQuery(page - 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${page > 1 ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-800/50 text-gray-600 cursor-not-allowed"}`}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Link>
              <Link
                href={page < totalPages ? `/admin/admin-activity?${buildQuery(page + 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${page < totalPages ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-800/50 text-gray-600 cursor-not-allowed"}`}
              >
                Next <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
