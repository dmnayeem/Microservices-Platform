import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { writeAudit } from "@/lib/audit";
import { assignmentProblem, visibleTaskWhere } from "@/lib/work/access";
import { bad, logWorkActivity, notifyWork, progressForTasks, userNames, workGuard } from "@/lib/work/server";
import { CLOSED_TASK_STATUSES, OPEN_TASK_STATUSES, TASK_STATUSES, WORK_PRIORITIES, isOverdue, taskCode } from "@/lib/work/model";
import { taskInputSchema, targetMemberProblem } from "@/lib/work/validate";

const PAGE = 30;

/**
 * GET /api/admin/work/tasks — the task list, always inside visibleTaskWhere().
 *   scope   mine (default: I am on it, created it or manage it) | assigned
 *           (I must do it) | created | review (reports waiting for me) | all
 *   status, priority, q (title or TW-number), overdue=1, projectId,
 *   milestoneId, teamId, page
 */
export async function GET(req: NextRequest) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "mine";
  const and: Prisma.WorkTaskWhereInput[] = [visibleTaskWhere(a)];

  if (scope === "mine") {
    and.push({ OR: [{ createdById: a.userId }, { managerId: a.userId }, { members: { some: { userId: a.userId } } }] });
  } else if (scope === "assigned") {
    and.push({ members: { some: { userId: a.userId, role: { in: ["ASSIGNEE", "COLLABORATOR"] } } } });
  } else if (scope === "created") {
    and.push({ createdById: a.userId });
  } else if (scope === "review") {
    and.push({ reports: { some: { status: "SUBMITTED" } } });
    if (!a.oversee) {
      and.push({
        OR: [
          { members: { some: { userId: a.userId, role: "REVIEWER" } } },
          ...(a.perms.has("work.review") ? [{ createdById: a.userId }, { managerId: a.userId }] : []),
        ],
      });
    }
  }
  const status = sp.get("status");
  if (status === "OPEN") and.push({ status: { in: OPEN_TASK_STATUSES } });
  else if (status === "CLOSED") and.push({ status: { in: CLOSED_TASK_STATUSES } });
  else if (status && (TASK_STATUSES as readonly string[]).includes(status)) and.push({ status });
  else and.push({ status: { not: "ARCHIVED" } });
  const priority = sp.get("priority");
  if (priority && (WORK_PRIORITIES as readonly string[]).includes(priority)) and.push({ priority });
  if (sp.get("overdue") === "1") and.push({ status: { in: OPEN_TASK_STATUSES }, dueAt: { lt: new Date() } });
  for (const k of ["projectId", "milestoneId", "teamId"] as const) {
    const v = sp.get(k);
    if (v) and.push({ [k]: v });
  }
  const q = sp.get("q")?.trim();
  if (q) {
    const n = Number(q.replace(/^tw-/i, ""));
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const where: Prisma.WorkTaskWhereInput = { AND: and };
  // The extended client's types drop this `select` shape, so the row is
  // described here (the same workaround the rest of the codebase uses).
  type ListRow = {
    id: string;
    number: number;
    title: string;
    status: string;
    priority: string;
    dueAt: Date | null;
    updatedAt: Date;
    lastReportAt: Date | null;
    project: { id: string; title: string } | null;
    members: { userId: string; role: string; acceptedAt: Date | null }[];
    _count: { reports: number };
  };
  const totalP = prisma.workTask.count({ where });
  const rows = (await prisma.workTask.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        updatedAt: true,
        lastReportAt: true,
        project: { select: { id: true, title: true } },
        members: { select: { userId: true, role: true, acceptedAt: true } },
        _count: { select: { reports: { where: { status: "SUBMITTED" } } } },
      },
  })) as unknown as ListRow[];
  const total = await totalP;
  const progress = await progressForTasks(rows.map((r) => r.id));
  const names = await userNames(rows.flatMap((r) => r.members.map((m) => m.userId)));

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE,
    tasks: rows.map((r) => ({
      id: r.id,
      code: taskCode(r.number),
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueAt: r.dueAt,
      overdue: isOverdue(r.status, r.dueAt),
      updatedAt: r.updatedAt,
      lastReportAt: r.lastReportAt,
      project: r.project,
      pendingReports: r._count.reports,
      assignees: r.members
        .filter((m) => m.role === "ASSIGNEE")
        .map((m) => ({ ...names.get(m.userId), accepted: !!m.acceptedAt })),
      myRole: r.members.find((m) => m.userId === a.userId)?.role ?? null,
      progress: progress.get(r.id),
    })),
  });
}

/** POST /api/admin/work/tasks — create (and assign) a task. */
export async function POST(req: NextRequest) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const parsed = taskInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid task");
  const b = parsed.data;

  if (!b.draft && !b.members.some((m) => m.role === "ASSIGNEE")) return bad("Assign the task to at least one person.");
  const tm = targetMemberProblem(b.targetMode, b.members, b.targets);
  if (tm) return bad(tm);
  if (b.startAt && b.dueAt && b.dueAt < b.startAt) return bad("The due date is before the start date.");

  const people = [...b.members.map((m) => m.userId), ...(b.managerId ? [b.managerId] : [])];
  const problem = await assignmentProblem(a, people, b.teamId ?? null);
  if (problem) return bad(problem, 403);

  if (b.milestoneId) {
    const ms = await prisma.workMilestone.findUnique({ where: { id: b.milestoneId }, select: { projectId: true } });
    if (!ms) return bad("Milestone not found.");
    if (b.projectId && ms.projectId !== b.projectId) return bad("That milestone belongs to another project.");
    b.projectId = ms.projectId;
  }
  if (b.projectId && !(await prisma.workProject.count({ where: { id: b.projectId } }))) return bad("Project not found.");
  if (b.dependsOnId && !(await prisma.workTask.count({ where: { AND: [{ id: b.dependsOnId }, visibleTaskWhere(a)] } }))) {
    return bad("The task this depends on was not found.");
  }

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.workTask.create({
      data: {
        title: b.title,
        summary: b.summary || null,
        instructions: b.instructions ? sanitizeRichHtml(b.instructions) : null,
        projectId: b.projectId || null,
        milestoneId: b.milestoneId || null,
        categoryId: b.categoryId || null,
        teamId: b.teamId || null,
        createdById: a.userId,
        managerId: b.managerId || null,
        priority: b.priority,
        status: b.draft ? "DRAFT" : "ASSIGNED",
        visibility: b.visibility,
        targetMode: b.targetMode,
        reviewRequired: b.reviewRequired,
        evidenceRequired: b.evidenceRequired,
        acceptance: b.acceptance || null,
        estimatedHours: b.estimatedHours ?? null,
        startAt: b.startAt ?? null,
        dueAt: b.dueAt ?? null,
        dependsOnId: b.dependsOnId || null,
      },
    });
    if (b.members.length) {
      await tx.workTaskMember.createMany({
        data: b.members.map((m) => ({ taskId: t.id, userId: m.userId, role: m.role, addedById: a.userId })),
      });
    }
    if (b.targets.length) {
      await tx.workTarget.createMany({
        data: b.targets.map((x, i) => ({
          taskId: t.id,
          label: x.label,
          platformId: x.platformId || null,
          unitLabel: x.unitLabel,
          quantity: x.quantity,
          originalQuantity: x.quantity,
          assigneeId: b.targetMode === "INDIVIDUAL" ? x.assigneeId || null : null,
          sort: i,
        })),
      });
    }
    return t;
  });

  const code = taskCode(task.number);
  await logWorkActivity({
    taskId: task.id,
    projectId: task.projectId,
    actorId: a.userId,
    type: b.draft ? "CREATED_DRAFT" : "CREATED",
    summary: `${b.draft ? "Drafted" : "Created and assigned"} ${code}`,
    meta: { members: b.members, targets: b.targets.length },
  });
  await writeAudit({
    actorId: a.userId,
    action: "WORK_TASK_CREATED",
    entity: "WorkTask",
    entityId: task.id,
    summary: `${b.draft ? "Drafted" : "Created"} task ${code}`,
  });

  if (!b.draft) {
    const assignees = b.members.filter((m) => m.role === "ASSIGNEE" || m.role === "COLLABORATOR").map((m) => m.userId);
    const others = b.members.filter((m) => m.role === "REVIEWER" || m.role === "OBSERVER").map((m) => m.userId);
    const manager = b.managerId && b.managerId !== a.userId ? [b.managerId] : [];
    await notifyWork(assignees.filter((u) => u !== a.userId), {
      title: `New task: ${code}`,
      message: `${b.title} — open it and press Accept & Start.`,
      taskId: task.id,
    });
    await notifyWork([...others, ...manager].filter((u) => u !== a.userId), {
      title: `Added to ${code}`,
      message: b.title,
      taskId: task.id,
    });
  }

  return NextResponse.json({ ok: true, id: task.id, code }, { status: 201 });
}
