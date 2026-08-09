"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  ExternalLink,
  Upload,
  Loader2,
  KeyRound,
  Hash,
  Video as VideoIcon,
  ArrowLeft,
  Coins,
  Sparkles,
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import type { ArticleConfig } from "@/lib/article-tasks";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  TaskLockedNotice,
  isTaskLocked,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

interface ArticleTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  difficulty?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  instructions?: string | null;
  instructionVideoUrl?: string | null;
  articleConfig?: ArticleConfig | null;
}

interface UserStatus {
  hasActiveSubmission: boolean;
  activeSubmissionId?: string | null;
  /** True when the active submission was already submitted (awaiting review). */
  awaitingReview?: boolean;
  /** Back-compat: true when the user is blocked from starting a new attempt. */
  completedToday: boolean;
  /** Per-user daily limit reached. */
  dailyLimitReached?: boolean;
  /** Global total limit reached (across all users). */
  totalLimitReached?: boolean;
  /** Slots left for this user today. */
  remainingToday?: number;
  /** The effective daily limit (defaulted to 1 server-side if admin didn't set). */
  dailyLimit?: number;
}

type LimitKind = "daily" | "total" | "generic";

type SubmitState =
  | { kind: "ready"; submissionId: string }
  | { kind: "awaiting_review" } // already submitted — pending admin review
  | {
      kind: "completed_today";
      limit: LimitKind;
      remainingToday?: number;
      dailyLimit?: number;
    }
  | { kind: "blocked"; reason: string } // start failed for some other reason
  | { kind: "loading" };

export function ArticleTaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<ArticleTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "loading" });
  const [proofUrl, setProofUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uniqueKey, setUniqueKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  // Load task + decide whether to start, resume, or show completed/blocked state
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setSubmitState({ kind: "loading" });
      try {
        // 1. Get full task detail (includes articleConfig + userStatus)
        const tRes = await fetch(`/api/tasks/${taskId}`);
        if (!tRes.ok) throw new Error(await tRes.text());
        const tData = await tRes.json();
        if (cancel) return;
        const t = tData.task as ArticleTask;
        const userStatus = (tData.userStatus ?? {}) as UserStatus;
        setTask(t);

        // 1b. Already submitted (awaiting admin review) — show a status card,
        //     never the submit form (re-submitting would 409).
        if (userStatus.awaitingReview) {
          setSubmitState({ kind: "awaiting_review" });
          return;
        }

        // 2. If user has an in-progress submission, reuse it — never call /start
        if (userStatus.hasActiveSubmission && userStatus.activeSubmissionId) {
          setSubmitState({
            kind: "ready",
            submissionId: userStatus.activeSubmissionId,
          });
          return;
        }

        // 3. If user is blocked from new attempts (daily / total limit hit
        //    OR legacy `completedToday` flag), show the limit-reached UI.
        if (
          userStatus.totalLimitReached ||
          userStatus.dailyLimitReached ||
          userStatus.completedToday
        ) {
          setSubmitState({
            kind: "completed_today",
            limit: userStatus.totalLimitReached
              ? "total"
              : "daily",
            remainingToday: userStatus.remainingToday,
            dailyLimit: userStatus.dailyLimit,
          });
          return;
        }

        // Ad-blocker gate: refuse to start a task while a blocker is active.
        if (!(await ensureAdsAllowed())) {
          if (!cancel) setAdBlocked(true);
          return;
        }

        // 4. Otherwise, try to start a fresh submission
        const sRes = await fetch(`/api/tasks/${taskId}/start`, {
          method: "POST",
        });
        const sData = await sRes.json().catch(() => ({}));
        if (cancel) return;
        if (!sRes.ok) {
          // Daily-mission allowance exhausted → show the upgrade prompt.
          if (isUpgradeRequired(sData)) {
            setUpgradeMsg(sData.error || "");
            return;
          }
          // Blocked behind an earlier task in the chain (feature #7).
          if (isTaskLocked(sData)) {
            setLockedMsg(sData.error || "");
            return;
          }
          // Common case: race or stale userStatus → daily limit hit. Treat as completed.
          const reason = sData.error ?? `HTTP ${sRes.status}`;
          if (
            typeof reason === "string" &&
            /daily limit/i.test(reason)
          ) {
            setSubmitState({
              kind: "completed_today",
              limit: "daily",
              remainingToday: 0,
              dailyLimit: userStatus.dailyLimit,
            });
            return;
          }
          if (
            typeof reason === "string" &&
            /task limit/i.test(reason)
          ) {
            setSubmitState({
              kind: "completed_today",
              limit: "total",
            });
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
            reason: "Couldn't create a submission for this task.",
          });
        }
      } catch (err) {
        if (cancel) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load task");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  const submit = async () => {
    if (!task || submitState.kind !== "ready") return;
    const cfg = task.articleConfig;
    const req = cfg?.proofRequirements;
    if (req?.url && !proofUrl.trim()) {
      toast.error("Proof URL is required");
      return;
    }
    if (req?.screenshot && !screenshotUrl.trim()) {
      toast.error("Screenshot URL is required");
      return;
    }
    if (req?.uniqueKey && !uniqueKey.trim()) {
      toast.error("Unique key is required");
      return;
    }
    setBusy(true);
    try {
      const proofImages = screenshotUrl ? [screenshotUrl] : [];
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submitState.submissionId,
          proof: proofUrl,
          proofImages,
          uniqueKey,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      toast.success("Submitted! Pending admin review.", {
        description: `You'll get ${task.pointsReward} pts when approved.`,
      });
      router.push("/article-tasks");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Try again";
      // Already-submitted race: land softly on the awaiting-review state, not a
      // scary red "Failed" toast.
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
        <p className="text-sm text-gray-500">Loading article task…</p>
      </div>
    );
  }

  if (upgradeMsg !== null) {
    return <TaskUpgradeNotice message={upgradeMsg} />;
  }

  if (lockedMsg !== null) {
    return <TaskLockedNotice message={lockedMsg} />;
  }

  if (adBlocked) {
    return <AdblockNotice />;
  }

  if (loadError || !task) {
    return (
      <div className="space-y-4">
        <Link
          href="/article-tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to article tasks
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

  const cfg = task.articleConfig;
  const req = cfg?.proofRequirements;

  return (
    <div className="space-y-4 sm:space-y-5 pb-20 sm:pb-8">
      {/* Back link — compact on mobile */}
      <Link
        href="/article-tasks"
        className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        Back to article tasks
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        {task.thumbnailUrl && (
          <div className="relative w-full h-36 sm:h-52">
            <SmartImage
              src={task.thumbnailUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="p-3 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Article Task
            </span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-white text-balance leading-tight">
            {task.title}
          </h1>
          {task.description && (
            <p className="text-sm text-gray-300 whitespace-pre-wrap wrap-break-word">
              {task.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
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
            {task.difficulty ? (
              <RewardBadge label={task.difficulty} tone="emerald" />
            ) : null}
          </div>
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {/* Instructions */}
      {task.instructions && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3 sm:p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 sm:mb-3">
            Steps
          </h2>
          <ol className="space-y-1.5 text-sm text-gray-200 list-decimal pl-5 wrap-break-word">
            {task.instructions
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((step, i) => (
                <li key={i}>{step}</li>
              ))}
          </ol>
        </section>
      )}

      {task.instructionVideoUrl && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1.5">
            <VideoIcon className="w-3.5 h-3.5" />
            Instruction video
          </h2>
          <div className="max-w-2xl mx-auto rounded-xl overflow-hidden">
            <InlineVideoEmbed
              url={task.instructionVideoUrl}
              title={`Instruction video — ${task.title}`}
            />
          </div>
        </section>
      )}

      {/* Article links — only shown in legacy (non-pool) mode. In pool mode
          the user must go through the embed flow which inserts the session
          token into each URL; bypassing the embed wouldn't earn the key. */}
      {cfg && !cfg.useKeyPool && cfg.links.length > 0 && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3 sm:p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 sm:mb-3">
            Article Links
          </h2>
          <div className="space-y-2">
            {cfg.links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 hover:bg-gray-950/70 transition-colors group min-w-0"
              >
                <ExternalLink className="w-4 h-4 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">
                    {link.label || `Link ${i + 1}`}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">
                    {link.url}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Pool-mode page list (read-only preview). The user clicks "Start"
          below to begin the embed-driven journey. */}
      {cfg?.useKeyPool && (cfg.pages?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3 sm:p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 sm:mb-3">
            Article Journey ({cfg.pages?.length ?? 0} pages)
          </h2>
          <ol className="space-y-2 text-sm text-gray-300">
            {(cfg.pages ?? []).map((p, i) => {
              const isFinal = i === (cfg.pages?.length ?? 0) - 1;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 min-w-0"
                >
                  <span className="text-xs font-mono text-gray-500 shrink-0">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">
                      {p.label || `Page ${i + 1}`}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {p.popupCount} popup{p.popupCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {isFinal && (
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 shrink-0">
                      Final
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Keywords */}
      {cfg && cfg.keywords.length > 0 && (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-amber-400/80 font-bold mb-2 inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            Keywords to look for
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {cfg.keywords.map((k) => (
              <span
                key={k}
                className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/30"
              >
                {k}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Submission section — depends on state */}
      {submitState.kind === "awaiting_review" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 sm:p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white">
                Awaiting review
              </h2>
              <p className="text-xs text-sky-200/80 mt-1">
                You&apos;ve already submitted this — it&apos;s awaiting admin review.
                {task.pointsReward > 0
                  ? ` You'll get ${task.pointsReward.toLocaleString()} pts once approved.`
                  : ""}
              </p>
              <Link
                href="/article-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to article tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "completed_today" && (
        <section
          className={
            "rounded-xl border p-3 sm:p-5 " +
            (submitState.limit === "total"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-emerald-500/30 bg-emerald-500/5")
          }
        >
          <div className="flex items-start gap-3">
            {submitState.limit === "total" ? (
              <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white text-balance">
                {submitState.limit === "total"
                  ? "This task is fully claimed"
                  : "Today's limit reached"}
              </h2>
              <p
                className={
                  "text-xs mt-1 " +
                  (submitState.limit === "total"
                    ? "text-amber-200/80"
                    : "text-emerald-200/80")
                }
              >
                {submitState.limit === "total"
                  ? "All slots have been claimed by other users. No attempts left."
                  : submitState.dailyLimit && submitState.dailyLimit > 1
                    ? `You've used all ${submitState.dailyLimit} attempts for today. Come back tomorrow.`
                    : "You've already done this task today. Come back tomorrow to do it again."}
              </p>
              <Link
                href="/article-tasks"
                className={
                  "inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border " +
                  (submitState.limit === "total"
                    ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30")
                }
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to article tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "blocked" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white text-balance">
                Can&apos;t start this task right now
              </h2>
              <p className="text-xs text-amber-200/80 mt-1 wrap-break-word">
                {submitState.reason}
              </p>
              <Link
                href="/article-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to article tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {submitState.kind === "ready" && cfg?.useKeyPool && (
        <div className="space-y-3 sm:space-y-4">
          <KeyPoolStartCard taskId={task.id} />
          <ManualKeySubmitCard
            taskId={task.id}
            submissionId={submitState.submissionId}
          />
        </div>
      )}

      {submitState.kind === "ready" && !cfg?.useKeyPool && (
        <section className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Submit your proof</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Once you&apos;ve read the article(s) above, fill in what&apos;s
              required and submit for admin review.
            </p>
          </div>

          {req?.url && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Proof URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {req?.screenshot && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Screenshot URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                placeholder="https://... (upload to imgur, etc.)"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {req?.uniqueKey && (
            <div>
              <label className="flex text-xs font-medium text-gray-300 mb-1.5 items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                Unique Key <span className="text-red-400">*</span>
              </label>
              <input
                value={uniqueKey}
                onChange={(e) => setUniqueKey(e.target.value)}
                placeholder="Enter the key you found"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
              />
              {cfg?.uniqueKeyHint && (
                <p className="text-[11px] text-amber-400/80 mt-1">
                  💡 {cfg.uniqueKeyHint}
                </p>
              )}
            </div>
          )}

          {!req?.url && !req?.screenshot && !req?.uniqueKey && (
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-400">
              No proof fields are required for this task. Click submit when
              you&apos;ve finished reading.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Link
              href="/article-tasks"
              className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              disabled={busy}
              onClick={submit}
              className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Submit for Review
            </button>
          </div>
        </section>
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

/**
 * Key-pool mode CTA. The user clicks "Start Article Journey" — we hit the
 * /api/article-tasks/[id]/start endpoint to mint a session token and
 * receive the page-1 URL (with `?eg=<token>` appended). We open the URL
 * in a new tab; once the user finishes all popups + the final page,
 * the embed redirects them back to /article-tasks/complete which
 * auto-submits the key.
 */
function KeyPoolStartCard({ taskId }: { taskId: string }) {
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/article-tasks/${taskId}/start`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const url = data.firstPageUrl as string | undefined;
      if (!url) throw new Error("Missing first page URL");
      window.open(url, "_blank", "noopener,noreferrer");
      setOpened(true);
      toast.success("Article journey started in a new tab", {
        description:
          "Complete all pages — you'll be redirected back here automatically with your key.",
      });
    } catch (err) {
      toast.error("Couldn't start", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div>
        <h2 className="text-sm sm:text-base font-bold text-white inline-flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-indigo-400 shrink-0" />
          Start the article journey
        </h2>
        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
          Visit each article page in order. Popups appear on each page —
          click them to advance. On the final page you&apos;ll receive a
          unique key to copy back to this task.
        </p>
      </div>

      {opened && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-200 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0">
            Article opened in a new tab. Keep this tab open — your reward
            will land here when you finish.
          </span>
        </div>
      )}

      <button
        disabled={busy}
        onClick={start}
        className="w-full py-3 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowRight className="w-4 h-4" />
        )}
        {opened ? "Reopen Article" : "Start Article Journey"}
      </button>
    </section>
  );
}

/**
 * Manual key submit card. The article-task embed now sends users back here
 * with `?key=<value>` after they generate their key on the final article
 * page — this card pre-fills the field, and the user clicks Submit to
 * finish. Submit shows green ✓ on match / red ✗ on mismatch.
 */
function ManualKeySubmitCard({
  taskId,
  submissionId,
}: {
  taskId: string;
  submissionId: string;
}) {
  const params = useSearchParams();
  const urlKey = params.get("key") ?? "";
  // Auto-open when arriving with a key in the URL.
  const [open, setOpen] = useState(!!urlKey);
  const [key, setKey] = useState(urlKey);
  const [busy, setBusy] = useState(false);
  // null = not yet submitted, true = matched (green), false = rejected (red)
  const [matchState, setMatchState] = useState<null | "match" | "fail">(
    null
  );
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // If the URL key changes (e.g. browser back/forward), keep the input synced.
  useEffect(() => {
    if (urlKey && urlKey !== key) {
      setKey(urlKey);
      setOpen(true);
      setMatchState(null);
      setResultMsg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const submit = async () => {
    if (!key.trim()) {
      toast.error("Paste your unique key first");
      return;
    }
    setBusy(true);
    setMatchState(null);
    setResultMsg(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, uniqueKey: key.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMatchState("fail");
        setResultMsg(
          (data && data.error) ||
            `Couldn't verify the key (HTTP ${res.status}).`
        );
        return;
      }
      await runInterstitial();
      setMatchState("match");
      const pts = data.rewards?.points ?? 0;
      const xp = data.rewards?.xp ?? 0;
      setResultMsg(
        pts > 0
          ? `Key matched! +${pts.toLocaleString()} pts${xp > 0 ? ` · +${xp} XP` : ""} credited.`
          : "Key matched! Reward credited."
      );
      toast.success("Key matched", {
        description: pts > 0 ? `+${pts} pts credited` : undefined,
      });
    } catch (err) {
      setMatchState("fail");
      setResultMsg(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  // Visual border color reflects match state.
  const borderTone =
    matchState === "match"
      ? "border-emerald-500/60 bg-emerald-500/5"
      : matchState === "fail"
      ? "border-red-500/60 bg-red-500/5"
      : "border-gray-800 bg-gray-900";

  const inputTone =
    matchState === "match"
      ? "border-emerald-500/60 focus:border-emerald-400"
      : matchState === "fail"
      ? "border-red-500/60 focus:border-red-400"
      : "border-gray-700 focus:border-amber-500";

  return (
    <section
      className={`rounded-xl border p-3 sm:p-5 space-y-3 transition-colors ${borderTone}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left min-w-0"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            {matchState === "match" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : matchState === "fail" ? (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">
              {matchState === "match"
                ? "Key matched — task complete"
                : matchState === "fail"
                ? "Key didn't match"
                : urlKey
                ? "Submit your unique key"
                : "Already have your unique key?"}
            </span>
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5 wrap-break-word">
            {matchState === "match"
              ? resultMsg
              : matchState === "fail"
              ? resultMsg
              : urlKey
              ? "Verify and submit the key you generated on the final article page."
              : "Paste it here once you've generated it on the final article page."}
          </p>
        </div>
        <span className="text-gray-500 text-xs shrink-0 ml-2">
          {open ? "Close" : "Open"}
        </span>
      </button>

      {open && matchState !== "match" && (
        <div className="space-y-2 pt-1">
          <input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (matchState !== null) {
                setMatchState(null);
                setResultMsg(null);
              }
            }}
            placeholder="Paste the key you received on the final article page"
            className={`w-full px-3 py-2 bg-gray-950 border rounded-lg text-sm font-mono text-white placeholder-gray-500 focus:outline-none transition-colors ${inputTone}`}
          />
          {matchState === "fail" && resultMsg && (
            <p className="text-xs text-red-400 inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              {resultMsg}
            </p>
          )}
          <button
            disabled={busy}
            onClick={submit}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Submit Key
          </button>
        </div>
      )}

      {matchState === "match" && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-200 inline-flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">{resultMsg}</p>
            <Link
              href="/article-tasks"
              className="text-xs text-emerald-300 hover:text-emerald-200 underline mt-1 inline-block"
            >
              ← Back to article tasks
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
