import type { Prisma, SubmissionStatus } from "@/generated/prisma/client";

/**
 * What a task submission's status MEANS, defined once.
 *
 * Two different counting mistakes were copied across the admin, and both made
 * numbers look plausible while being badly wrong:
 *
 *  1. "Waiting for review" counted every PENDING row. But pressing Start writes
 *     a PENDING row BEFORE the user has submitted anything, so abandoned
 *     attempts sat in the review queue for ever. On 2026-09-26 the tasks page
 *     said "Review Queue (408)"; 52 were actually waiting. The header badge and
 *     the submissions page already knew — they disagreed with the button that
 *     links to them.
 *
 *  2. "Completed" counted APPROVED only. Auto-approval is the MAJORITY of
 *     completions on this platform, so analytics reported 9 completed tasks in
 *     a 30-day window that really had 54.
 *
 * Every count of either should use these.
 */

/** A submission that counts as done and paid. */
export const COMPLETED_STATUSES: SubmissionStatus[] = ["APPROVED", "AUTO_APPROVED"];

/** Sent in by the user and waiting on a person. */
export const AWAITING_REVIEW_WHERE: Prisma.TaskSubmissionWhereInput = {
  status: "PENDING",
  submittedAt: { not: null },
};

/** Opened and not yet sent in — NOT work for a reviewer. */
export const IN_PROGRESS_WHERE: Prisma.TaskSubmissionWhereInput = {
  status: "PENDING",
  submittedAt: null,
};

/**
 * Completed within a time window.
 *
 * Dated by when it was approved, falling back to when it was created: some
 * auto-approved rows carry no `reviewedAt` (16 of 62 did), and filtering on
 * `reviewedAt` alone silently dropped them from "completed today".
 */
export function completedBetween(from: Date, to?: Date): Prisma.TaskSubmissionWhereInput {
  const range = { gte: from, ...(to ? { lt: to } : {}) };
  return {
    status: { in: COMPLETED_STATUSES },
    OR: [{ reviewedAt: range }, { reviewedAt: null, createdAt: range }],
  };
}
