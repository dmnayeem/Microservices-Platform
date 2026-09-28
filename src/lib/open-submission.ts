import "server-only";
import { prisma } from "@/lib/prisma";
import { SubmissionStatus } from "@/generated/prisma/client";

/**
 * Open (start) a submission, or return the one already open.
 *
 * A partial unique index allows one PENDING, not-yet-submitted row per user
 * per task (migration 20260928200000). Two starts at once — a double tap, two
 * tabs — used to open two rows past the daily limit; now the second create
 * fails and gets the first row back.
 */
export async function openSubmission(taskId: string, userId: string) {
  try {
    return await prisma.taskSubmission.create({
      data: { taskId, userId, status: SubmissionStatus.PENDING },
    });
  } catch (err) {
    if ((err as { code?: unknown })?.code !== "P2002") throw err;
    const open = await prisma.taskSubmission.findFirst({
      where: { taskId, userId, status: SubmissionStatus.PENDING, submittedAt: null },
    });
    if (!open) throw err;
    return open;
  }
}
