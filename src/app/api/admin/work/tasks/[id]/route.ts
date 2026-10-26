import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { writeAudit } from "@/lib/audit";
import { assignmentProblem, loadTaskFor, visibleTaskWhere } from "@/lib/work/access";
import { bad, logWorkActivity, notFound, notifyWork, progressForTasks, userNames, workGuard } from "@/lib/work/server";
import { MEMBER_ROLES, RECURRENCES, TASK_VISIBILITY, WORK_PRIORITIES, OVERALL_METHOD_NOTE, isOverdue, projectCode, taskCode } from "@/lib/work/model";
import { targetSchema, visibilityProblem } from "@/lib/work/validate";

type Ctx = { params: Promise<{ id: string }> };

/** GET — everything about one task that THIS person may see. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  const { task, caps, member } = found;

  const [members, reports, comments, activity, requests, project, milestone, dependsOn, category, team] = await Promise.all([
    prisma.workTaskMember.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } }),
    prisma.workReport.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lines: true },
    }),
    prisma.workComment.findMany({
      // Private management notes only for the task's managers.
      where: { taskId: id, ...(caps.privateNotes ? {} : { kind: "COMMENT" }) },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.workActivity.findMany({ where: { taskId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.workRequest.findMany({
      where: { taskId: id, ...(caps.manage ? {} : { OR: [{ fromId: a.userId }, { toId: a.userId }] }) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    task.projectId ? prisma.workProject.findUnique({ where: { id: task.projectId }, select: { id: true, number: true, title: true } }) : null,
    task.milestoneId ? prisma.workMilestone.findUnique({ where: { id: task.milestoneId }, select: { id: true, title: true, status: true } }) : null,
    task.dependsOnId ? prisma.workTask.findUnique({ where: { id: task.dependsOnId }, select: { id: true, number: true, title: true, status: true } }) : null,
    task.categoryId ? prisma.workOption.findUnique({ where: { id: task.categoryId }, select: { label: true } }) : null,
    task.teamId ? prisma.workTeam.findUnique({ where: { id: task.teamId }, select: { id: true, name: true } }) : null,
  ]);
  const progress = (await progressForTasks([id])).get(id);
  // The task this waits on is named only to someone who may open it.
  const depVisible = dependsOn ? (await prisma.workTask.count({ where: { AND: [{ id: dependsOn.id }, visibleTaskWhere(a)] } })) > 0 : false;
  const visibleDepartment = task.visibleDepartmentId
    ? (await prisma.workOption.findUnique({ where: { id: task.visibleDepartmentId }, select: { label: true } }))?.label ?? null
    : null;
  const names = await userNames([
    task.createdById,
    task.managerId ?? "",
    ...members.map((m) => m.userId),
    ...reports.map((r) => r.authorId),
    ...reports.map((r) => r.reviewerId ?? ""),
    ...comments.map((c) => c.authorId),
    ...activity.map((x) => x.actorId ?? ""),
    ...requests.flatMap((r) => [r.fromId, r.toId]),
  ]);
  const who = (uid: string | null | undefined) => (uid ? names.get(uid) ?? { id: uid, name: "Former staff", avatar: null } : null);

  return NextResponse.json({
    task: {
      ...task,
      code: taskCode(task.number),
      overdue: isOverdue(task.status, task.dueAt),
      createdBy: who(task.createdById),
      manager: who(task.managerId),
      project: project ? { ...project, code: projectCode(project.number) } : null,
      milestone,
      // Only named if this person may see it; otherwise just "waiting".
      dependsOn: dependsOn
        ? depVisible
          ? { id: dependsOn.id, code: taskCode(dependsOn.number), title: dependsOn.title, status: dependsOn.status }
          : { id: null, code: "", title: "a task you can't open", status: dependsOn.status }
        : null,
      visibleDepartment,
      category: category?.label ?? null,
      team,
    },
    caps,
    me: { userId: a.userId, role: member?.role ?? null, acceptedAt: member?.acceptedAt ?? null },
    members: members.map((m) => ({ ...m, user: who(m.userId) })),
    progress,
    overallMethod: OVERALL_METHOD_NOTE,
    reports: reports.map((r) => ({ ...r, author: who(r.authorId), reviewer: who(r.reviewerId) })),
    comments: comments.map((c) => ({ ...c, author: who(c.authorId) })),
    activity: activity.map((x) => ({ ...x, actor: who(x.actorId) })),
    requests: requests.map((r) => ({ ...r, from: who(r.fromId), to: who(r.toId) })),
  });
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(500).nullish(),
  instructions: z.string().max(200_000).nullish(),
  priority: z.enum(WORK_PRIORITIES).optional(),
  visibility: z.enum(TASK_VISIBILITY).optional(),
  visibleDepartmentId: z.string().min(1).max(64).nullish(),
  visibleRoles: z.array(z.string().max(40)).max(20).optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  dependsOnId: z.string().min(1).max(64).nullish(),
  managerId: z.string().min(1).max(64).nullish(),
  categoryId: z.string().min(1).max(64).nullish(),
  teamId: z.string().min(1).max(64).nullish(),
  reviewRequired: z.boolean().optional(),
  evidenceRequired: z.boolean().optional(),
  acceptance: z.string().trim().max(5000).nullish(),
  estimatedHours: z.number().min(0).max(10_000).nullish(),
  startAt: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
  addMembers: z.array(z.object({ userId: z.string().min(1).max(64), role: z.enum(MEMBER_ROLES) })).max(50).optional(),
  removeMemberIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  targets: z.array(targetSchema.extend({ id: z.string().min(1).max(64).optional() })).max(30).optional(),
  /** Required when a target or the due date changes — kept in the history. */
  reason: z.string().trim().max(500).optional(),
});

/** PATCH — edit a task (managers of it only). Every meaningful change is logged. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  if (!found.caps.manage) return bad("Only the task's managers can edit it.", 403);
  const { task } = found;
  if (task.status === "ARCHIVED") return bad("An archived task can't be edited.");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid change");
  const b = parsed.data;
  const code = taskCode(task.number);

  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  const set = (k: string, v: unknown, label: string) => {
    if (v === undefined) return;
    const cur = (task as Record<string, unknown>)[k];
    const same = cur instanceof Date && v instanceof Date ? cur.getTime() === v.getTime() : cur === v;
    if (same) return;
    data[k] = v;
    changes.push(label);
  };
  set("title", b.title, "title");
  set("summary", b.summary === undefined ? undefined : b.summary || null, "summary");
  set("instructions", b.instructions === undefined ? undefined : b.instructions ? sanitizeRichHtml(b.instructions) : null, "instructions");
  set("priority", b.priority, "priority");
  set("visibility", b.visibility, "visibility");
  {
    const v = b.visibility ?? task.visibility;
    const dep = b.visibleDepartmentId === undefined ? task.visibleDepartmentId : b.visibleDepartmentId;
    const roles = b.visibleRoles ?? task.visibleRoles;
    if (b.visibility !== undefined || b.visibleDepartmentId !== undefined || b.visibleRoles !== undefined) {
      const vp = visibilityProblem(v, dep, roles);
      if (vp) return bad(vp);
      set("visibleDepartmentId", v === "DEPARTMENT" ? dep || null : null, "visible department");
      if (JSON.stringify(v === "ROLES" ? roles : []) !== JSON.stringify(task.visibleRoles)) {
        data.visibleRoles = v === "ROLES" ? roles : [];
        changes.push("visible roles");
      }
    }
  }
  set("recurrence", b.recurrence, "repeat");
  if (b.dependsOnId !== undefined) {
    if (b.dependsOnId === id) return bad("A task can't depend on itself.");
    if (b.dependsOnId && !(await loadTaskFor(a, b.dependsOnId))) return bad("The task this depends on was not found.");
    set("dependsOnId", b.dependsOnId || null, "dependency");
  }
  set("categoryId", b.categoryId === undefined ? undefined : b.categoryId || null, "category");
  set("reviewRequired", b.reviewRequired, "review rule");
  set("evidenceRequired", b.evidenceRequired, "evidence rule");
  set("acceptance", b.acceptance === undefined ? undefined : b.acceptance || null, "acceptance criteria");
  set("estimatedHours", b.estimatedHours, "estimate");
  set("startAt", b.startAt, "start date");
  set("dueAt", b.dueAt, "due date");

  // People: the same scope rules as creating.
  const newPeople = [
    ...(b.addMembers ?? []).map((m) => m.userId),
    ...(b.managerId ? [b.managerId] : []),
  ];
  const teamId = b.teamId === undefined ? task.teamId : b.teamId || null;
  if (newPeople.length || b.teamId !== undefined) {
    const problem = await assignmentProblem(a, newPeople, teamId);
    if (problem) return bad(problem, 403);
  }
  set("teamId", b.teamId === undefined ? undefined : b.teamId || null, "team");
  set("managerId", b.managerId === undefined ? undefined : b.managerId || null, "manager");

  const existingTargets = await prisma.workTarget.findMany({ where: { taskId: id } });
  const targetChanges: string[] = [];
  if (b.targets) {
    for (const t of b.targets) {
      if (!t.id) continue;
      const cur = existingTargets.find((x) => x.id === t.id);
      if (!cur) return bad("A target does not belong to this task.");
      if (cur.quantity !== t.quantity) targetChanges.push(`${cur.label}: ${cur.quantity} → ${t.quantity}`);
    }
    const keep = new Set(b.targets.filter((t) => t.id).map((t) => t.id));
    const removed = existingTargets.filter((t) => !keep.has(t.id));
    if (removed.length) {
      const used = await prisma.workReportLine.count({ where: { targetId: { in: removed.map((t) => t.id) } } });
      if (used) return bad("A target with reported work can't be removed — set it to what is needed instead.");
    }
  }
  if ((targetChanges.length || data.dueAt !== undefined) && task.status !== "DRAFT" && !b.reason) {
    return bad("Say why the target or deadline is changing — it is kept in the task history.");
  }

  const removeIds = (b.removeMemberIds ?? []).filter((u) => u !== task.createdById);
  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.workTask.update({ where: { id }, data });
    if (removeIds.length) await tx.workTaskMember.deleteMany({ where: { taskId: id, userId: { in: removeIds } } });
    for (const m of b.addMembers ?? []) {
      await tx.workTaskMember.upsert({
        where: { taskId_userId: { taskId: id, userId: m.userId } },
        create: { taskId: id, userId: m.userId, role: m.role, addedById: a.userId },
        update: { role: m.role },
      });
    }
    if (b.targets) {
      const keep = new Set(b.targets.filter((t) => t.id).map((t) => t.id as string));
      await tx.workTarget.deleteMany({ where: { taskId: id, id: { notIn: [...keep] } } });
      for (const [i, t] of b.targets.entries()) {
        const assigneeId = task.targetMode === "INDIVIDUAL" ? t.assigneeId || null : null;
        if (t.id) {
          await tx.workTarget.update({
            where: { id: t.id },
            data: { label: t.label, platformId: t.platformId || null, unitLabel: t.unitLabel, quantity: t.quantity, assigneeId, sort: i },
          });
        } else {
          await tx.workTarget.create({
            data: {
              taskId: id,
              label: t.label,
              platformId: t.platformId || null,
              unitLabel: t.unitLabel,
              quantity: t.quantity,
              originalQuantity: t.quantity,
              assigneeId,
              sort: i,
            },
          });
        }
      }
    }
  });

  if (changes.length) {
    await logWorkActivity({
      taskId: id,
      projectId: task.projectId,
      actorId: a.userId,
      type: "EDITED",
      summary: `Changed ${changes.join(", ")}${b.reason ? ` — ${b.reason}` : ""}`,
    });
  }
  if (targetChanges.length) {
    await logWorkActivity({
      taskId: id,
      projectId: task.projectId,
      actorId: a.userId,
      type: "TARGET_CHANGED",
      summary: `Target changed (${targetChanges.join("; ")}) — ${b.reason}`,
      meta: { targetChanges },
    });
  }
  if (b.addMembers?.length) {
    await logWorkActivity({ taskId: id, actorId: a.userId, type: "MEMBERS_ADDED", summary: `Added ${b.addMembers.length} person(s)`, meta: { added: b.addMembers } });
    const doers = b.addMembers.filter((m) => m.role === "ASSIGNEE" || m.role === "COLLABORATOR").map((m) => m.userId);
    await notifyWork(doers.filter((u) => u !== a.userId), { title: `New task: ${code}`, message: `${task.title} — open it and press Accept & Start.`, taskId: id });
    const others = b.addMembers.filter((m) => m.role === "REVIEWER" || m.role === "OBSERVER").map((m) => m.userId);
    await notifyWork(others.filter((u) => u !== a.userId), { title: `Added to ${code}`, message: task.title, taskId: id });
  }
  if (removeIds.length) {
    await logWorkActivity({ taskId: id, actorId: a.userId, type: "MEMBERS_REMOVED", summary: `Removed ${removeIds.length} person(s)`, meta: { removed: removeIds } });
  }
  if ((data.dueAt !== undefined || targetChanges.length) && task.status !== "DRAFT") {
    const doers = (await prisma.workTaskMember.findMany({ where: { taskId: id, role: { in: ["ASSIGNEE", "COLLABORATOR"] } }, select: { userId: true } })).map((m) => m.userId);
    await notifyWork(doers.filter((u) => u !== a.userId), {
      title: `${code} changed`,
      message: `${targetChanges.length ? "Target" : "Deadline"} updated: ${b.reason ?? ""}`.trim(),
      taskId: id,
    });
  }
  await writeAudit({ actorId: a.userId, action: "WORK_TASK_EDITED", entity: "WorkTask", entityId: id, summary: `Edited ${code}` });
  return NextResponse.json({ ok: true });
}
