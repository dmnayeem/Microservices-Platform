"use client";

import { useEffect, useState } from "react";
import { X, Clock, Loader2, Trophy, AlertTriangle, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
} from "@/components/user/primitives/task-upgrade-notice";

interface Question {
  id: string;
  prompt: string;
  options: string[];
}

interface QuizMeta {
  id: string;
  title: string;
  questionCount: number;
  timeLimitMinutes: number;
  pointsReward: number;
}

interface ResultData {
  score: number;
  scoreMax: number;
  percent: number;
  passed: boolean;
  pointsAwarded: number;
  timeTakenSec: number;
}

interface QuizPlayerProps {
  quizId: string;
  onClose: () => void;
}

type State = "loading" | "active" | "result" | "error";

export function QuizPlayer({ quizId, onClose }: QuizPlayerProps) {
  const [state, setState] = useState<State>("loading");
  const [meta, setMeta] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<ResultData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/quiz/${quizId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d) => {
        if (cancelled) return;
        setMeta(d.quiz);
        setQuestions(d.questions ?? []);
        setTimeLeft((d.quiz?.timeLimitMinutes ?? 5) * 60);
        setState("active");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  useEffect(() => {
    if (state !== "active") return;
    if (timeLeft <= 0) {
      submit();
      return;
    }
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, timeLeft]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/quiz/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Daily-mission allowance exhausted → surface the upgrade prompt.
        if (isUpgradeRequired(json)) {
          setUpgradeMsg(json.error || "");
          return;
        }
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const d: ResultData = await res.json();
      await runInterstitial();
      setResult(d);
      setState("result");
    } catch (err) {
      toast.error("Submit failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (upgradeMsg !== null) {
    return (
      <div className="fixed inset-0 z-100 bg-gray-950 overflow-y-auto">
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
          <TaskUpgradeNotice message={upgradeMsg} />
          <button
            onClick={onClose}
            className="mt-2 px-5 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const cur = questions[idx];
  const selected = cur ? answers[cur.id] : undefined;

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const lowTime = timeLeft < 60;

  return (
    <div className="fixed inset-0 z-100 bg-gray-950 overflow-y-auto">
      {state === "loading" && (
        <div className="min-h-screen flex flex-col items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
          <p className="text-sm">Loading Quiz…</p>
        </div>
      )}

      {state === "error" && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
          <p className="text-base font-semibold text-white">
            Failed to load quiz
          </p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Something went wrong loading the questions.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold"
          >
            Close
          </button>
        </div>
      )}

      {state === "active" && cur && (
        <>
          <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 truncate">
                  {meta?.title ?? "Quiz"}
                </p>
                <p className="text-sm font-bold text-white">
                  Q{idx + 1} of {questions.length}
                </p>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-sm tabular-nums",
                  lowTime
                    ? "bg-red-500/15 text-red-400"
                    : "bg-gray-800 text-white"
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                {mm}:{ss}
              </div>
              <button
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: "Quit quiz?",
                      description: "Your answers will be lost.",
                      tone: "warning",
                      confirmLabel: "Quit",
                    })
                  )
                    onClose();
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-w-3xl mx-auto mt-2 h-1 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-[width]"
                style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-6">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-base font-semibold text-white mb-4">
                {cur.prompt}
              </p>
              <div className="space-y-2">
                {cur.options.map((opt, oi) => {
                  const active = selected === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [cur.id]: oi }))
                      }
                      className={cn(
                        "w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors",
                        active
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-gray-700 bg-gray-950 hover:border-gray-600"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                          active
                            ? "border-indigo-500 bg-indigo-500"
                            : "border-gray-600"
                        )}
                      >
                        {active && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm text-white flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {idx > 0 && (
                <button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  className="px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold"
                >
                  Back
                </button>
              )}
              {idx < questions.length - 1 ? (
                <button
                  disabled={selected === undefined}
                  onClick={() => setIdx((i) => i + 1)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  Next Question
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  disabled={selected === undefined || submitting}
                  onClick={submit}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Submit Quiz
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {state === "result" && result && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center mb-4",
              result.passed
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {result.passed ? (
              <Trophy className="w-10 h-10" />
            ) : (
              <X className="w-10 h-10" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {result.passed ? "Quiz Completed!" : "Failed"}
          </h2>
          <p className="text-gray-400 mb-6">
            You scored {result.score} / {result.scoreMax} ({result.percent}%)
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-xs w-full mb-6">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <p className="text-[10px] uppercase font-bold text-gray-500">
                Time
              </p>
              <p className="text-base font-bold text-white tabular-nums">
                {Math.floor(result.timeTakenSec / 60)}:
                {String(result.timeTakenSec % 60).padStart(2, "0")}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <p className="text-[10px] uppercase font-bold text-gray-500">
                Points
              </p>
              <p className="text-base font-bold text-amber-400 tabular-nums">
                +{result.pointsAwarded}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold"
          >
            {result.passed ? "Claim Reward" : "Try Again Later"}
          </button>
        </div>
      )}
    </div>
  );
}
