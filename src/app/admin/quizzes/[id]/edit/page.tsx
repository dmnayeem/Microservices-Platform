import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { QuizForm, type QuizEditInitial } from "@/components/admin/quizzes/quiz-form";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "quizzes.manage"))) redirect("/admin/quizzes");

  const { id } = await params;
  const quizRaw = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quizRaw) notFound();
  type QRow = {
    question: string;
    questionImageUrl: string | null;
    options: string[];
    optionImageUrls: string[];
    correctIndex: number;
    explanation: string | null;
    pointsValue: number;
  };
  const quiz = quizRaw as typeof quizRaw & { questions: QRow[] };

  const canUseAI =
    await can(session.user.id, "ai.manage") || await can(session.user.id, "quizzes.manage");

  const initial: QuizEditInitial = {
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    difficulty: quiz.difficulty as "EASY" | "MEDIUM" | "HARD",
    status: quiz.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    timeLimitSec: quiz.timeLimitSec,
    passingScore: quiz.passingScore,
    pointsReward: quiz.pointsReward,
    xpReward: quiz.xpReward,
    cashReward: toNum(quiz.cashReward),
    maxAttempts: quiz.maxAttempts,
    cooldownHours: quiz.cooldownHours,
    repeat: quiz.repeat as "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY",
    maxParticipants: quiz.maxParticipants,
    // ISO in, local wall-clock out — the form converts for the input.
    startsAt: quiz.startsAt ? quiz.startsAt.toISOString() : null,
    expiresAt: quiz.expiresAt ? quiz.expiresAt.toISOString() : null,
    requiredLevel: quiz.requiredLevel,
    requiredAccessLevel: quiz.requiredAccessLevel,
    questions: quiz.questions.map((q) => ({
      question: q.question,
      questionImageUrl: q.questionImageUrl ?? "",
      options: q.options,
      optionImageUrls: q.optionImageUrls,
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? "",
      pointsValue: q.pointsValue,
    })),
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/quizzes"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Edit Quiz</h1>
          <p className="text-sm text-slate-400">
            Update questions, images, rewards, and settings.
          </p>
        </div>
      </div>

      <QuizForm canUseAI={canUseAI} initial={initial} quizId={id} />
    </div>
  );
}
