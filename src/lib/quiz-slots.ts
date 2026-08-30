import { prisma } from "@/lib/prisma";

/**
 * "Turn the quiz off automatically once N people have done it."
 *
 * The cap counts DISTINCT users with a completed attempt, not attempts. Counting
 * attempts would let one person with three tries eat three places, and a quiz
 * capped at 10 would close after four people had played it.
 *
 * Modelled on `lib/task-slots.ts`, and for the same reason: the check that a
 * slot is free happens before the attempt, but nothing was ever closing the
 * thing afterwards, so a full quiz stayed in every list and turned people away
 * only after they had opened it.
 */

/** How many different people have completed this quiz. */
export async function quizParticipantCount(quizId: string): Promise<number> {
  const rows = await prisma.quizAttempt.findMany({
    where: { quizId, completedAt: { not: null } },
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}

/**
 * Archive the quiz if its participant cap is now full.
 *
 * Called after an attempt is recorded, outside that write. Never throws: the
 * attempt and any reward are already committed by this point, and failing to
 * tidy up must not turn a successful play into a 500.
 *
 * `updateMany` with the status in the WHERE makes it safe to call twice — the
 * second call matches nothing.
 */
export async function closeQuizIfFull(quizId: string): Promise<void> {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { maxParticipants: true, status: true },
    });
    if (!quiz?.maxParticipants || quiz.maxParticipants <= 0) return;
    if (quiz.status !== "PUBLISHED") return;
    const taken = await quizParticipantCount(quizId);
    if (taken < quiz.maxParticipants) return;
    await prisma.quiz.updateMany({
      where: { id: quizId, status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });
  } catch {
    // Housekeeping only — the attempt above is already committed.
  }
}
