import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeAuditMany, type WriteAuditOpts } from "@/lib/audit";
import { taskSnapshot } from "@/lib/task-audit";

/**
 * DELETE /api/admin/tasks/archived — "Delete all archived".
 *
 * Same rules as deleting one archived task (DELETE /api/admin/tasks/[id]):
 *  - no submissions  → hard delete, snapshot kept in AuditLog (TASK_DELETED)
 *  - has submissions → status REMOVED (TASK_REMOVED). The row must stay:
 *    TaskSubmission → Task is Restrict and those rows back real payments
 *    (ledger refs are `task_<taskId>_<submissionId>`).
 *
 * Set-based, no interactive transaction (Accelerate kills those at 15s). Per
 * chunk of 500: one groupBy, one deleteMany, one updateMany, one createMany for
 * the per-task audit rows. One request handles at most MAX_PER_REQUEST tasks
 * and reports `remaining`; the client calls again until it is 0, so a large
 * backlog never runs into the function time limit.
 */
const CHUNK = 500;
const MAX_PER_REQUEST = 1000;

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The same permission as the single-task delete.
  if (!(await can(session.user.id, "tasks.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actorId = session.user.id;

  let deleted = 0;
  let removed = 0;
  try {
    const tasks = await prisma.task.findMany({
      where: { status: "ARCHIVED" },
      orderBy: { createdAt: "asc" },
      take: MAX_PER_REQUEST,
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        pointsReward: true,
        xpReward: true,
        completedCount: true,
        createdById: true,
        createdAt: true,
      },
    });

    for (let i = 0; i < tasks.length; i += CHUNK) {
      const chunk = tasks.slice(i, i + CHUNK);
      const ids = chunk.map((t) => t.id);

      const grouped = (await prisma.taskSubmission.groupBy({
        by: ["taskId"],
        where: { taskId: { in: ids } },
        _count: { _all: true },
      })) as unknown as { taskId: string; _count: { _all: number } }[];
      const subs = new Map(grouped.map((g) => [g.taskId, g._count._all]));

      const bare = ids.filter((id) => !subs.has(id));
      const kept = ids.filter((id) => subs.has(id));

      // `submissions: none` in the delete itself: a task that gained one since
      // the groupBy is skipped instead of failing the whole chunk on the FK.
      let deletedIds = new Set<string>();
      if (bare.length) {
        const res = await prisma.task.deleteMany({
          where: { id: { in: bare }, status: "ARCHIVED", submissions: { none: {} } },
        });
        if (res.count === bare.length) {
          deletedIds = new Set(bare);
        } else {
          // Rare: find which ones are still there so the audit is exact.
          const left = await prisma.task.findMany({
            where: { id: { in: bare } },
            select: { id: true },
          });
          const leftIds = new Set(left.map((t) => t.id));
          deletedIds = new Set(bare.filter((id) => !leftIds.has(id)));
        }
      }

      let removedIds = new Set<string>();
      if (kept.length) {
        const res = await prisma.task.updateMany({
          where: { id: { in: kept }, status: "ARCHIVED" },
          data: { status: "REMOVED" },
        });
        if (res.count === kept.length) {
          removedIds = new Set(kept);
        } else {
          const now = await prisma.task.findMany({
            where: { id: { in: kept }, status: "REMOVED" },
            select: { id: true },
          });
          removedIds = new Set(now.map((t) => t.id));
        }
      }

      deleted += deletedIds.size;
      removed += removedIds.size;

      // Per-task rows, so /admin/tasks/removed and each task's history name
      // every task — one createMany per chunk.
      const rows: WriteAuditOpts[] = [];
      for (const t of chunk) {
        const n = subs.get(t.id) ?? 0;
        if (deletedIds.has(t.id)) {
          rows.push({
            actorId,
            action: "TASK_DELETED",
            entity: "Task",
            entityId: t.id,
            summary: `Deleted "${t.title}" (${t.type}, ${t.pointsReward} pts) — no submissions, removed permanently (bulk)`,
            meta: { ...taskSnapshot(t), submissions: 0, reversible: false, bulk: true },
          });
        } else if (removedIds.has(t.id)) {
          rows.push({
            actorId,
            action: "TASK_REMOVED",
            entity: "Task",
            entityId: t.id,
            summary: `Deleted archived "${t.title}" — ${n} submission${n === 1 ? "" : "s"} kept for the payment records (bulk)`,
            meta: { ...taskSnapshot(t), submissions: n, reversible: false, bulk: true },
          });
        }
      }
      await writeAuditMany(rows);
    }

    const remaining =
      tasks.length < MAX_PER_REQUEST
        ? 0
        : await prisma.task.count({ where: { status: "ARCHIVED" } });

    if (deleted + removed > 0) {
      await writeAudit({
        actorId,
        action: "TASK_BULK_DELETE_ARCHIVED",
        entity: "Task",
        summary: `Deleted ${deleted + removed} archived task${
          deleted + removed === 1 ? "" : "s"
        }: ${deleted} permanently, ${removed} kept for payment records`,
        meta: { deleted, removed, remaining },
      });
    }

    return NextResponse.json({ success: true, deleted, removed, remaining });
  } catch (error) {
    console.error("Bulk delete of archived tasks failed:", error);
    return NextResponse.json(
      {
        error:
          deleted + removed > 0
            ? `Stopped part-way: ${deleted} deleted, ${removed} kept for payment records before an error. Try again.`
            : "Failed to delete archived tasks",
        deleted,
        removed,
      },
      { status: 500 }
    );
  }
}
