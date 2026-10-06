import "server-only";
import { prisma } from "@/lib/prisma";
import { SubmissionStatus } from "@/generated/prisma/client";
import type { LedgerDb } from "@/lib/ledger";

/** Thrown by openSubmission when its locked guard refuses the start. */
export class OpenSubmissionBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenSubmissionBlocked";
  }
}

/**
 * Re-checks a start gate (daily limit, cooldown) under the user-row lock.
 * Return a user-facing message to refuse, or null to allow.
 */
export type OpenSubmissionGuard = (
  tx: LedgerDb
) => Promise<string | null>;

/**
 * Open (start) a submission, or return the one already open.
 *
 * A partial unique index allows one PENDING, not-yet-submitted row per user
 * per task (migration 20260928200000). Two starts at once — a double tap, two
 * tabs — used to open two rows past the daily limit; now the second create
 * fails and gets the first row back.
 *
 * With a `guard`, the user's row is locked (SELECT … FOR UPDATE) and the guard
 * re-runs its count inside the same transaction as the insert. The callers'
 * daily-limit / cooldown checks were count-then-insert: once the first attempt
 * had been SUBMITTED (so the open-row index no longer applied), two concurrent
 * starts could both count N-1 and both insert, past the limit. Under the lock
 * the second start waits, then counts the first one's row. Throws
 * OpenSubmissionBlocked with the guard's message when it refuses.
 */
export async function openSubmission(
  taskId: string,
  userId: string,
  guard?: OpenSubmissionGuard
) {
  try {
    if (!guard) {
      return await prisma.taskSubmission.create({
        data: { taskId, userId, status: SubmissionStatus.PENDING },
      });
    }
    return await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const blocked = await guard(tx);
        if (blocked) throw new OpenSubmissionBlocked(blocked);
        return tx.taskSubmission.create({
          data: { taskId, userId, status: SubmissionStatus.PENDING },
        });
      },
      { timeout: 15_000, maxWait: 10_000 }
    );
  } catch (err) {
    if ((err as { code?: unknown })?.code !== "P2002") throw err;
    const open = await prisma.taskSubmission.findFirst({
      where: { taskId, userId, status: SubmissionStatus.PENDING, submittedAt: null },
    });
    if (!open) throw err;
    return open;
  }
}
