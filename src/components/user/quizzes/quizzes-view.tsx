"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Clock,
  Coins,
  Trophy,
  ListChecks,
  Sparkles,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  questionCount: number;
  timeLimitSec: number;
  passingScore: number;
  pointsReward: number;
  xpReward: number;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsLeft: number;
  bestScore: number | null;
  everPassed: boolean;
  cooldownUntil: string | null;
}

const DIFF_TONE: Record<QuizRow["difficulty"], string> = {
  EASY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  HARD: "bg-red-500/10 text-red-400 border-red-500/30",
};

function cooldownLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.ceil((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function QuizzesView() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/quizzes", { cache: "no-store" });
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
    <div className="max-w-5xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Brain className="w-6 h-6 text-indigo-400" />
          Quiz Games
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Standalone knowledge games — separate from quiz <em>tasks</em>. Earn
          points &amp; XP.
        </p>
      </header>

      {loading && <ListSkeleton rows={4} />}

      {!loading && quizzes.length === 0 && (
        <EmptyState
          icon={Brain}
          title="No quizzes available"
          description="New quizzes are added regularly — check back soon."
        />
      )}

      {!loading && quizzes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quizzes.map((q) => {
            const onCooldown = !!q.cooldownUntil;
            const noAttempts = q.attemptsLeft <= 0;
            const locked = !q.everPassed && (onCooldown || noAttempts);
            return (
              <div
                key={q.id}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex flex-col hover:border-indigo-500/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shrink-0">
                    🧠
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white line-clamp-2">
                      {q.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                          DIFF_TONE[q.difficulty]
                        )}
                      >
                        {q.difficulty}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-400">
                        {q.category}
                      </span>
                      {q.everPassed && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Passed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {q.description && (
                  <p className="text-xs text-gray-400 line-clamp-2 mt-2">
                    {q.description}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <ListChecks className="w-3 h-3" />
                    {q.questionCount} Qs
                  </span>
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <Clock className="w-3 h-3" />
                    {Math.round(q.timeLimitSec / 60)}m
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                    <Coins className="w-3 h-3" />+{q.pointsReward}
                  </span>
                  <span className="inline-flex items-center gap-1 text-purple-400">
                    <Sparkles className="w-3 h-3" />+{q.xpReward} XP
                  </span>
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <Trophy className="w-3 h-3" />
                    Pass {q.passingScore}%
                  </span>
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    {q.bestScore != null ? `Best ${q.bestScore}%` : `${q.attemptsLeft}/${q.maxAttempts} left`}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-800">
                  {locked ? (
                    <div className="w-full py-2 rounded-lg bg-gray-800 text-gray-500 text-xs font-bold text-center inline-flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      {onCooldown
                        ? `Cooldown ${cooldownLabel(q.cooldownUntil!)}`
                        : "No attempts left"}
                    </div>
                  ) : (
                    <Link
                      href={`/quizzes/${q.id}`}
                      className="block w-full py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold text-center"
                    >
                      {q.everPassed ? "Play again" : "Start quiz →"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
