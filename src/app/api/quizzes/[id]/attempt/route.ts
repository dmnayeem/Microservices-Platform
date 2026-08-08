import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import { getPointsPerUsd, usdToPoints } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { isDuplicateLedgerError } from "@/lib/idempotency";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/quizzes/[id]/attempt — score answers, record the attempt, and credit
// rewards once on the first passing attempt.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const quizRaw = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quizRaw || quizRaw.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Quiz not available" }, { status: 404 });
  }
  type QRow = {
    id: string;
    correctIndex: number;
    explanation: string | null;
  };
  const quiz = quizRaw as typeof quizRaw & { questions: QRow[] };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, package: { select: { accessLevel: true } } },
  });
  const accessLevel = me?.package?.accessLevel ?? 0;
  if (!me || me.level < quiz.requiredLevel) {
    return NextResponse.json({ error: "You don't meet the level requirement." }, { status: 403 });
  }
  if (quiz.requiredAccessLevel != null && accessLevel < quiz.requiredAccessLevel) {
    return NextResponse.json({ error: "Upgrade your plan to take this quiz." }, { status: 403 });
  }

  // Enforce attempt limit + cooldown (cooldown skipped once already passed).
  const prior = await prisma.quizAttempt.findMany({
    where: { userId, quizId: id },
    orderBy: { completedAt: "desc" },
    select: { passed: true, completedAt: true },
  });
  if (prior.length >= quiz.maxAttempts) {
    return NextResponse.json({ error: "No attempts left for this quiz." }, { status: 403 });
  }
  const everPassed = prior.some((a) => a.passed);
  if (!everPassed && prior[0]?.completedAt) {
    const cooldownEnd = prior[0].completedAt.getTime() + quiz.cooldownHours * 3600_000;
    if (Date.now() < cooldownEnd) {
      return NextResponse.json({ error: "This quiz is on cooldown." }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const answers = (body.answers ?? {}) as Record<string, number>;
  const timeTakenSec = Math.max(
    0,
    Math.min(quiz.timeLimitSec + 60, Number(body.timeTakenSec) || 0)
  );

  const total = quiz.questions.length;
  let correct = 0;
  const review = quiz.questions.map((q) => {
    const chosen = typeof answers[q.id] === "number" ? answers[q.id] : -1;
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) correct += 1;
    return {
      questionId: q.id,
      correctIndex: q.correctIndex,
      chosen,
      isCorrect,
      explanation: q.explanation ?? null,
    };
  });
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = percent >= quiz.passingScore;

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: id,
      userId,
      score: percent,
      passed,
      answers: JSON.parse(JSON.stringify(answers)),
      timeTakenSec,
      completedAt: new Date(),
    },
    select: { id: true },
  });

  // Reward once — only on the first passing attempt. `everPassed` is a
  // check-then-act read, so two concurrent passing attempts could both reach
  // here; a STABLE per-user-per-quiz reference (`quiz_reward_<userId>_<quizId>`)
  // makes the (userId, reference) unique enforce exactly one reward — the loser
  // hits P2002 and awards nothing.
  let pointsAwarded = 0;
  let xpAwarded = 0;
  if (passed && !everPassed) {
    xpAwarded = quiz.xpReward;
    // Quizzes are a platform activity → the reward is POINTS (which convert to
    // cash at the wallet threshold), never direct cash. Any configured cashReward
    // is folded into points at the current rate so it can't bypass the convert gate.
    const cash = toNum(quiz.cashReward);
    const pointsPerUsd = await getPointsPerUsd();
    pointsAwarded = quiz.pointsReward + usdToPoints(cash, pointsPerUsd);
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            pointsBalance: { increment: pointsAwarded },
            xp: { increment: xpAwarded },
            totalEarnings: { increment: pointsAwarded / pointsPerUsd },
          },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: TransactionType.EARNING,
            status: TransactionStatus.COMPLETED,
            points: pointsAwarded,
            amount: pointsAwarded / pointsPerUsd,
            description: `Passed quiz: ${quiz.title}`,
            reference: `quiz_reward_${userId}_${id}`,
            metadata: { quizId: id, attemptId: attempt.id, percent, xp: xpAwarded, cashFoldedToPoints: cash },
          },
        }),
        prisma.notification.create({
          data: {
            userId,
            type: NotificationType.ACHIEVEMENT,
            title: "🧠 Quiz passed!",
            message: `You scored ${percent}% on "${quiz.title}" and earned ${pointsAwarded} pts + ${xpAwarded} XP.`,
            data: { quizId: id, percent, points: pointsAwarded, xp: xpAwarded },
          },
        }),
      ]);
    } catch (err) {
      // A concurrent passing attempt already claimed the one-time reward.
      if (!isDuplicateLedgerError(err)) throw err;
      pointsAwarded = 0;
      xpAwarded = 0;
    }
  }

  return NextResponse.json({
    score: correct,
    scoreMax: total,
    percent,
    passed,
    pointsAwarded,
    xpAwarded,
    timeTakenSec,
    review,
  });
}
