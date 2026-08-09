"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList,
  Upload,
  Loader2,
  ArrowLeft,
  Coins,
  Sparkles,
  Clock,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import {
  type SurveyConfig,
  type SurveyAnswers,
  type SurveyQuestion,
  validateAnswers,
} from "@/lib/survey-tasks";
import { SurveyQuestionField } from "./survey-question-field";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

interface SurveyTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  difficulty?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  surveyConfig?: SurveyConfig | null;
}

interface UserStatus {
  hasActiveSubmission: boolean;
  activeSubmissionId?: string | null;
  completedToday: boolean;
  /** True when the active submission was already submitted (awaiting review). */
  awaitingReview?: boolean;
}

type SubmitState =
  | { kind: "ready"; submissionId: string }
  | { kind: "awaiting_review" }
  | { kind: "completed_today" }
  | { kind: "blocked"; reason: string }
  | { kind: "loading" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SurveyTaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<SurveyTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "loading" });
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [busy, setBusy] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setSubmitState({ kind: "loading" });
      try {
        const tRes = await fetch(`/api/tasks/${taskId}`);
        if (!tRes.ok) throw new Error(await tRes.text());
        const tData = await tRes.json();
        if (cancel) return;
        const t = tData.task as SurveyTask;
        const userStatus = (tData.userStatus ?? {}) as UserStatus;
        setTask(t);

        if (userStatus.awaitingReview) {
          setSubmitState({ kind: "awaiting_review" });
          return;
        }

        if (userStatus.hasActiveSubmission && userStatus.activeSubmissionId) {
          setSubmitState({
            kind: "ready",
            submissionId: userStatus.activeSubmissionId,
          });
          return;
        }

        if (userStatus.completedToday) {
          setSubmitState({ kind: "completed_today" });
          return;
        }

        if (!(await ensureAdsAllowed())) {
          if (!cancel) setAdBlocked(true);
          return;
        }

        const sRes = await fetch(`/api/tasks/${taskId}/start`, {
          method: "POST",
        });
        const sData = await sRes.json().catch(() => ({}));
        if (cancel) return;
        if (!sRes.ok) {
          if (isUpgradeRequired(sData)) {
            setUpgradeMsg(sData.error || "");
            return;
          }
          const reason = sData.error ?? `HTTP ${sRes.status}`;
          if (
            typeof reason === "string" &&
            (/daily limit/i.test(reason) || /limit reached/i.test(reason))
          ) {
            setSubmitState({ kind: "completed_today" });
            return;
          }
          setSubmitState({ kind: "blocked", reason });
          return;
        }
        if (sData.submission?.id) {
          setSubmitState({
            kind: "ready",
            submissionId: sData.submission.id,
          });
        } else {
          setSubmitState({
            kind: "blocked",
            reason: "Couldn't create a submission for this survey.",
          });
        }
      } catch (err) {
        if (cancel) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load survey"
        );
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  // Compute display order (and optional shuffled options) once per session.
  const cfg = task?.surveyConfig;
  const orderedQuestions = useMemo<SurveyQuestion[]>(() => {
    if (!cfg) return [];
    const sorted = [...cfg.questions].sort((a, b) => a.order - b.order);
    return cfg.randomizeQuestions ? shuffle(sorted) : sorted;
  }, [cfg]);

  const optionDisplay = useMemo<Record<string, string[]>>(() => {
    if (!cfg) return {};
    const map: Record<string, string[]> = {};
    for (const q of cfg.questions) {
      if (!q.options) continue;
      map[q.id] = cfg.shuffleOptions ? shuffle(q.options) : q.options;
    }
    return map;
  }, [cfg]);

  const setAnswer = (qid: string, v: SurveyAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [qid]: v }));
  };

  const submit = async () => {
    if (!task || !cfg || submitState.kind !== "ready") return;
    const v = validateAnswers(cfg, answers);
    if (!v.ok) {
      toast.error(v.error ?? "Please complete all required questions", {
        description: v.missing?.length
          ? `Missing: ${v.missing.slice(0, 3).join(", ")}${v.missing.length > 3 ? "…" : ""}`
          : undefined,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submitState.submissionId,
          answers,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      toast.success(cfg.thankYouMessage || "Thanks! Submitted for review.", {
        description: `You'll get ${task.pointsReward} pts when approved.`,
      });
      router.push("/survey-tasks?tab=pending");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Try again";
      if (/already submitted/i.test(msg)) {
        setSubmitState({ kind: "awaiting_review" });
        toast("Already submitted — awaiting review.");
      } else {
        toast.error("Failed", { description: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
        <p className="text-sm text-gray-500">Loading survey…</p>
      </div>
    );
  }

  if (upgradeMsg !== null) {
    return <TaskUpgradeNotice message={upgradeMsg} />;
  }

  if (adBlocked) {
    return <AdblockNotice />;
  }

  if (loadError || !task) {
    return (
      <div className="space-y-4">
        <Link
          href="/survey-tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to surveys
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-bold text-red-400 mb-1">
            Couldn&apos;t load this survey
          </p>
          <p className="text-xs text-red-300/80">
            {loadError ?? "Survey not found."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/survey-tasks"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to surveys
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        {task.thumbnailUrl && (
          <div className="relative w-full h-40 sm:h-52">
            <SmartImage
              src={task.thumbnailUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Survey
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {task.title}
          </h1>
          {task.description && (
            <p className="text-sm text-gray-300 whitespace-pre-wrap">
              {task.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <RewardBadge
              icon={<Coins className="w-3.5 h-3.5" />}
              label={`+${task.pointsReward.toLocaleString()} pts`}
              tone="amber"
            />
            {task.xpReward > 0 && (
              <RewardBadge
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label={`+${task.xpReward.toLocaleString()} XP`}
                tone="violet"
              />
            )}
            {task.duration ? (
              <RewardBadge
                icon={<Clock className="w-3.5 h-3.5" />}
                label={`${task.duration} min`}
                tone="slate"
              />
            ) : null}
            <RewardBadge label="One submission" tone="emerald" />
          </div>
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {cfg?.introMessage && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200 whitespace-pre-wrap">
          {cfg.introMessage}
        </div>
      )}

      {/* States */}
      {submitState.kind === "awaiting_review" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">Awaiting review</h2>
              <p className="text-xs text-sky-200/80 mt-1">
                You&apos;ve already submitted this survey — it&apos;s awaiting admin review.
                {task && task.pointsReward > 0
                  ? ` You'll get ${task.pointsReward.toLocaleString()} pts once approved.`
                  : ""}
              </p>
              <Link
                href="/survey-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to surveys
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "completed_today" && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">
                You&apos;ve already submitted this survey
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1">
                Each survey is one-shot. Your response is either pending review
                or already credited.
              </p>
              <Link
                href="/survey-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to surveys
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "blocked" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">
                Can&apos;t take this survey right now
              </h2>
              <p className="text-xs text-amber-200/80 mt-1">
                {submitState.reason}
              </p>
              <Link
                href="/survey-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to surveys
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "ready" && cfg && orderedQuestions.length > 0 && (
        <section className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 sm:p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Your answers</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {orderedQuestions.filter((q) => q.required).length} required of{" "}
              {orderedQuestions.length} questions.
            </p>
          </div>

          <div className="space-y-5">
            {orderedQuestions.map((q, i) => (
              <div
                key={q.id}
                className="rounded-lg bg-gray-950 border border-gray-800 p-3"
              >
                <div className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                  Question {i + 1}
                </div>
                <SurveyQuestionField
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                  displayOptions={optionDisplay[q.id]}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Link
              href="/survey-tasks"
              className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              disabled={busy}
              onClick={submit}
              className="flex-1 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Submit Survey
            </button>
          </div>
        </section>
      )}

      {submitState.kind === "ready" && (!cfg || orderedQuestions.length === 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          This survey has no questions configured yet. Please check back later.
        </div>
      )}
    </div>
  );
}

function RewardBadge({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: "amber" | "violet" | "emerald" | "slate";
}) {
  const tones = {
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    slate: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${tones[tone]}`}
    >
      {icon}
      {label}
    </span>
  );
}
