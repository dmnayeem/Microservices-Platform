"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Clock, Coins, Trophy, ListChecks } from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskListError } from "./task-list-error";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { QuizPlayer } from "./quiz-player";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ensureAdsAllowed } from "@/lib/adblock";
import { cn } from "@/lib/utils";
import { TaskDeviceChips, type TaskDeviceNeeds } from "@/components/user/primitives/task-card";

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
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/tasks/quiz", { cache: "no-store" });
      if (r.status >= 500) throw new Error(String(r.status)); // 4xx = gated: empty list
      const d = await r.json();
      setFailed(false);
      setQuizzes(d.quizzes ?? []);
    } catch {
      if (!silent) setFailed(true);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-400" />
          Quiz Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Answer quiz questions against the clock — hit the minimum score to earn
          your reward.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={3} />}

      {!loading && failed && <TaskListError onRetry={() => load()} />}

      {!loading && !failed && quizzes.length === 0 && (
        <EmptyState
          icon={Brain}
          title="No quizzes available"
          description="New quizzes are added regularly. Check back soon."
        />
      )}

      {!loading && !failed && quizzes.length > 0 && (
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
                // h-full + flex-col: quiz cards in one grid row end level, button at the foot.
                "text-left card card-interactive p-4 flex h-full flex-col",
                q.locked && "opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-linear-to-br from-(--app-grad-a) to-(--app-grad-b) flex items-center justify-center text-2xl">
                  📚
                </div>
                <div className="flex-1 min-w-0">
                  <p className="t-card-title text-white line-clamp-2">
                    {q.title}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                    <TaskDeviceChips needs={q as unknown as TaskDeviceNeeds} />
                  </div>
                  <span
                    className={cn(
                      "app-chip mt-1.5 uppercase",
                      DIFFICULTY_TONE[q.difficulty]
                    )}
                  >
                    {q.difficulty}
                  </span>
                </div>
              </div>
              {/* Was 11px with the reward in the same tiny grid; the reward is why
                  anyone opens a quiz, so it now leads the footer below. */}
              <div className="mt-3 grid grid-cols-3 gap-1.5 t-meta">
                <span className="inline-flex items-center gap-1 text-(--app-ink-2)">
                  <ListChecks className="w-3.5 h-3.5" />
                  {q.questionCount} Qs
                </span>
                <span className="inline-flex items-center gap-1 text-(--app-ink-2)">
                  <Clock className="w-3.5 h-3.5" />
                  {q.timeLimit}m
                </span>
                <span className="inline-flex items-center gap-1 text-(--app-ink-2)">
                  <Trophy className="w-3.5 h-3.5" />
                  Min {q.minScore}%
                </span>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="t-figure-sm inline-flex items-baseline gap-1 text-white whitespace-nowrap">
                  <Coins className="w-4 h-4 self-center text-amber-400" />+{q.pointsReward}
                </span>
              <div
                className={cn(
                  "app-tap-row inline-flex items-center justify-center px-4 rounded-(--app-r-control) text-sm font-extrabold",
                  q.locked
                    ? "bg-(--app-surface-2) text-(--app-ink-3)"
                    : "bg-(--app-cta) text-(--app-on-cta)"
                )}
              >
                {q.locked ? "🔒 Locked" : "Start Quiz →"}
              </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeId && (
        <QuizPlayer
          quizId={activeId}
          onClose={() => setActiveId(null)}
          minScore={quizzes.find((q) => q.id === activeId)?.minScore}
        />
      )}
    </div>
  );
}
