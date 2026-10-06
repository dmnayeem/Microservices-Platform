import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { maybeIssueCertificate } from "@/lib/course-certificate";
import { QUIZ_TIME_GRACE_MS } from "@/lib/course-access";

const submitSchema = z.object({
  answers: z.record(z.string(), z.array(z.string()).max(50)),
});

/** Normalise an answer list into a de-duplicated set. */
function answerSet(list: unknown[]): Set<string> {
  return new Set(
    list
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s.length > 0)
  );
}

// POST /api/courses/:id/quiz/:quizId/attempts
// Grades the attempt against stored correctAnswers and saves the result.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id, quizId } = await params;
    const body = await req.json();
    const v = submitSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId } },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
    }
    // Accelerate's typed client collapses nested selects; assert the shape.
    const quiz = (await prisma.courseQuiz.findUnique({
      where: { id: quizId },
      select: {
        courseId: true,
        passMarkPercent: true,
        timeLimitMinutes: true,
        maxAttempts: true,
        questions: {
          orderBy: { order: "asc" },
          select: { id: true, correctAnswers: true, points: true },
        },
      },
    })) as unknown as {
      courseId: string;
      passMarkPercent: number;
      timeLimitMinutes: number | null;
      maxAttempts: number | null;
      questions: Array<{ id: string; correctAnswers: unknown; points: number }>;
    } | null;
    if (!quiz || quiz.courseId !== course.id) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    // ── Attempt limit ────────────────────────────────────────────────────
    // Only SUBMITTED attempts count. An open (unsubmitted) row is just the
    // server-side start marker for a timed quiz — see the GET route.
    const usedAttempts = await prisma.courseQuizAttempt.count({
      where: { quizId, userId, submittedAt: { not: null } },
    });
    const maxAttempts = quiz.maxAttempts && quiz.maxAttempts > 0 ? quiz.maxAttempts : null;
    if (maxAttempts !== null && usedAttempts >= maxAttempts) {
      return NextResponse.json(
        { error: `You have used all ${maxAttempts} attempts for this quiz.` },
        { status: 409 }
      );
    }

    // ── Time limit ───────────────────────────────────────────────────────
    // The clock starts when the quiz is opened (GET writes an open attempt
    // with a server `startedAt`). A submission with no open attempt, or one
    // that arrives after the limit, is refused — the client cannot claim
    // its own start time.
    let openAttemptId: string | null = null;
    if (quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0) {
      const open = await prisma.courseQuizAttempt.findFirst({
        where: { quizId, userId, submittedAt: null },
        orderBy: { startedAt: "desc" },
        select: { id: true, startedAt: true },
      });
      if (!open) {
        return NextResponse.json(
          { error: "Open the quiz again to start a timed attempt." },
          { status: 409 }
        );
      }
      const deadline =
        open.startedAt.getTime() + quiz.timeLimitMinutes * 60_000 + QUIZ_TIME_GRACE_MS;
      if (Date.now() > deadline) {
        // Close the expired attempt as a fail so it counts toward the limit.
        await prisma.courseQuizAttempt.updateMany({
          where: { id: open.id, submittedAt: null },
          data: { submittedAt: new Date(), score: 0, passed: false },
        });
        return NextResponse.json(
          { error: "Time is up for this attempt." },
          { status: 409 }
        );
      }
      openAttemptId = open.id;
    }

    // ── Grade ────────────────────────────────────────────────────────────
    // Set comparison on de-duplicated answers. The old check compared
    // lengths of the RAW arrays, so ["a","a"] matched an expected ["a","b"].
    let earned = 0;
    let total = 0;
    const correctIds: string[] = [];
    for (const q of quiz.questions) {
      total += q.points;
      const expected = answerSet(
        Array.isArray(q.correctAnswers) ? (q.correctAnswers as unknown[]) : []
      );
      const sent = answerSet(v.data.answers[q.id] ?? []);
      const isRight =
        expected.size > 0 &&
        sent.size === expected.size &&
        [...sent].every((s) => expected.has(s));
      if (isRight) {
        earned += q.points;
        correctIds.push(q.id);
      }
    }
    const score = total === 0 ? 0 : (earned / total) * 100;
    const passed = score >= quiz.passMarkPercent;

    let attemptId: string;
    if (openAttemptId) {
      // CAS on submittedAt so a double-submit cannot grade one attempt twice.
      const closed = await prisma.courseQuizAttempt.updateMany({
        where: { id: openAttemptId, submittedAt: null },
        data: {
          answers: v.data.answers as unknown as object,
          score,
          passed,
          submittedAt: new Date(),
        },
      });
      if (closed.count === 0) {
        return NextResponse.json(
          { error: "This attempt was already submitted." },
          { status: 409 }
        );
      }
      attemptId = openAttemptId;
    } else {
      const attempt = await prisma.courseQuizAttempt.create({
        data: {
          quizId,
          userId,
          answers: v.data.answers as unknown as object,
          score,
          passed,
          submittedAt: new Date(),
        },
      });
      attemptId = attempt.id;
    }

    // If they passed, see whether this completes the course's quiz-pass
    // requirement → auto-issue certificate.
    if (passed) {
      await maybeIssueCertificate(enrollment.id);
    }

    const attemptsLeft =
      maxAttempts === null ? null : Math.max(0, maxAttempts - (usedAttempts + 1));
    // Only reveal which answers were right once the learner can no longer
    // use that to retake: after a pass, or when attempts are exhausted.
    const reveal = passed || attemptsLeft === 0;

    return NextResponse.json({
      attempt: {
        id: attemptId,
        score,
        passed,
        correctIds: reveal ? correctIds : [],
        attemptsLeft,
      },
    });
  } catch (error) {
    console.error("Quiz submit failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
