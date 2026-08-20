import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishedQuizWhere } from "@/lib/task-visibility";

// GET /api/quizzes — published quizzes the current user qualifies for, with
// their per-quiz attempt state (for the /quizzes list cards).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, package: { select: { accessLevel: true } } },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const accessLevel = me.package?.accessLevel ?? 0;

  const quizzesRaw = await prisma.quiz.findMany({
    // Shared with the /tasks hub tile count so the two can't disagree.
    where: publishedQuizWhere({ level: me.level, accessLevel }),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      difficulty: true,
      timeLimitSec: true,
      passingScore: true,
      pointsReward: true,
      xpReward: true,
      maxAttempts: true,
      cooldownHours: true,
      _count: { select: { questions: true } },
    },
  });
  const quizzes = quizzesRaw as Array<
    (typeof quizzesRaw)[number] & { _count: { questions: number } }
  >;

  // This user's attempts across these quizzes.
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, quizId: { in: quizzes.map((q) => q.id) } },
    select: { quizId: true, score: true, passed: true, completedAt: true },
  });

  const byQuiz = new Map<
    string,
    { used: number; best: number; passed: boolean; lastAt: Date | null }
  >();
  for (const a of attempts) {
    const cur = byQuiz.get(a.quizId) ?? { used: 0, best: 0, passed: false, lastAt: null };
    cur.used += 1;
    cur.best = Math.max(cur.best, a.score);
    cur.passed = cur.passed || a.passed;
    if (a.completedAt && (!cur.lastAt || a.completedAt > cur.lastAt)) cur.lastAt = a.completedAt;
    byQuiz.set(a.quizId, cur);
  }

  const now = Date.now();
  const items = quizzes.map((q) => {
    const st = byQuiz.get(q.id);
    const cooldownUntil =
      st?.lastAt && !st.passed
        ? new Date(st.lastAt.getTime() + q.cooldownHours * 3600_000)
        : null;
    const attemptsLeft = Math.max(0, q.maxAttempts - (st?.used ?? 0));
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      category: q.category,
      difficulty: q.difficulty,
      questionCount: q._count.questions,
      timeLimitSec: q.timeLimitSec,
      passingScore: q.passingScore,
      pointsReward: q.pointsReward,
      xpReward: q.xpReward,
      maxAttempts: q.maxAttempts,
      attemptsUsed: st?.used ?? 0,
      attemptsLeft,
      bestScore: st?.best ?? null,
      everPassed: st?.passed ?? false,
      cooldownUntil:
        cooldownUntil && cooldownUntil.getTime() > now
          ? cooldownUntil.toISOString()
          : null,
    };
  });

  return NextResponse.json({ quizzes: items });
}
