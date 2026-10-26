import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { visibleTaskWhere } from "@/lib/work/access";
import { canManageProject, visibleProjectWhere } from "@/lib/work/projects";
import { bad, logWorkActivity, notFound, progressForTasks, userNames, workGuard } from "@/lib/work/server";
import { MILESTONE_STATUSES, OPEN_TASK_STATUSES, PROJECT_STATUSES, WORK_PRIORITIES, isOverdue, projectCode, taskCode } from "@/lib/work/model";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET — a project with its milestones and the tasks this person can see.
 * Milestone progress: TASKS mode = the average completion of its (visible)
 * tasks; MANUAL = the figure a manager set. Reaching 100% never completes a
 * milestone by itself — a manager sets that status.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const project = await prisma.workProject.findFirst({ where: { AND: [{ id }, visibleProjectWhere(a)] } });
  if (!project) return notFound();
  const [milestones, tasks, activity] = await Promise.all([
    prisma.workMilestone.findMany({ where: { projectId: id }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.workTask.findMany({
      where: { AND: [visibleTaskWhere(a), { projectId: id }, { status: { not: "ARCHIVED" } }] },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      select: { id: true, number: true, title: true, status: true, priority: true, dueAt: true, milestoneId: true },
    }),
    prisma.workActivity.findMany({ where: { projectId: id, taskId: null }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const rows = tasks as unknown as Array<{ id: string; number: number; title: string; status: string; priority: string; dueAt: Date | null; milestoneId: string | null }>;
  const progress = await progressForTasks(rows.map((t) => t.id));
  const names = await userNames([project.leadId ?? "", ...milestones.map((m) => m.ownerId ?? ""), ...activity.map((x) => x.actorId ?? "")]);

  const taskOut = rows.map((t) => ({ ...t, code: taskCode(t.number), overdue: isOverdue(t.status, t.dueAt), percent: progress.get(t.id)?.overall ?? 0 }));
  const msOut = milestones.map((m) => {
    const linked = taskOut.filter((t) => t.milestoneId === m.id && t.status !== "CANCELLED");
    const fromTasks = linked.length ? Math.floor(linked.reduce((s, t) => s + t.percent, 0) / linked.length) : 0;
    const dep = m.dependsOnId ? milestones.find((x) => x.id === m.dependsOnId) : null;
    return {
      ...m,
      owner: m.ownerId ? names.get(m.ownerId) ?? null : null,
      percent: m.progressMode === "MANUAL" ? Math.min(100, Math.max(0, m.manualProgress)) : fromTasks,
      tasks: linked.length,
      completedTasks: linked.filter((t) => t.status === "COMPLETED").length,
      overdue: !!m.dueAt && m.dueAt.getTime() < Date.now() && !["COMPLETED", "CANCELLED"].includes(m.status),
      blockedBy: dep && dep.status !== "COMPLETED" ? { id: dep.id, title: dep.title } : null,
    };
  });
  const active = taskOut.filter((t) => t.status !== "CANCELLED");
  return NextResponse.json({
    project: { ...project, code: projectCode(project.number), lead: project.leadId ? names.get(project.leadId) ?? null : null },
    canManage: canManageProject(a, project),
    partial: !a.oversee,
    summary: {
      tasks: active.length,
      completed: active.filter((t) => t.status === "COMPLETED").length,
      overdue: active.filter((t) => (OPEN_TASK_STATUSES as string[]).includes(t.status) && t.overdue).length,
      percent: active.length ? Math.floor(active.reduce((s, t) => s + t.percent, 0) / active.length) : 0,
    },
    milestones: msOut,
    tasks: taskOut,
    activity: activity.map((x) => ({ ...x, actor: x.actorId ? names.get(x.actorId)?.name ?? null : null })),
  });
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(100_000).nullish(),
  leadId: z.string().min(1).max(64).nullish(),
  priority: z.enum(WORK_PRIORITIES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startAt: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
  /** Add a milestone. */
  addMilestone: z
    .object({
      title: z.string().trim().min(2).max(200),
      description: z.string().trim().max(5000).nullish(),
      ownerId: z.string().min(1).max(64).nullish(),
      acceptance: z.string().trim().max(5000).nullish(),
      progressMode: z.enum(["TASKS", "MANUAL"]).default("TASKS"),
      dependsOnId: z.string().min(1).max(64).nullish(),
      startAt: z.coerce.date().nullish(),
      dueAt: z.coerce.date().nullish(),
    })
    .optional(),
  /** Update a milestone (status, manual progress, dates). */
  milestone: z
    .object({
      id: z.string().min(1).max(64),
      status: z.enum(MILESTONE_STATUSES).optional(),
      manualProgress: z.number().int().min(0).max(100).optional(),
      title: z.string().trim().min(2).max(200).optional(),
      dueAt: z.coerce.date().nullish(),
      reason: z.string().trim().max(500).optional(),
    })
    .optional(),
});

/** PATCH — project managers only. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const project = await prisma.workProject.findFirst({ where: { AND: [{ id }, visibleProjectWhere(a)] } });
  if (!project) return notFound();
  if (!canManageProject(a, project)) return bad("Only the project's managers can change it.", 403);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid change");
  const b = parsed.data;
  const code = projectCode(project.number);

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.description !== undefined) data.description = b.description ? sanitizeRichHtml(b.description) : null;
  if (b.leadId !== undefined) data.leadId = b.leadId || null;
  if (b.priority !== undefined) data.priority = b.priority;
  if (b.status !== undefined) data.status = b.status;
  if (b.startAt !== undefined) data.startAt = b.startAt;
  if (b.dueAt !== undefined) data.dueAt = b.dueAt;
  if (Object.keys(data).length) {
    await prisma.workProject.update({ where: { id }, data });
    await logWorkActivity({ projectId: id, actorId: a.userId, type: "PROJECT_EDITED", summary: `Changed ${Object.keys(data).join(", ")}` });
  }

  if (b.addMilestone) {
    const m = b.addMilestone;
    if (m.dependsOnId && !(await prisma.workMilestone.count({ where: { id: m.dependsOnId, projectId: id } }))) {
      return bad("The milestone it depends on is not in this project.");
    }
    const count = await prisma.workMilestone.count({ where: { projectId: id } });
    await prisma.workMilestone.create({
      data: {
        projectId: id,
        title: m.title,
        description: m.description || null,
        ownerId: m.ownerId || null,
        acceptance: m.acceptance || null,
        progressMode: m.progressMode,
        dependsOnId: m.dependsOnId || null,
        startAt: m.startAt ?? null,
        dueAt: m.dueAt ?? null,
        sort: count,
      },
    });
    await logWorkActivity({ projectId: id, actorId: a.userId, type: "MILESTONE_ADDED", summary: `Added milestone "${m.title}" to ${code}` });
  }

  if (b.milestone) {
    const m = b.milestone;
    const cur = await prisma.workMilestone.findFirst({ where: { id: m.id, projectId: id } });
    if (!cur) return bad("Milestone not found.");
    if (m.status === "COMPLETED" && cur.dependsOnId) {
      const dep = await prisma.workMilestone.findUnique({ where: { id: cur.dependsOnId }, select: { status: true } });
      if (dep && dep.status !== "COMPLETED" && !m.reason) {
        return bad("It depends on a milestone that isn't completed — give a reason to override.");
      }
    }
    if (m.dueAt !== undefined && cur.dueAt?.getTime() !== m.dueAt?.getTime() && !m.reason) {
      return bad("Say why the deadline changes — it is kept in the history.");
    }
    const upd: Record<string, unknown> = {};
    if (m.status !== undefined) upd.status = m.status;
    if (m.manualProgress !== undefined) upd.manualProgress = m.manualProgress;
    if (m.title !== undefined) upd.title = m.title;
    if (m.dueAt !== undefined) upd.dueAt = m.dueAt;
    await prisma.workMilestone.update({ where: { id: m.id }, data: upd });
    await logWorkActivity({
      projectId: id,
      actorId: a.userId,
      type: "MILESTONE_UPDATED",
      summary: `Milestone "${cur.title}": ${Object.entries(upd).map(([k, v]) => `${k} → ${v instanceof Date ? v.toISOString().slice(0, 10) : v}`).join(", ")}${m.reason ? ` — ${m.reason}` : ""}`,
    });
  }
  return NextResponse.json({ ok: true });
}
