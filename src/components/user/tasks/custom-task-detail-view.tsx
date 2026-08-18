"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  Coins,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  type CustomConfig,
  type CustomAnswers,
  validateCustomAnswers,
} from "@/lib/custom-tasks";
import { CustomFieldInput } from "./custom-field-input";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

interface CustomTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  thumbnailUrl?: string | null;
  duration?: number | null;
  customConfig?: CustomConfig | null;
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

export function CustomTaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<CustomTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "loading" });
  const [answers, setAnswers] = useState<CustomAnswers>({});
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
        const t = tData.task as CustomTask;
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
          setSubmitState({ kind: "ready", submissionId: sData.submission.id });
        } else {
          setSubmitState({
            kind: "blocked",
            reason: "Couldn't create a submission for this task.",
          });
        }
      } catch (err) {
        if (cancel) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load task"
        );
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  const cfg = task?.customConfig;
  const orderedFields = (cfg?.fields ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  const submit = async () => {
    if (!task || submitState.kind !== "ready") return;
    // Simple custom tasks may have no config/fields — nothing to validate.
    const err = cfg && orderedFields.length > 0 ? validateCustomAnswers(cfg, answers) : null;
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submitState.submissionId,
          customAnswers: answers,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      toast.success(cfg?.thankYouMessage || "Submitted for review", {
        description: cfg?.autoApprove
          ? `+${task.pointsReward} pts credited`
          : `You'll get ${task.pointsReward} pts when approved.`,
      });
      router.push("/tasks");
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
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        <p className="text-sm text-gray-500">Loading task…</p>
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
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tasks
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-bold text-red-400 mb-1">
            Couldn&apos;t load this task
          </p>
          <p className="text-xs text-red-300/80">
            {loadError ?? "Task not found."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/tasks"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to tasks
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
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Custom Task
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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/30">
              <Coins className="w-3.5 h-3.5" />+
              {task.pointsReward.toLocaleString()} pts
            </span>
            {task.xpReward > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-bold border border-violet-500/30">
                <Sparkles className="w-3.5 h-3.5" />+
                {task.xpReward.toLocaleString()} XP
              </span>
            )}
            {task.duration ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-700/50 text-slate-300 text-xs font-bold border border-slate-600/50">
                <Clock className="w-3.5 h-3.5" />
                {task.duration} min
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              {cfg?.autoApprove ? "Auto-approve" : "Admin reviews"}
            </span>
          </div>
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {cfg?.introMessage && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200 whitespace-pre-wrap">
          {cfg.introMessage}
        </div>
      )}

      {submitState.kind === "awaiting_review" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5 flex items-start gap-3">
          <Clock className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-white">Awaiting review</h2>
            <p className="text-xs text-sky-200/80 mt-1">
              You&apos;ve already submitted this — it&apos;s awaiting admin review.
              {task.pointsReward > 0
                ? ` You'll get ${task.pointsReward.toLocaleString()} pts once approved.`
                : ""}
            </p>
          </div>
        </section>
      )}

      {submitState.kind === "completed_today" && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-white">
              You&apos;ve already submitted this task
            </h2>
            <p className="text-xs text-emerald-200/80 mt-1">
              Your response is either pending review or already credited.
            </p>
          </div>
        </section>
      )}

      {submitState.kind === "blocked" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          {submitState.reason}
        </section>
      )}

      {submitState.kind === "ready" && cfg && orderedFields.length > 0 && (
        <>
          <div className="space-y-4">
            {orderedFields.map((field) => (
              <div
                key={field.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5"
              >
                <CustomFieldInput
                  field={field}
                  value={answers[field.id]}
                  onChange={(v) =>
                    setAnswers((prev) => ({ ...prev, [field.id]: v }))
                  }
                  disabled={busy}
                />
              </div>
            ))}
          </div>

          <div className="sticky bottom-4 z-10 mt-6">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm sm:text-base font-bold shadow-lg shadow-purple-900/30 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Submit for review
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* No proof fields configured → simple "mark done & submit" with optional
          note, so the task isn't a dead-end without a submit button. */}
      {submitState.kind === "ready" && orderedFields.length === 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={(answers["_notes"] as string) ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, _notes: e.target.value }))
              }
              disabled={busy}
              placeholder="Add any note for the reviewer…"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
          <div className="sticky bottom-4 z-10 mt-6">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm sm:text-base font-bold shadow-lg shadow-purple-900/30 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Submit for review
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
