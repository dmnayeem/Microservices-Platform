import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUIZ_TIME_GRACE_MS } from "@/lib/course-access";

// GET /api/courses/:id/quiz/:quizId
// Returns the quiz + questions (correctAnswers omitted client-side).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, quizId } = await params;
    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, tutorId: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Must be enrolled (or own the course)
    const isOwner = course.tutorId === session.user.id;
    if (!isOwner) {
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
        select: { id: true },
      });
      if (!enrollment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const quizRaw = await prisma.courseQuiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            type: true,
            question: true,
            options: true,
            points: true,
          },
        },
      },
    });
    if (!quizRaw || (quizRaw as { courseId: string }).courseId !== course.id) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    const quiz = quizRaw as unknown as {
      id: string;
      title: string;
      description: string | null;
      passMarkPercent: number;
      timeLimitMinutes: number | null;
      maxAttempts: number | null;
      shuffleQuestions: boolean;
      questions: Array<{
        id: string;
        type: string;
        question: string;
        options: unknown;
        points: number;
      }>;
    };
    const questions = quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      points: q.points,
    }));
    // Attempts + server-side timer. Only submitted attempts count; for a
    // timed quiz an open (unsubmitted) attempt row marks when the clock
    // started, so the submit route can enforce the limit server-side.
    const maxAttempts =
      quiz.maxAttempts && quiz.maxAttempts > 0 ? quiz.maxAttempts : null;
    let attemptsUsed = 0;
    let startedAt: Date | null = null;
    if (!isOwner) {
      attemptsUsed = await prisma.courseQuizAttempt.count({
        where: { quizId, userId: session.user.id, submittedAt: { not: null } },
      });
      const canAttempt = maxAttempts === null || attemptsUsed < maxAttempts;
      if (quiz.timeLimitMinutes && quiz.timeLimitMinutes > 0 && canAttempt) {
        const open = await prisma.courseQuizAttempt.findFirst({
          where: { quizId, userId: session.user.id, submittedAt: null },
          orderBy: { startedAt: "desc" },
          select: { id: true, startedAt: true },
        });
        const limitMs = quiz.timeLimitMinutes * 60_000 + QUIZ_TIME_GRACE_MS;
        if (open && Date.now() - open.startedAt.getTime() <= limitMs) {
          startedAt = open.startedAt;
        } else {
          if (open) {
            // Expired without a submission — close it as a failed attempt.
            await prisma.courseQuizAttempt.updateMany({
              where: { id: open.id, submittedAt: null },
              data: { submittedAt: new Date(), score: 0, passed: false },
            });
            attemptsUsed += 1;
          }
          if (maxAttempts === null || attemptsUsed < maxAttempts) {
            const created = await prisma.courseQuizAttempt.create({
              data: { quizId, userId: session.user.id, answers: {} },
              select: { startedAt: true },
            });
            startedAt = created.startedAt;
          }
        }
      }
    }

    if (quiz.shuffleQuestions) {
      // Stable-enough shuffle for v1
      questions.sort(() => Math.random() - 0.5);
    }
    return NextResponse.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passMarkPercent: quiz.passMarkPercent,
        timeLimitMinutes: quiz.timeLimitMinutes,
        shuffleQuestions: quiz.shuffleQuestions,
        maxAttempts,
        attemptsLeft:
          maxAttempts === null ? null : Math.max(0, maxAttempts - attemptsUsed),
        startedAt: startedAt?.toISOString() ?? null,
        questions,
      },
    });
  } catch (error) {
    console.error("Get quiz failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
