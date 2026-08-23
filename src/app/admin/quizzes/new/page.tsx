import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuizForm } from "@/components/admin/quizzes/quiz-form";

export default async function CreateQuizPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "quizzes.manage"))) redirect("/admin/quizzes");

  const canUseAI = await can(session.user.id, "ai.manage") || await can(session.user.id, "quizzes.manage");

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
          <h1 className="text-2xl font-bold text-white">Create Quiz</h1>
          <p className="text-sm text-slate-400">
            Build manually or generate questions with Gemini AI
          </p>
        </div>
      </div>

      <QuizForm canUseAI={canUseAI} />
    </div>
  );
}
