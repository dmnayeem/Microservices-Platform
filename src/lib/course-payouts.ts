/**
 * Held tutor payouts for paid course enrolments.
 *
 * The tutor used to be credited the moment a student enrolled. A refund inside
 * the refund window then had to claw that back out of a balance the tutor may
 * already have withdrawn; the clawback was clamped and the shortfall lost.
 * Same fix as the marketplace (`payOrHoldSeller` + `releaseDuePayouts`): the
 * share is parked in a `CourseTutorPayout` row for at least the refund window,
 * a refund reverses the untouched row, and the `course-tutor-payouts`
 * scheduler job pays it out once due.
 *
 * Running the release twice is harmless: the status flip is a compare-and-set
 * in the UPDATE's WHERE clause.
 */
import { prisma } from "@/lib/prisma";
import type { LedgerDb } from "@/lib/ledger";
import { D, toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;

/**
 * Pay the tutor's share now (holdDays = 0) or park it. Call INSIDE the
 * enrolment transaction, in place of crediting the tutor directly.
 */
export async function payOrHoldTutor(
  tx: LedgerDb,
  args: {
    tutorId: string;
    courseId: string;
    enrollmentId: string;
    amount: number;
    holdDays: number;
  }
): Promise<{ held: boolean; releaseAt: Date | null }> {
  const amount = toNum(args.amount);
  if (!(amount > 0)) return { held: false, releaseAt: null };

  if (!(args.holdDays > 0)) {
    await tx.user.update({
      where: { id: args.tutorId },
      data: {
        cashBalance: { increment: D(amount) },
        totalEarnings: { increment: D(amount) },
      },
    });
    return { held: false, releaseAt: null };
  }

  const releaseAt = new Date(Date.now() + args.holdDays * DAY_MS);
  await tx.courseTutorPayout.create({
    data: {
      enrollmentId: args.enrollmentId,
      courseId: args.courseId,
      tutorId: args.tutorId,
      amount: D(amount),
      status: "HELD",
      releaseAt,
    },
  });
  return { held: true, releaseAt };
}

/**
 * Reverse a still-HELD tutor payout for a refunded enrolment. Returns the
 * amount that was held (and is therefore no longer owed by the tutor), 0 when
 * there was none or it had already been released.
 */
export async function reverseHeldTutorPayout(
  tx: LedgerDb,
  enrollmentId: string,
  reason: string
): Promise<number> {
  const row = await tx.courseTutorPayout.findUnique({
    where: { enrollmentId },
    select: { id: true, amount: true, status: true },
  });
  if (!row || row.status !== "HELD") return 0;
  const done = await tx.courseTutorPayout.updateMany({
    where: { id: row.id, status: "HELD" },
    data: { status: "REVERSED", reversedAt: new Date(), reason: reason.slice(0, 300) },
  });
  return done.count > 0 ? toNum(row.amount) : 0;
}

export type TutorReleaseSummary = {
  examined: number;
  released: number;
  amount: number;
  skipped: number;
};

export function summariseTutorReleases(s: TutorReleaseSummary): string {
  if (s.examined === 0) return "No tutor payouts due.";
  const bits = [`released ${s.released} of ${s.examined}`, usd(s.amount)];
  if (s.skipped) bits.push(`${s.skipped} skipped (refund pending or taken by another tick)`);
  return `${bits.join(", ")}.`;
}

export async function releaseDueTutorPayouts(
  opts: { limit?: number } = {}
): Promise<TutorReleaseSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200));
  const summary: TutorReleaseSummary = { examined: 0, released: 0, amount: 0, skipped: 0 };

  const due = await prisma.courseTutorPayout.findMany({
    where: { status: "HELD", releaseAt: { lte: new Date() } },
    orderBy: { releaseAt: "asc" },
    take: limit,
  });
  summary.examined = due.length;
  if (due.length === 0) return summary;

  const courses = await prisma.course.findMany({
    where: { id: { in: [...new Set(due.map((r) => r.courseId))] } },
    select: { id: true, title: true },
  });
  const titles = new Map(courses.map((c) => [c.id, c.title]));

  for (const row of due) {
    const amount = toNum(row.amount);
    try {
      await prisma.$transaction(async (tx) => {
        // A refund still waiting for an admin keeps the money held: paying it
        // out now is exactly the clawback the hold exists to avoid.
        const pendingRefund = await tx.courseRefundRequest.count({
          where: { enrollmentId: row.enrollmentId, status: "PENDING" },
        });
        if (pendingRefund > 0) throw new Error("REFUND_PENDING");

        const claimed = await tx.courseTutorPayout.updateMany({
          where: { id: row.id, status: "HELD", amount: row.amount },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_SETTLED");
        if (!(amount > 0)) return;

        await tx.user.update({
          where: { id: row.tutorId },
          data: {
            cashBalance: { increment: D(amount) },
            totalEarnings: { increment: D(amount) },
          },
        });
        await tx.tutorProfile.updateMany({
          where: { userId: row.tutorId },
          data: { totalEarningsCents: { increment: Math.round(amount * 100) } },
        });
        await tx.transaction.create({
          data: {
            userId: row.tutorId,
            type: TransactionType.COURSE_TUTOR_EARNING,
            status: TransactionStatus.COMPLETED,
            amount: D(amount),
            points: 0,
            description: `Course earning released — "${titles.get(row.courseId) ?? "course"}"`,
            reference: `course_tutor_payout_${row.id}`,
            metadata: {
              payoutId: row.id,
              courseId: row.courseId,
              enrollmentId: row.enrollmentId,
            },
          },
        });
      });
      if (amount > 0) {
        summary.released++;
        summary.amount += amount;
      }
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message === "ALREADY_SETTLED" || e.message === "REFUND_PENDING")
      ) {
        summary.skipped++;
        continue;
      }
      console.error(`[course-payouts] could not release ${row.id}:`, e);
    }
  }

  summary.amount = Math.round(summary.amount * 100) / 100;
  return summary;
}
