import { assertPageVisible } from "@/lib/page-visibility-server";
import { planFeatureGate } from "@/lib/plan-gate";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/quizzes/[id] — data to PLAY a quiz. Never returns correctIndex or
// explanation (answers are scored server-side in /attempt).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plan switch (Admin → Packages): this plan may not use it.
  const planGated = await planFeatureGate(session.user.id, "quizGames");
  if (planGated) return planGated;
  // Super-admin page visibility: refuse when /quizzes is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/quizzes");
  if (pageHidden) return pageHidden;
  const userId = session.user.id;
  const { id } = await params;

  const quizRaw = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quizRaw || quizRaw.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  type QRow = {
    id: string;
    question: string;
    questionImageUrl: string | null;
    options: string[];
    optionImageUrls: string[];
  };
  const quiz = quizRaw as typeof quizRaw & { questions: QRow[] };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, package: { select: { accessLevel: true } } },
  });
  const accessLevel = me?.package?.accessLevel ?? 0;

  let canPlay = true;
  let reason: string | null = null;
  if (!me || me.level < quiz.requiredLevel) {
    canPlay = false;
    reason = `Requires level ${quiz.requiredLevel}.`;
  } else if (quiz.requiredAccessLevel != null && accessLevel < quiz.requiredAccessLevel) {
    canPlay = false;
    reason = "Upgrade your plan to unlock this quiz.";
  } else {
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId, quizId: id },
      orderBy: { completedAt: "desc" },
      select: { passed: true, completedAt: true },
    });
    if (attempts.length >= quiz.maxAttempts) {
      canPlay = false;
      reason = "You've used all your attempts for this quiz.";
    } else {
      const last = attempts[0];
      if (last?.completedAt) {
        const cooldownEnd = last.completedAt.getTime() + quiz.cooldownHours * 3600_000;
        if (Date.now() < cooldownEnd) {
          canPlay = false;
          reason = "This quiz is on cooldown. Try again later.";
        }
      }
    }
  }

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      difficulty: quiz.difficulty,
      timeLimitSec: quiz.timeLimitSec,
      passingScore: quiz.passingScore,
      pointsReward: quiz.pointsReward,
      xpReward: quiz.xpReward,
    },
    questions: quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      questionImageUrl: q.questionImageUrl,
      options: q.options,
      optionImageUrls: q.optionImageUrls,
    })),
    canPlay,
    reason,
  });
}
