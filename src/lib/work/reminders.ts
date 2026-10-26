import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { logWorkActivity, notifyWork } from "@/lib/work/server";
import { OPEN_TASK_STATUSES, taskCode } from "@/lib/work/model";

const HOUR = 3_600_000;
const BATCH = 100;

/**
 * Team Work's automatic reminders (scheduler job "work-reminders", hourly):
 *   - due within 24 h      → the people doing it, once per task
 *   - overdue              → the people doing it + its managers, once per task
 *   - no report for N days → the people doing it, at most once per N days
 *                            (work.report_reminder_days, default 3; 0 = off)
 * Each reminder is written to the task's activity — that record is both the
 * visible reminder history and what stops it being sent twice.
 */
export async function runWorkReminders(): Promise<{ dueSoon: number; overdue: number; nudged: number }> {
  const now = new Date();
  const open = { status: { in: OPEN_TASK_STATUSES } };
  const doersOf = async (taskId: string) =>
    (await prisma.workTaskMember.findMany({ where: { taskId, role: { in: ["ASSIGNEE", "COLLABORATOR"] } }, select: { userId: true } })).map((m) => m.userId);

  const dueSoon = await prisma.workTask.findMany({
    where: { ...open, dueAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) }, NOT: { id: { in: await sentFor("DEADLINE_SOON") } } },
    take: BATCH,
    select: { id: true, number: true, title: true, dueAt: true, projectId: true },
  });
  for (const t of dueSoon) {
    await notifyWork(await doersOf(t.id), { title: `${taskCode(t.number)} is due soon`, message: `${t.title} — due ${t.dueAt?.toISOString().slice(0, 16).replace("T", " ")} UTC`, taskId: t.id });
    await logWorkActivity({ taskId: t.id, projectId: t.projectId, actorId: null, type: "DEADLINE_SOON", summary: "Deadline reminder sent (due within 24 hours)" });
  }

  const overdue = await prisma.workTask.findMany({
    where: { ...open, dueAt: { lt: now }, NOT: { id: { in: await sentFor("OVERDUE_NOTICE") } } },
    take: BATCH,
    select: { id: true, number: true, title: true, createdById: true, managerId: true, projectId: true },
  });
  for (const t of overdue) {
    const to = [...(await doersOf(t.id)), t.createdById, ...(t.managerId ? [t.managerId] : [])];
    await notifyWork(to, { title: `${taskCode(t.number)} is overdue`, message: t.title, taskId: t.id });
    await logWorkActivity({ taskId: t.id, projectId: t.projectId, actorId: null, type: "OVERDUE_NOTICE", summary: "Overdue — reminder sent" });
  }

  let nudged = 0;
  const days = Math.max(0, Number(await getSetting<number>("work.report_reminder_days", 3)) || 0);
  if (days > 0) {
    const since = new Date(now.getTime() - days * 24 * HOUR);
    const recentlyNudged = (
      await prisma.workActivity.findMany({ where: { type: "REPORT_NUDGE", createdAt: { gte: since } }, select: { taskId: true } })
    ).map((a) => a.taskId).filter((x): x is string => !!x);
    const quiet = await prisma.workTask.findMany({
      where: {
        status: { in: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
        createdAt: { lt: since },
        OR: [{ lastReportAt: null }, { lastReportAt: { lt: since } }],
        NOT: { id: { in: recentlyNudged } },
      },
      take: BATCH,
      select: { id: true, number: true, title: true, projectId: true },
    });
    for (const t of quiet) {
      await notifyWork(await doersOf(t.id), { title: `${taskCode(t.number)}: progress report due`, message: `No report for ${days} days — ${t.title}`, link: `/admin/work/tasks/${t.id}#report`, taskId: t.id });
      await logWorkActivity({ taskId: t.id, projectId: t.projectId, actorId: null, type: "REPORT_NUDGE", summary: `Reminder sent — no progress report for ${days} days` });
      nudged++;
    }
  }
  return { dueSoon: dueSoon.length, overdue: overdue.length, nudged };
}

/** Tasks that already got this one-time reminder. */
async function sentFor(type: string): Promise<string[]> {
  const rows = await prisma.workActivity.findMany({ where: { type }, select: { taskId: true }, distinct: ["taskId"] });
  return rows.map((r) => r.taskId).filter((x): x is string => !!x);
}
