import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { visibleTaskWhere } from "@/lib/work/access";
import { visibleProjectWhere } from "@/lib/work/projects";
import { userNames, workGuard } from "@/lib/work/server";
import { OPEN_TASK_STATUSES, taskCode } from "@/lib/work/model";

const DAY = 86_400_000;

/**
 * GET /api/admin/work/overview — the dashboard. Every number is counted inside
 * visibleTaskWhere(), so it can only ever count tasks this person may open.
 */
export async function GET() {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const now = new Date();
  const vis = visibleTaskWhere(a);
  const w = (extra: Prisma.WorkTaskWhereInput): Prisma.WorkTaskWhereInput => ({ AND: [vis, extra] });
  const mineDoing: Prisma.WorkTaskWhereInput = { members: { some: { userId: a.userId, role: { in: ["ASSIGNEE", "COLLABORATOR"] } } } };
  const open = { status: { in: OPEN_TASK_STATUSES } };
  const reviewScope: Prisma.WorkTaskWhereInput = a.oversee
    ? {}
    : {
        OR: [
          { members: { some: { userId: a.userId, role: "REVIEWER" } } },
          ...(a.perms.has("work.review") ? [{ createdById: a.userId }, { managerId: a.userId }] : []),
        ],
      };
  const managed: Prisma.WorkTaskWhereInput = a.oversee ? {} : { OR: [{ createdById: a.userId }, { managerId: a.userId }, ...(a.leadTeamIds.length ? [{ teamId: { in: a.leadTeamIds } }] : [])] };

  const [
    awaitingAccept,
    myInProgress,
    myOverdue,
    myReturned,
    myRequests,
    toReview,
    activeVisible,
    overdueVisible,
    blockedVisible,
    inReviewVisible,
    stale,
    completedMonth,
    activeProjects,
  ] = await Promise.all([
    prisma.workTaskMember.count({ where: { userId: a.userId, role: { in: ["ASSIGNEE", "COLLABORATOR"] }, acceptedAt: null, task: open } }),
    prisma.workTask.count({ where: w({ ...mineDoing, status: { in: ["IN_PROGRESS", "CHANGES_REQUESTED"] } }) }),
    prisma.workTask.count({ where: w({ ...mineDoing, ...open, dueAt: { lt: now } }) }),
    prisma.workReport.count({ where: { authorId: a.userId, status: "CHANGES_REQUESTED", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.workRequest.count({ where: { toId: a.userId, status: "OPEN" } }),
    prisma.workReport.count({ where: { status: "SUBMITTED", authorId: { not: a.userId }, task: w(reviewScope) } }),
    prisma.workTask.count({ where: w({ ...managed, ...open }) }),
    prisma.workTask.count({ where: w({ ...managed, ...open, dueAt: { lt: now } }) }),
    prisma.workTask.count({ where: w({ ...managed, status: "BLOCKED" }) }),
    prisma.workTask.count({ where: w({ ...managed, status: "IN_REVIEW" }) }),
    // Open, started more than 3 days ago, and no report for 3 days.
    prisma.workTask.count({
      where: w({
        ...managed,
        status: { in: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
        createdAt: { lt: new Date(now.getTime() - 3 * DAY) },
        OR: [{ lastReportAt: null }, { lastReportAt: { lt: new Date(now.getTime() - 3 * DAY) } }],
      }),
    }),
    prisma.workTask.count({ where: w({ ...managed, status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - 30 * DAY) } }) }),
    prisma.workProject.count({ where: { AND: [visibleProjectWhere(a), { status: "ACTIVE" }] } }),
  ]);

  const upcoming = (await prisma.workTask.findMany({
    where: w({ ...open, dueAt: { gte: new Date(now.getTime() - 30 * DAY), lte: new Date(now.getTime() + 7 * DAY) } }),
    orderBy: { dueAt: "asc" },
    take: 8,
    select: { id: true, number: true, title: true, status: true, priority: true, dueAt: true },
  })) as unknown as Array<{ id: string; number: number; title: string; status: string; priority: string; dueAt: Date | null }>;

  // Recent activity — of tasks this person can see only.
  const recentIds = (await prisma.workTask.findMany({ where: vis, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true } })).map((t) => t.id);
  const activity = recentIds.length
    ? await prisma.workActivity.findMany({ where: { taskId: { in: recentIds } }, orderBy: { createdAt: "desc" }, take: 15 })
    : [];

  // Workload: open assignments per assignee, for people who manage work.
  let workload: Array<{ userId: string; name: string; open: number }> = [];
  if (a.oversee || a.perms.has("work.create")) {
    const groups = (await prisma.workTaskMember.groupBy({
      by: ["userId"],
      where: { role: "ASSIGNEE", task: w({ ...managed, ...open }) },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 12,
    })) as unknown as Array<{ userId: string; _count: { _all: number } }>;
    const names = await userNames(groups.map((x) => x.userId));
    workload = groups.map((x) => ({ userId: x.userId, name: names.get(x.userId)?.name ?? "Former staff", open: x._count._all }));
  }
  const actNames = await userNames(activity.map((x) => x.actorId ?? ""));
  const taskNums = new Map(
    (await prisma.workTask.findMany({ where: { id: { in: [...new Set(activity.map((x) => x.taskId ?? ""))] } }, select: { id: true, number: true, title: true } })).map((t) => [t.id, t])
  );

  return NextResponse.json({
    me: { awaitingAccept, inProgress: myInProgress, overdue: myOverdue, returned: myReturned, requests: myRequests },
    review: { waiting: toReview },
    managed: {
      scope: a.oversee ? "all" : "yours",
      active: activeVisible,
      overdue: overdueVisible,
      blocked: blockedVisible,
      inReview: inReviewVisible,
      stale,
      completed30d: completedMonth,
      projects: activeProjects,
    },
    upcoming: upcoming.map((t) => ({ ...t, code: taskCode(t.number), overdue: !!t.dueAt && t.dueAt < now })),
    activity: activity.map((x) => ({
      id: x.id,
      at: x.createdAt,
      summary: x.summary,
      actor: actNames.get(x.actorId ?? "")?.name ?? null,
      taskId: x.taskId,
      task: x.taskId && taskNums.get(x.taskId) ? { code: taskCode(taskNums.get(x.taskId)!.number), title: taskNums.get(x.taskId)!.title } : null,
    })),
    workload,
    caps: {
      create: a.perms.has("work.create") || a.oversee,
      oversee: a.oversee,
      settings: a.perms.has("work.settings"),
      review: a.perms.has("work.review") || a.isSuper,
    },
  });
}
