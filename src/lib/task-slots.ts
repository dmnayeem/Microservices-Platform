import { prisma } from "@/lib/prisma";

/**
 * Close a task once its global slot count is full.
 *
 * `totalLimit` is checked in `/api/tasks/[id]/start` (and the article and quiz
 * equivalents) before a submission is created, but nothing ever closed the task
 * afterwards. So a task whose last slot was taken stayed ACTIVE forever: it kept
 * appearing in every list, and every user who opened it got as far as "start"
 * before being told it was full. A live audit found two of them sitting in
 * production that way.
 *
 * Called after the counter is incremented, on every path that increments it —
 * auto-approval, admin approval and the inline quiz payout. Deliberately
 * separate from those transactions and never allowed to throw: the reward has
 * already been paid and committed at this point, and failing to tidy up the
 * task's status must not turn a successful payout into a 500.
 *
 * `updateMany` with the status in the WHERE is what makes it safe to call twice
 * — the second call matches nothing.
 */
export async function closeTaskIfFull(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { totalLimit: true, completedCount: true, status: true },
    });
    if (!task?.totalLimit || task.totalLimit <= 0) return;
    if (task.completedCount < task.totalLimit) return;
    if (task.status !== "ACTIVE") return;
    await prisma.task.updateMany({
      where: { id: taskId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  } catch {
    // Housekeeping only — the payout above is already committed.
  }
}
