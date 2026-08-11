"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  Brain,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCcw,
  Send,
  Trophy,
} from "lucide-react";
import { CardSkeleton } from "@/components/user/primitives/skeleton";

interface QuizQuestion {
  id: string;
  type: "MCQ" | "TRUE_FALSE" | "MULTI_SELECT";
  question: string;
  options: string[];
  points: number;
}

interface QuizPayload {
  id: string;
  title: string;
  description: string | null;
  passMarkPercent: number;
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  questions: QuizQuestion[];
}

interface AttemptResult {
  score: number;
  passed: boolean;
  correctIds: string[];
}

interface Props {
  courseId: string;
  quizId: string;
  onPassed: () => void;
}

export function QuizPlayer({ courseId, quizId, onPassed }: Props) {
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/courses/${courseId}/quiz/${quizId}`, {
          cache: "no-store",
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        if (!cancelled) setQuiz(d.quiz as QuizPayload);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load quiz");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, quizId]);

  const toggleAnswer = (qid: string, opt: string, multi: boolean) => {
    setAnswers((prev) => {
      const current = prev[qid] ?? [];
      if (multi) {
        const next = current.includes(opt)
          ? current.filter((x) => x !== opt)
          : [...current, opt];
        return { ...prev, [qid]: next };
      }
      return { ...prev, [qid]: [opt] };
    });
  };

  const submit = async () => {
    if (!quiz) return;
    // Validate all questions answered
    const unanswered = quiz.questions.find(
      (q) => !(answers[q.id]?.length > 0)
    );
    if (unanswered) {
      toast.error("Answer every question first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/quiz/${quizId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const r = d.attempt as AttemptResult;
      setResult(r);
      if (r.passed) {
        toast.success(`Passed — ${r.score.toFixed(0)}%`);
        onPassed();
      } else {
        toast.error(`Score ${r.score.toFixed(0)}% — need ${quiz.passMarkPercent}% to pass`);
      }
    } catch (err) {
      toast.error("Submit failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <CardSkeleton />;
  }
  if (error || !quiz) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/40 rounded-2xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-300 mt-0.5 shrink-0" />
        <p className="text-sm text-rose-100">{error ?? "Quiz not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="bg-gray-900 rounded-2xl border border-fuchsia-500/30 p-5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-200 text-[10px] font-bold uppercase tracking-wider">
          <Brain className="w-3 h-3" /> Quiz
        </span>
        <h1 className="text-xl font-bold text-white mt-2">{quiz.title}</h1>
        {quiz.description && (
          <p className="text-sm text-gray-400 mt-1">{quiz.description}</p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          {quiz.questions.length} questions · Pass mark {quiz.passMarkPercent}%
          {quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min time limit` : ""}
        </p>
      </header>

      {result ? (
        <div
          className={
            "rounded-2xl border p-6 " +
            (result.passed
              ? "bg-emerald-500/10 border-emerald-500/40"
              : "bg-rose-500/10 border-rose-500/40")
          }
        >
          <div className="flex items-center gap-3">
            {result.passed ? (
              <Trophy className="w-8 h-8 text-emerald-300" />
            ) : (
              <AlertCircle className="w-8 h-8 text-rose-300" />
            )}
            <div>
              <p className="text-2xl font-extrabold text-white tabular-nums">
                {result.score.toFixed(0)}%
              </p>
              <p
                className={
                  "text-sm font-bold " +
                  (result.passed ? "text-emerald-200" : "text-rose-200")
                }
              >
                {result.passed
                  ? "Passed — nice work!"
                  : `Need ${quiz.passMarkPercent}% to pass`}
              </p>
            </div>
          </div>
          {!result.passed && (
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setResult(null);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
          )}
        </div>
      ) : (
        <ol className="space-y-3">
          {quiz.questions.map((q, qi) => {
            const multi = q.type === "MULTI_SELECT";
            const selected = answers[q.id] ?? [];
            return (
              <li
                key={q.id}
                className="card p-4"
              >
                <p className="text-sm font-bold text-white">
                  <span className="text-gray-500 font-mono text-xs mr-1">
                    Q{qi + 1}.
                  </span>
                  {q.question}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
                  {multi ? "Select all that apply" : "Pick one"} · {q.points} pt{q.points === 1 ? "" : "s"}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isSel = selected.includes(opt);
                    return (
                      <li key={oi}>
                        <button
                          type="button"
                          onClick={() => toggleAnswer(q.id, opt, multi)}
                          className={
                            "w-full text-left flex items-start gap-2 p-2 rounded-lg border " +
                            (isSel
                              ? "border-fuchsia-500 bg-fuchsia-500/15 text-white"
                              : "border-gray-800 bg-gray-950 hover:bg-gray-800/60 text-gray-300")
                          }
                        >
                          {isSel ? (
                            <CheckCircle2 className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-gray-600 mt-0.5 shrink-0" />
                          )}
                          <span className="text-sm">{opt}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {!result && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Submit answers
          </button>
        </div>
      )}
    </div>
  );
}
