import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTaskQuiz, isGeminiConfigured } from "@/lib/gemini";
import { TaskType, TaskStatus } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import {
  getTaskViewerContext,
  visibleTaskWhere,
} from "@/lib/task-visibility";
import {
  getActiveMissionForUser,
  buildDailyProgress,
  resolveTaskTypeBucket,
} from "@/lib/daily-mission-progress";
import {
  coerceQuizQuestions,
  coerceQuizAnswers,
  type QuizQuestionShape,
} from "@/lib/quiz-shape";

/**
 * Strip the answer key before sending a quiz to the browser.
 *
 * The player only needs the prompt and the options. It used to receive
 * `correctAnswer` on every question, which meant the answers were sitting in
 * the network tab of anyone who opened dev tools.
 */
function toPlayerQuestions(questions: QuizQuestionShape[]) {
  return questions.map((q, i) => ({
    id: i,
    question: q.question,
    options: q.options,
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
  }));
}

// GET /api/tasks/quiz - Get quiz for a specific task or generate new one
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    // No taskId → list available QUIZ tasks (with sequential-unlock lock state)
    // for the quiz tab. mirrors the video/social list gating.
    if (!taskId) {
      // Same visibility rules as /api/tasks. This list previously skipped
      // `hidden`, the start/expiry windows and the plan gates entirely, so
      // hidden, expired and plan-disabled quiz tasks showed up here — which is
      // how the user's quiz count ran ahead of what admin considered live.
      const ctx = await getTaskViewerContext(session.user.id);
      if (!ctx || !ctx.hasTasksFeature) {
        return NextResponse.json({ quizzes: [] });
      }
      const quizTasks = await prisma.task.findMany({
        where: visibleTaskWhere(ctx.viewer, {
          accessLevel: ctx.accessLevel,
          allowedTypes: ctx.allowedTypes,
          type: TaskType.QUIZ,
        }),
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        take: 50,
      });
      const { lockedTaskIds } = await getTaskChainState(session.user.id);
      return NextResponse.json({
        quizzes: quizTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? undefined,
          difficulty: (t.difficulty as string) || "BEGINNER",
          questionCount: coerceQuizQuestions(t.questions)?.length ?? 0,
          timeLimit: 0,
          pointsReward: t.pointsReward,
          minScore: 70,
          locked: lockedTaskIds.has(t.id),
        })),
      });
    }

    // Get the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if task is a quiz type
    if (task.type !== TaskType.QUIZ) {
      return NextResponse.json(
        { error: "This task is not a quiz" },
        { status: 400 }
      );
    }

    // Check if task is active
    if (task.status !== TaskStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This task is not available" },
        { status: 400 }
      );
    }

    // Use pre-defined questions when present and valid (parses string-encoded
    // rows). Invalid/empty → fall through to AI generation.
    const predefined = coerceQuizQuestions(task.questions);
    if (predefined) {
      return NextResponse.json({
        taskId: task.id,
        title: task.title,
        description: task.description,
        questions: toPlayerQuestions(predefined),
        pointsReward: task.pointsReward,
        xpReward: task.xpReward,
        isAIGenerated: false,
      });
    }

    // Generate questions using AI if not pre-defined
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "Quiz generation is not available" },
        { status: 503 }
      );
    }

    const result = await generateTaskQuiz(
      task.title,
      task.description,
      task.contentUrl || undefined
    );

    if (!result.success || !result.questions) {
      return NextResponse.json(
        { error: result.error || "Failed to generate quiz" },
        { status: 500 }
      );
    }

    // Persist what was generated. Grading reads the answer key from the task
    // row (see POST), so an AI quiz that lived only in the response would have
    // nothing to grade against. It also means one Gemini call per task instead
    // of one per user, and every user sees the same quiz.
    const generated = coerceQuizQuestions(result.questions);
    if (!generated) {
      return NextResponse.json(
        { error: "Failed to parse generated quiz" },
        { status: 500 }
      );
    }
    await prisma.task
      .update({
        where: { id: task.id },
        data: { questions: generated as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {}); // best-effort: a failed write just regenerates next time

    return NextResponse.json({
      taskId: task.id,
      title: task.title,
      description: task.description,
      questions: toPlayerQuestions(generated),
      pointsReward: task.pointsReward,
      xpReward: task.xpReward,
      isAIGenerated: true,
    });
  } catch (error) {
    console.error("Error getting quiz:", error);
    return NextResponse.json(
      { error: "Failed to get quiz" },
      { status: 500 }
    );
  }
}

// POST /api/tasks/quiz - Submit quiz answers
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // `questions` is still accepted from older clients but is NEVER read — see
    // the grading block below.
    const { taskId, answers } = body;

    if (!taskId || !answers) {
      return NextResponse.json(
        { error: "Task ID and answers are required" },
        { status: 400 }
      );
    }

    // Get the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if task is a quiz type
    if (task.type !== TaskType.QUIZ) {
      return NextResponse.json(
        { error: "This task is not a quiz" },
        { status: 400 }
      );
    }

    // Check if user already submitted today — boundary is the user's LOCAL midnight.
    const { startOfDayUtc: todayStart } = await getUserDayContext(session.user.id);

    const existingSubmission = await prisma.taskSubmission.findFirst({
      where: {
        taskId,
        userId: session.user.id,
        createdAt: { gte: todayStart },
      },
    });

    if (existingSubmission) {
      return NextResponse.json(
        { error: "You have already completed this quiz today" },
        { status: 400 }
      );
    }

    // Sequential-unlock gate (feature #7) — same guard as /api/tasks/[id]/start
    // so the quiz submit path can't bypass a locked task. No-ops for admins /
    // when the toggle is off.
    const { lockedTaskIds } = await getTaskChainState(session.user.id);
    if (lockedTaskIds.has(taskId)) {
      return NextResponse.json(
        {
          error: "Complete the previous task first to unlock this one.",
          code: "TASK_LOCKED",
        },
        { status: 403 }
      );
    }

    // Daily-mission cap — quizzes count against the mission's QUIZ target
    // (mirrors /api/tasks/[id]/start so this alt path can't bypass it).
    const mission = await getActiveMissionForUser(session.user.id);
    if (mission && mission.items.length > 0) {
      const item = mission.items.find(
        (it) => resolveTaskTypeBucket(it.taskType) === "QUIZ"
      );
      if (!item) {
        return NextResponse.json(
          {
            error:
              "This task isn't part of your daily mission. Upgrade your plan to unlock more tasks.",
            code: "UPGRADE_REQUIRED",
          },
          { status: 403 }
        );
      }
      const countByType = await buildDailyProgress(session.user.id, mission.items);
      if ((countByType["QUIZ"] ?? 0) >= item.targetCount) {
        return NextResponse.json(
          {
            error:
              "You've finished today's quiz tasks in your daily mission. Upgrade your plan for more.",
            code: "UPGRADE_REQUIRED",
          },
          { status: 403 }
        );
      }
    }

    // Grade against the ANSWER KEY IN THE DATABASE, never the one the browser
    // sent. This route used to score `answers[i] === questions[i].correctAnswer`
    // where BOTH sides came from the request body, so posting a one-question
    // quiz with your own correct answer scored 100% and paid the full reward.
    // The task row is now the only source of truth; `body.questions` is ignored.
    const key = coerceQuizQuestions(task.questions);
    if (!key) {
      return NextResponse.json(
        { error: "This quiz has no questions configured. Reopen it and try again." },
        { status: 409 }
      );
    }

    const picks = coerceQuizAnswers(answers);
    let correctAnswers = 0;
    const totalQuestions = key.length;
    const results: Array<{
      questionId: number;
      isCorrect: boolean;
      userAnswer: number | null;
      correctAnswer: number;
    }> = [];

    for (let i = 0; i < key.length; i++) {
      const userAnswer = picks[i] ?? null;
      const isCorrect =
        userAnswer !== null && userAnswer === key[i].correctAnswer;
      if (isCorrect) correctAnswers++;
      results.push({
        questionId: i,
        isCorrect,
        userAnswer,
        correctAnswer: key[i].correctAnswer,
      });
    }

    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const passed = score >= 70; // 70% passing threshold

    // Calculate rewards based on score
    const pointsEarned = passed ? Math.round(task.pointsReward * (score / 100)) : 0;
    const xpEarned = passed ? Math.round(task.xpReward * (score / 100)) : 0;

    const answersJson = {
      questions: key.map((q) => q.question),
      userAnswers: picks,
      results,
    };

    // On a PASS, create the submission ATOMICALLY with the credit: an
    // interactive transaction so a mid-credit failure rolls the submission back
    // too. Otherwise a stranded AUTO_APPROVED row would block the retry
    // ("already completed this quiz today") and the user would lose the day's
    // reward. On a fail there's no credit, so a plain create is fine.
    const submission = passed
      ? await prisma.$transaction(async (tx) => {
          const pointsPerUsd = await getPointsPerUsd();
          const sub = await tx.taskSubmission.create({
            data: {
              taskId,
              userId: session.user.id,
              status: "AUTO_APPROVED",
              answers: answersJson,
              score,
              pointsEarned,
              xpEarned,
            },
          });
          await tx.user.update({
            where: { id: session.user.id },
            data: {
              pointsBalance: { increment: pointsEarned },
              xp: { increment: xpEarned },
              totalEarnings: { increment: pointsEarned / pointsPerUsd },
            },
          });
          await tx.task.update({
            where: { id: taskId },
            data: { completedCount: { increment: 1 } },
          });
          await tx.transaction.create({
            data: {
              userId: session.user.id,
              type: "EARNING",
              status: "COMPLETED",
              points: pointsEarned,
              amount: pointsEarned / pointsPerUsd,
              description: `Quiz completed: ${task.title} (Score: ${score}%)`,
              reference: `quiz_${sub.id}`,
              metadata: { taskId, score, correctAnswers, totalQuestions },
            },
          });
          return sub;
        })
      : await prisma.taskSubmission.create({
          data: {
            taskId,
            userId: session.user.id,
            status: "REJECTED",
            answers: answersJson,
            score,
            pointsEarned,
            xpEarned,
          },
        });

    return NextResponse.json({
      submissionId: submission.id,
      score,
      correctAnswers,
      totalQuestions,
      passed,
      pointsEarned,
      xpEarned,
      results: results.map((r, i) => ({
        ...r,
        question: key[i].question,
        explanation: key[i].explanation,
      })),
      message: passed
        ? `Congratulations! You scored ${score}% and earned ${pointsEarned} points!`
        : `You scored ${score}%. You need at least 70% to pass. Try again tomorrow!`,
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    return NextResponse.json(
      { error: "Failed to submit quiz" },
      { status: 500 }
    );
  }
}
