import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parsePage } from "@/lib/paginate";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Trash2,
  Archive,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AdminTable } from "@/components/admin/ui/admin-table";
import {
  TASK_REMOVAL_ACTIONS,
  readTaskSnapshot,
  taskActionTone,
  TASK_ACTION_LABEL,
} from "@/lib/task-audit";

/**
 * Tasks that are no longer in the catalogue, and who removed them.
 *
 * This page exists because a task with no submissions is HARD-deleted: the row
 * is gone, so there is no card to hang an "archived by" badge on and no list
 * that could ever show it again. The audit row — with the snapshot taken just
 * before the delete — is the only surviving record that the task existed at
 * all, which makes this the only place "who deleted it" can be answered.
 *
 * Archived tasks appear here too even though their row survives, because from
 * an admin's point of view both answer one question: what left, and who took
 * it out.
 */
export default async function RemovedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // Same gate as the task list. Nothing here is user-facing.
  if (!(await can(session.user.id, "tasks.view"))) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 40;
  const skip = (page - 1) * pageSize;
  const kind =
    params.kind === "deleted"
      ? ["TASK_DELETED"]
      : params.kind === "archived"
        ? ["TASK_ARCHIVED"]
        : [...TASK_REMOVAL_ACTIONS];

  const where = { entity: "Task", action: { in: kind } };

  const [rows, total, deletedCount, archivedCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        action: true,
        summary: true,
        newData: true,
        entityId: true,
        userId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { entity: "Task", action: "TASK_DELETED" } }),
    prisma.auditLog.count({ where: { entity: "Task", action: "TASK_ARCHIVED" } }),
  ]);

  const actorIds = [
    ...new Set(rows.map((r) => r.userId).filter(Boolean)),
  ] as string[];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  // An archived task still has a row, so its title can link somewhere. A
  // deleted one does not — the snapshot is all there is, and a link would 404.
  const archivedIds = rows
    .filter((r) => r.action === "TASK_ARCHIVED" && r.entityId)
    .map((r) => r.entityId as string);
  const stillThere = archivedIds.length
    ? await prisma.task.findMany({
        where: { id: { in: archivedIds } },
        select: { id: true },
      })
    : [];
  const alive = new Set(stillThere.map((t) => t.id));

  const totalPages = Math.ceil(total / pageSize);
  const tabs = [
    { key: "", label: `All (${deletedCount + archivedCount})` },
    { key: "deleted", label: `Deleted (${deletedCount})` },
    { key: "archived", label: `Archived (${archivedCount})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tasks"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
            Removed Tasks
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              <ShieldAlert className="w-3 h-3" /> Admins only
            </span>
          </h1>
          <p className="text-gray-400 text-sm">
            Every task an admin archived or deleted, and who did it. A deleted
            task&apos;s row is gone for good — what you see here is the snapshot
            taken as it was removed.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {tabs.map((t) => {
          const active = (params.kind ?? "") === t.key;
          return (
            <Link
              key={t.key || "all"}
              href={
                t.key
                  ? `/admin/tasks/removed?kind=${t.key}`
                  : "/admin/tasks/removed"
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                active ? "bg-indigo-500 text-white" : "bg-gray-800 text-gray-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {rows.length > 0 ? (
          <AdminTable
            bare
            rows={rows}
            getRowKey={(r) => r.id}
            columns={[
              {
                key: "what",
                header: "What",
                primary: true,
                cell: (r) => {
                  const snap = readTaskSnapshot(r.newData);
                  const linkable =
                    r.action === "TASK_ARCHIVED" &&
                    r.entityId &&
                    alive.has(r.entityId);
                  return (
                    <div className="min-w-0">
                      {linkable ? (
                        <Link
                          href={`/admin/tasks/${r.entityId}`}
                          className="text-white hover:text-indigo-400 font-medium"
                        >
                          {snap?.title ?? "(untitled)"}
                        </Link>
                      ) : (
                        <span className="text-white font-medium">
                          {snap?.title ?? "(title not recorded)"}
                        </span>
                      )}
                      <span className="block text-[11px] text-gray-500">
                        {snap
                          ? `${snap.type} · ${snap.pointsReward} pts · ${snap.completedCount} completed`
                          : "no snapshot recorded"}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "action",
                header: "Action",
                cell: (r) => (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${taskActionTone(
                      r.action
                    )}`}
                  >
                    {r.action === "TASK_DELETED" ? (
                      <Trash2 className="w-3 h-3" />
                    ) : (
                      <Archive className="w-3 h-3" />
                    )}
                    {TASK_ACTION_LABEL[r.action] ?? r.action}
                  </span>
                ),
              },
              {
                key: "who",
                header: "By",
                cell: (r) => {
                  const a = r.userId ? actorMap.get(r.userId) : null;
                  return a ? (
                    <Link
                      href={`/admin/users/${a.id}`}
                      className="text-sm text-white hover:text-indigo-400"
                    >
                      {a.name || a.email}
                      <span className="block text-[11px] text-gray-500">
                        {a.role.replace(/_/g, " ")}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500">System</span>
                  );
                },
              },
              {
                key: "when",
                header: "When",
                mobileHidden: true,
                cell: (r) => (
                  <span className="text-xs text-gray-400">
                    {format(new Date(r.createdAt), "MMM d, yyyy h:mm a")}
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <Trash2 className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">
              Nothing removed yet
            </h3>
            <p className="text-gray-400 text-sm">
              Archives and deletions from now on are listed here. Removals that
              happened before this was tracked left no record.
            </p>
          </div>
        )}

        {total > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1}–{Math.min(skip + pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Link
                href={`/admin/tasks/removed?page=${page - 1}${params.kind ? `&kind=${params.kind}` : ""}`}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page > 1
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 pointer-events-none"
                }`}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Link>
              <Link
                href={`/admin/tasks/removed?page=${page + 1}${params.kind ? `&kind=${params.kind}` : ""}`}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page < totalPages
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 pointer-events-none"
                }`}
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
