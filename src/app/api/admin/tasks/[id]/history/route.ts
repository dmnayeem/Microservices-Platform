import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TASK_ACTION_LABEL } from "@/lib/task-audit";

/**
 * Everything that has happened to one task, and who did it.
 *
 * Admin-only, and deliberately not reachable from any user-facing route: this
 * says which staff member created, edited or removed a task, which is internal
 * accountability, not something a person doing the task has any part in.
 *
 * Reads `AuditLog` rather than the task row because the interesting half —
 * deletion — happens when the task row is on its way out. See lib/task-audit.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Same permission that lets someone see the task list at all.
  if (!(await can(session.user.id, "tasks.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await prisma.auditLog.findMany({
    where: { entity: "Task", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      summary: true,
      newData: true,
      userId: true,
      createdAt: true,
      ipAddress: true,
    },
  });

  // Resolve actor names in one query — the same shape the admin activity feed
  // uses. A history that lists cuids is not a history anybody can read.
  const actorIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return NextResponse.json({
    events: rows.map((r) => {
      const a = r.userId ? actorMap.get(r.userId) : null;
      return {
        id: r.id,
        action: r.action,
        label: TASK_ACTION_LABEL[r.action] ?? r.action,
        summary: r.summary,
        at: r.createdAt.toISOString(),
        actor: a
          ? { id: a.id, name: a.name || a.email, role: a.role }
          : null,
        meta: r.newData ?? null,
      };
    }),
  });
}
