import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Shield, ChevronLeft, ChevronRight, User, Settings, Wallet, Package, Store, Ticket, Bell, Activity } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    entity?: string;
    action?: string;
    userId?: string;
  }>;
}

const ENTITY_CONFIG: Record<string, { label: string; icon: typeof User; color: string }> = {
  USER: { label: "User", icon: User, color: "text-blue-400 bg-blue-500/10" },
  TASK: { label: "Task", icon: Activity, color: "text-emerald-400 bg-emerald-500/10" },
  WITHDRAWAL: { label: "Withdrawal", icon: Wallet, color: "text-purple-400 bg-purple-500/10" },
  PACKAGE: { label: "Package", icon: Package, color: "text-amber-400 bg-amber-500/10" },
  MARKETPLACE: { label: "Marketplace", icon: Store, color: "text-pink-400 bg-pink-500/10" },
  LOTTERY: { label: "Lottery", icon: Ticket, color: "text-indigo-400 bg-indigo-500/10" },
  NOTIFICATION: { label: "Notification", icon: Bell, color: "text-cyan-400 bg-cyan-500/10" },
  SETTINGS: { label: "Settings", icon: Settings, color: "text-gray-400 bg-gray-500/10" },
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "text-emerald-400 bg-emerald-500/10",
  UPDATE: "text-blue-400 bg-blue-500/10",
  DELETE: "text-red-400 bg-red-500/10",
  APPROVE: "text-green-400 bg-green-500/10",
  REJECT: "text-orange-400 bg-orange-500/10",
  LOGIN: "text-indigo-400 bg-indigo-500/10",
  LOGOUT: "text-gray-400 bg-gray-500/10",
};

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "logs.view"))) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;
  const entityFilter = params.entity || "";
  const actionFilter = params.action || "";
  const userIdFilter = params.userId || "";

  // Build where clause
  const where: Record<string, unknown> = {};
  if (entityFilter) {
    where.entity = entityFilter;
  }
  if (actionFilter) {
    where.action = { contains: actionFilter, mode: "insensitive" };
  }
  if (userIdFilter) {
    where.userId = userIdFilter;
  }

  // Fetch logs with pagination
  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Get user info for logs
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {} as Record<string, typeof users[0]>);

  // Get unique entities for filter
  const entities = await prisma.auditLog.groupBy({
    by: ["entity"],
    _count: { id: true },
  });
  type EntityCount = { entity: string; _count: { id: number } };
  const typedEntities = entities as EntityCount[];

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildQueryString = (newPage: number, newEntity?: string, newAction?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (newEntity !== undefined) {
      if (newEntity) queryParams.set("entity", newEntity);
    } else if (entityFilter) {
      queryParams.set("entity", entityFilter);
    }
    if (newAction !== undefined) {
      if (newAction) queryParams.set("action", newAction);
    } else if (actionFilter) {
      queryParams.set("action", actionFilter);
    }
    if (userIdFilter) queryParams.set("userId", userIdFilter);
    return queryParams.toString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-gray-400 mt-1">
          Track all administrative actions and system events
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalCount.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Logs</p>
            </div>
          </div>
        </div>
        {typedEntities.slice(0, 3).map((entity) => {
          const config = ENTITY_CONFIG[entity.entity] || ENTITY_CONFIG.USER;
          const Icon = config.icon;
          return (
            <div key={entity.entity} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.color.split(" ")[1]}`}>
                  <Icon className={`w-5 h-5 ${config.color.split(" ")[0]}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{entity._count.id}</p>
                  <p className="text-sm text-gray-500">{config.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/logs"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            !entityFilter
              ? "bg-indigo-500 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All Entities
        </Link>
        {typedEntities.map((entity) => {
          const config = ENTITY_CONFIG[entity.entity] || ENTITY_CONFIG.USER;
          return (
            <Link
              key={entity.entity}
              href={`/admin/logs?${buildQueryString(1, entity.entity, "")}`}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                entityFilter === entity.entity
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {config.label} ({entity._count.id})
            </Link>
          );
        })}
      </div>

      {/* Logs Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {logs.length > 0 ? (
          <AdminTable
            bare
            rows={logs}
            getRowKey={(log) => log.id}
            columns={[
              {
                key: "timestamp",
                header: "Timestamp",
                cell: (log) => (
                  <div>
                    <p className="text-sm text-white">
                      {format(new Date(log.createdAt), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(log.createdAt), "h:mm:ss a")}
                    </p>
                  </div>
                ),
              },
              {
                key: "user",
                header: "User",
                cell: (log) => {
                  const user = log.userId ? userMap[log.userId] : null;
                  return user ? (
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-sm text-white hover:text-indigo-400"
                    >
                      {user.name || user.email}
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
                cell: (log) => {
                  const actionColor =
                    ACTION_COLORS[log.action.toUpperCase()] || ACTION_COLORS.UPDATE;
                  return (
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${actionColor}`}
                    >
                      {log.action}
                    </span>
                  );
                },
              },
              {
                key: "entity",
                header: "Entity",
                mobileHidden: true,
                cell: (log) => {
                  const entityConfig =
                    ENTITY_CONFIG[log.entity] || ENTITY_CONFIG.USER;
                  const EntityIcon = entityConfig.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <EntityIcon className={`w-4 h-4 ${entityConfig.color.split(" ")[0]}`} />
                      <span className="text-sm text-white">{entityConfig.label}</span>
                      {log.entityId && (
                        <code className="text-xs text-gray-500 bg-gray-800 px-1 rounded">
                          {log.entityId.slice(0, 8)}...
                        </code>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "details",
                header: "Details",
                mobileHidden: true,
                cell: (log) => (
                  <div className="text-xs text-gray-500 max-w-xs truncate">
                    {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No logs found</h3>
            <p className="text-gray-400">
              {entityFilter || actionFilter
                ? "Try adjusting your filters"
                : "Audit logs will appear here as actions occur"}
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/logs?${buildQueryString(page - 1)}` : "#"}
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
                    ? `/admin/logs?${buildQueryString(page + 1)}`
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
    </div>
  );
}
