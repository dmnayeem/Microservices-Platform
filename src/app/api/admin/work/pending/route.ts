import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { userNames, workGuard } from "@/lib/work/server";
import { taskCode } from "@/lib/work/model";

/**
 * GET /api/admin/work/pending — what the persistent pop-up in the admin panel
 * shows: tasks waiting for MY acceptance, and update requests waiting on me.
 * Read from the assignments themselves (not from notifications), so it can't
 * duplicate, survives logging out, and a cancelled task drops off by itself.
 */
export async function GET() {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;

  const memberships = await prisma.workTaskMember.findMany({
    where: {
      userId: a.userId,
      role: { in: ["ASSIGNEE", "COLLABORATOR"] },
      acceptedAt: null,
      task: { status: { in: ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "CHANGES_REQUESTED", "IN_REVIEW"] } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      role: true,
      createdAt: true,
      task: { select: { id: true, number: true, title: true, priority: true, dueAt: true, createdById: true } },
    },
  });
  const requests = await prisma.workRequest.findMany({
    where: {
      toId: a.userId,
      status: "OPEN",
      kind: { in: ["UPDATE", "REMINDER"] },
      // Only while I am still on the task.
      task: { members: { some: { userId: a.userId } }, status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, kind: true, message: true, fromId: true, createdAt: true, task: { select: { id: true, number: true, title: true } } },
  });
  const rowsM = memberships as unknown as Array<{
    role: string;
    createdAt: Date;
    task: { id: string; number: number; title: string; priority: string; dueAt: Date | null; createdById: string };
  }>;
  const rowsR = requests as unknown as Array<{
    id: string;
    kind: string;
    message: string;
    fromId: string;
    createdAt: Date;
    task: { id: string; number: number; title: string };
  }>;
  const names = await userNames([...rowsM.map((m) => m.task.createdById), ...rowsR.map((r) => r.fromId)]);

  return NextResponse.json(
    {
      assignments: rowsM.map((m) => ({
        taskId: m.task.id,
        code: taskCode(m.task.number),
        title: m.task.title,
        priority: m.task.priority,
        dueAt: m.task.dueAt,
        role: m.role,
        assignedBy: names.get(m.task.createdById)?.name ?? "A manager",
        assignedAt: m.createdAt,
      })),
      requests: rowsR.map((r) => ({
        id: r.id,
        kind: r.kind,
        message: r.message,
        from: names.get(r.fromId)?.name ?? "A manager",
        taskId: r.task.id,
        code: taskCode(r.task.number),
        title: r.task.title,
        at: r.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
