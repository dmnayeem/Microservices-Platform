import type { Prisma } from "@/generated/prisma/client";

/**
 * A submission the user actually SENT.
 *
 * Opening a task creates a PENDING row with no `submittedAt` — that is a
 * visit, not a submission, and counting it made an admin see "6 submissions"
 * on a task nobody had submitted. Some older approval paths decide a row
 * without stamping `submittedAt`, so any row that has left PENDING counts too.
 */
export const DELIVERED_SUBMISSION: Prisma.TaskSubmissionWhereInput = {
  OR: [{ submittedAt: { not: null } }, { status: { not: "PENDING" } }],
};
