"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Loader2,
  Trophy,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Sparkles,
  Coins,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface PlayQuestion {
  id: string;
  question: string;
  questionImageUrl: string | null;
  options: string[];
  optionImageUrls: string[];
}
interface PlayQuiz {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  timeLimitSec: number;
  passingScore: number;
  pointsReward: number;
  xpReward: number;
}
interface ReviewItem {
  questionId: string;
  correctIndex: number;
  chosen: number;
  isCorrect: boolean;
  explanation: string | null;
}
interface Result {
  score: number;
  scoreMax: number;
  percent: number;
  passed: boolean;
  pointsAwarded: number;
  xpAwarded: number;
  timeTakenSec: number;
  review: ReviewItem[];
}

type State = "loading" | "blocked" | "active" | "result" | "error";

export function QuizRunner({ quizId }: { quizId: string }) {
  const [state, setState] = useState<State>("loading");
  const [quiz, setQuiz] = useState<PlayQuiz | null>(null);
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/quizzes/${quizId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d) => {
        if (cancel) return;
        setQuiz(d.quiz);
        setQuestions(d.questions ?? []);
        if (!d.canPlay) {
          setReason(d.reason ?? "This quiz isn't available right now.");
          setState("blocked");
          return;
        }
        setTimeLeft(d.quiz?.timeLimitSec ?? 180);
        setState("active");
      })
      .catch(() => !cancel && setState("error"));
    return () => {
      cancel = true;
    };
  }, [quizId]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const timeTakenSec = Math.round((Date.now() - startedAt) / 1000);
      const res = await fetch(`/api/quizzes/${quizId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, timeTakenSec }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResult(d);
      setState("result");
    } catch (err) {
      toast.error("Couldn't submit", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Countdown
  useEffect(() => {
    if (state !== "active") return;
    if (timeLeft <= 0) {
      void submit();
      return;
    }
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, timeLeft]);

  const cur = questions[idx];
  const selected = cur ? answers[cur.id] : undefined;
  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers]
  );

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const lowTime = timeLeft < 60;

  if (state === "loading") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
        <p className="text-sm text-gray-400">Loading quiz…</p>
      </div>
    );
  }

  if (state === "error" || state === "blocked") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">
          {state === "error" ? "Couldn't load quiz" : "Not available"}
        </h1>
        <p className="text-sm text-gray-400 mt-1 mb-5">
          {state === "blocked" ? reason : "Something went wrong. Try again."}
        </p>
        <Link
          href="/quizzes"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to quizzes
        </Link>
      </div>
    );
  }

  if (state === "result" && result) {
    return (
      <div className="max-w-2xl mx-auto py-4">
        <div className="text-center">
          <div
            className={cn(
              "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4",
              result.passed
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {result.passed ? <Trophy className="w-10 h-10" /> : <X className="w-10 h-10" />}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {result.passed ? "Quiz passed!" : "Not passed"}
          </h1>
          <p className="text-gray-400 mt-1">
            You scored {result.score}/{result.scoreMax} ({result.percent}%)
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto mt-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-gray-500">Time</p>
            <p className="text-base font-bold text-white tabular-nums">
              {Math.floor(result.timeTakenSec / 60)}:
              {String(result.timeTakenSec % 60).padStart(2, "0")}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-gray-500">Points</p>
            <p className="text-base font-bold text-amber-400 tabular-nums inline-flex items-center gap-0.5 justify-center">
              <Coins className="w-3.5 h-3.5" />+{result.pointsAwarded}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-gray-500">XP</p>
            <p className="text-base font-bold text-purple-400 tabular-nums inline-flex items-center gap-0.5 justify-center">
              <Sparkles className="w-3.5 h-3.5" />+{result.xpAwarded}
            </p>
          </div>
        </div>

        {result.pointsAwarded === 0 && result.passed && (
          <p className="text-center text-[11px] text-gray-500 mt-2">
            Reward already claimed on a previous pass.
          </p>
        )}

        {/* Review */}
        <div className="mt-6 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Review
          </p>
          {questions.map((q, i) => {
            const r = result.review.find((x) => x.questionId === q.id);
            const ok = r?.isCorrect;
            return (
              <div
                key={q.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-3"
              >
                <div className="flex items-start gap-2">
                  {ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">
                      <span className="text-gray-500">Q{i + 1}.</span>{" "}
                      {q.question || "(image question)"}
                    </p>
                    <p className="text-xs mt-1 text-emerald-400">
                      Correct: {q.options[r?.correctIndex ?? -1] ?? `Option ${(r?.correctIndex ?? 0) + 1}`}
                    </p>
                    {r && !ok && r.chosen >= 0 && (
                      <p className="text-xs text-red-400/80">
                        Your answer: {q.options[r.chosen] ?? `Option ${r.chosen + 1}`}
                      </p>
                    )}
                    {r?.explanation && (
                      <p className="text-xs text-gray-400 mt-1">{r.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/quizzes"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to quizzes
          </Link>
        </div>
      </div>
    );
  }

  // ACTIVE
  if (!cur) return null;
  const hasOptionImages = cur.optionImageUrls?.some((u) => !!u);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">{quiz?.title ?? "Quiz"}</p>
          <p className="text-sm font-bold text-white">
            Question {idx + 1} of {questions.length}
          </p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-sm tabular-nums",
            lowTime ? "bg-red-500/15 text-red-400" : "bg-gray-800 text-white"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          {mm}:{ss}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-[width]"
          style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 mt-4">
        {cur.questionImageUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-950 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cur.questionImageUrl}
              alt=""
              className="w-full max-h-72 object-contain bg-gray-950"
            />
          </div>
        )}
        {cur.question && (
          <p className="text-base font-semibold text-white mb-4">{cur.question}</p>
        )}

        {hasOptionImages ? (
          <div className="grid grid-cols-2 gap-2">
            {cur.options.map((opt, oi) => {
              const active = selected === oi;
              const img = cur.optionImageUrls?.[oi];
              return (
                <button
                  key={oi}
                  onClick={() => setAnswers((a) => ({ ...a, [cur.id]: oi }))}
                  className={cn(
                    "text-left rounded-xl border overflow-hidden transition-colors",
                    active
                      ? "border-indigo-500 ring-2 ring-indigo-500/40"
                      : "border-gray-700 hover:border-gray-600"
                  )}
                >
                  {img ? (
                    <div className="relative aspect-video bg-gray-950">
                      <SmartImage
                        src={img}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 p-2.5 bg-gray-950">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                        active ? "border-indigo-500 bg-indigo-500" : "border-gray-600"
                      )}
                    >
                      {active && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-white flex-1 min-w-0">
                      {opt || `Option ${String.fromCharCode(65 + oi)}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {cur.options.map((opt, oi) => {
              const active = selected === oi;
              return (
                <button
                  key={oi}
                  onClick={() => setAnswers((a) => ({ ...a, [cur.id]: oi }))}
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
                      active ? "border-indigo-500 bg-indigo-500" : "border-gray-600"
                    )}
                  >
                    {active && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-white flex-1">{opt}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="mt-4 flex items-center gap-2">
        {idx > 0 && (
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            Back
          </button>
        )}
        {idx < questions.length - 1 ? (
          <button
            onClick={() => setIdx((i) => i + 1)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || answeredCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Submit quiz
          </button>
        )}
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-2">
        {answeredCount}/{questions.length} answered
      </p>
    </div>
  );
}
