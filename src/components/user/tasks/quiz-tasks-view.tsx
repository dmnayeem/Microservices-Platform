"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Clock, Coins, Trophy, ListChecks } from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { QuizPlayer } from "./quiz-player";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ensureAdsAllowed } from "@/lib/adblock";
import { cn } from "@/lib/utils";

interface QuizRow {
  id: string;
  title: string;
  description?: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  questionCount: number;
  timeLimit: number;
  pointsReward: number;
  minScore: number;
  locked?: boolean;
}

const DIFFICULTY_TONE: Record<QuizRow["difficulty"], string> = {
  BEGINNER: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  INTERMEDIATE: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  ADVANCED: "bg-red-500/10 text-red-400 border-red-500/30",
};

export function QuizTasksView() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/tasks/quiz", { cache: "no-store" });
      const d = r.ok ? await r.json() : { quizzes: [] };
      setQuizzes(d.quizzes ?? []);
    } catch {
      setQuizzes([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load(true));

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <Brain className="w-6 h-6 text-purple-400" /> Quiz Tasks
      </h1>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={3} />}

      {!loading && quizzes.length === 0 && (
        <EmptyState
          icon={Brain}
          title="No quizzes available"
          description="New quizzes are added regularly. Check back soon."
        />
      )}

      {!loading && quizzes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quizzes.map((q) => (
            <button
              key={q.id}
              disabled={q.locked}
              onClick={async () => {
                if (q.locked) return;
                if (await ensureAdsAllowed()) setActiveId(q.id);
              }}
              className={cn(
                "text-left rounded-2xl border border-gray-800 bg-gray-900 p-4 transition-colors",
                q.locked
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-indigo-500/40"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                  📚
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white line-clamp-2">
                    {q.title}
                  </p>
                  <span
                    className={cn(
                      "inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                      DIFFICULTY_TONE[q.difficulty]
                    )}
                  >
                    {q.difficulty}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <ListChecks className="w-3 h-3" />
                  {q.questionCount} Qs
                </span>
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <Clock className="w-3 h-3" />
                  {q.timeLimit}m
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                  <Coins className="w-3 h-3" />+{q.pointsReward}
                </span>
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <Trophy className="w-3 h-3" />
                  Min {q.minScore}%
                </span>
              </div>
              <div
                className={cn(
                  "mt-3 w-full py-2 rounded-lg text-xs font-bold text-center",
                  q.locked
                    ? "bg-gray-800 text-gray-500"
                    : "bg-indigo-500 text-white"
                )}
              >
                {q.locked ? "🔒 Locked" : "Start Quiz →"}
              </div>
            </button>
          ))}
        </div>
      )}

      {activeId && (
        <QuizPlayer quizId={activeId} onClose={() => setActiveId(null)} />
      )}
    </div>
  );
}
