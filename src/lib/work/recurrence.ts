import "server-only";
import { prisma } from "@/lib/prisma";
import { logWorkActivity, notifyWork } from "@/lib/work/server";
import { nextOccurrence, taskCode, type Recurrence } from "@/lib/work/model";

/**
 * A repeating task was completed: create its next occurrence — same people,
 * targets, instructions and visibility; acceptance reset; the dates moved on
 * by one period (and on again until the due date is in the future, so a late
 * completion doesn't create an already-overdue task). Once per occurrence:
 * a task that already has a child is skipped.
 */
export async function createNextOccurrence(taskId: string, actorId: string): Promise<string | null> {
  const t = await prisma.workTask.findUnique({ where: { id: taskId }, include: { members: true, targets: true } });
  if (!t || t.recurrence === "NONE") return null;
  if (await prisma.workTask.count({ where: { recurrenceParentId: t.id } })) return null;
  const r = t.recurrence as Recurrence;
  const members = (t as unknown as { members: Array<{ userId: string; role: string }> }).members;
  const targets = (t as unknown as {
    targets: Array<{ label: string; platformId: string | null; unitLabel: string; quantity: number; assigneeId: string | null; sort: number }>;
  }).targets;

  const base = t.dueAt ?? new Date();
  let due = nextOccurrence(base, r);
  for (let i = 0; due.getTime() < Date.now() && i < 400; i++) due = nextOccurrence(due, r);
  const shift = due.getTime() - base.getTime();

  const next = await prisma.workTask.create({
    data: {
      title: t.title,
      summary: t.summary,
      instructions: t.instructions,
      projectId: t.projectId,
      milestoneId: t.milestoneId,
      categoryId: t.categoryId,
      teamId: t.teamId,
      createdById: t.createdById,
      managerId: t.managerId,
      priority: t.priority,
      status: "ASSIGNED",
      visibility: t.visibility,
      visibleDepartmentId: t.visibleDepartmentId,
      visibleRoles: t.visibleRoles,
      recurrence: t.recurrence,
      recurrenceParentId: t.id,
      targetMode: t.targetMode,
      reviewRequired: t.reviewRequired,
      evidenceRequired: t.evidenceRequired,
      acceptance: t.acceptance,
      estimatedHours: t.estimatedHours,
      startAt: t.startAt ? new Date(t.startAt.getTime() + shift) : null,
      dueAt: due,
      members: { create: members.map((m) => ({ userId: m.userId, role: m.role, addedById: actorId })) },
      targets: {
        create: targets.map((x) => ({
          label: x.label,
          platformId: x.platformId,
          unitLabel: x.unitLabel,
          quantity: x.quantity,
          originalQuantity: x.quantity,
          assigneeId: x.assigneeId,
          sort: x.sort,
        })),
      },
    },
  });
  const code = taskCode(next.number);
  await logWorkActivity({ taskId: t.id, projectId: t.projectId, actorId, type: "RECURRED", summary: `Next occurrence created: ${code}` });
  await logWorkActivity({ taskId: next.id, projectId: next.projectId, actorId, type: "CREATED", summary: `Created as the next occurrence of ${taskCode(t.number)}` });
  const doers = members.filter((m) => m.role === "ASSIGNEE" || m.role === "COLLABORATOR").map((m) => m.userId);
  await notifyWork(doers, { title: `New task: ${code}`, message: `${t.title} (repeats) — open it and press Accept & Start.`, taskId: next.id });
  return next.id;
}
