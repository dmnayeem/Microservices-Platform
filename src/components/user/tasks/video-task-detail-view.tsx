"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Video as VideoIcon,
  ArrowLeft,
  Coins,
  Sparkles,
  Clock,
  CheckCircle2,
  Info,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import type { VideoConfig } from "@/lib/video-tasks";
import { formatDuration, engagementSteps } from "@/lib/video-tasks";
import { VideoTaskPlayer } from "./video-task-player";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { SmartImage } from "@/components/user/primitives/smart-image";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  TaskLockedNotice,
  isTaskLocked,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

interface VideoTask {
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
  videoConfig?: VideoConfig | null;
  contentUrl?: string | null;
}

interface UserStatus {
  hasActiveSubmission: boolean;
  activeSubmissionId?: string | null;
  completedToday: boolean;
  /** True when the active submission was already submitted (awaiting review). */
  awaitingReview?: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; submissionId: string }
  | { kind: "watching"; submissionId: string }
  | { kind: "awaiting_review" }
  | { kind: "completed_today" }
  | { kind: "blocked"; reason: string };

export function VideoTaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<VideoTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadError(null);
      setState({ kind: "loading" });
      try {
        const tRes = await fetch(`/api/tasks/${taskId}`);
        if (!tRes.ok) throw new Error(await tRes.text());
        const tData = await tRes.json();
        if (cancel) return;
        const t = tData.task as VideoTask;
        const userStatus = (tData.userStatus ?? {}) as UserStatus;
        setTask(t);

        // Already submitted (awaiting admin review) — status card, never the player.
        if (userStatus.awaitingReview) {
          setState({ kind: "awaiting_review" });
          return;
        }
        if (userStatus.hasActiveSubmission && userStatus.activeSubmissionId) {
          setState({
            kind: "ready",
            submissionId: userStatus.activeSubmissionId,
          });
          return;
        }
        if (userStatus.completedToday) {
          setState({ kind: "completed_today" });
          return;
        }

        // Ad-blocker gate: refuse to start a task while a blocker is active.
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
          if (isTaskLocked(sData)) {
            setLockedMsg(sData.error || "");
            return;
          }
          const reason = sData.error ?? `HTTP ${sRes.status}`;
          if (
            typeof reason === "string" &&
            (/daily limit/i.test(reason) || /limit reached/i.test(reason))
          ) {
            setState({ kind: "completed_today" });
            return;
          }
          setState({ kind: "blocked", reason });
          return;
        }
        if (sData.submission?.id) {
          setState({ kind: "ready", submissionId: sData.submission.id });
        } else {
          setState({
            kind: "blocked",
            reason: "Couldn't create a submission for this video.",
          });
        }
      } catch (err) {
        if (cancel) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  // While the player is open, render only it (full-screen takeover).
  if (state.kind === "watching" && task) {
    return (
      <VideoTaskPlayer
        task={{
          id: task.id,
          title: task.title,
          pointsReward: task.pointsReward,
          xpReward: task.xpReward,
          videoConfig: task.videoConfig,
          contentUrl: task.contentUrl,
        }}
        submissionId={state.submissionId}
        onClose={(didSubmit) => {
          if (didSubmit) {
            // VIDEO auto-approves — send to the Approved tab, not the
            // pending-review "Submitted" tab (which only lists PENDING).
            router.push("/video-tasks?tab=approved");
          } else {
            // User backed out — keep the submission resumable
            setState({ kind: "ready", submissionId: state.submissionId });
          }
        }}
      />
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

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-rose-400" />
        <p className="text-sm text-gray-500">Loading video task…</p>
      </div>
    );
  }

  if (loadError || !task) {
    return (
      <div className="space-y-4">
        <Link
          href="/video-tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to video tasks
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

  const cfg = task.videoConfig;
  const watchSeconds = cfg?.watchSeconds ?? task.duration ?? 0;
  const hasVideoUrl = !!(cfg?.videoUrl || task.contentUrl);
  const minutes =
    watchSeconds > 0 ? Math.max(1, Math.round(watchSeconds / 60)) : null;

  return (
    <div className="space-y-5">
      <Link
        href="/video-tasks"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to video tasks
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
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <VideoIcon className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Video Task
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
            {watchSeconds > 0 && (
              <RewardBadge
                icon={<Clock className="w-3.5 h-3.5" />}
                label={`Watch ${formatDuration(watchSeconds)}${
                  minutes ? ` (~${minutes} min)` : ""
                }`}
                tone="slate"
              />
            )}
          </div>
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {/* YouTube-style engagement requirements — shown upfront so the user
          knows what's needed before starting. */}
      {engagementSteps(cfg).length > 0 && (
        <section className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-indigo-300 font-bold mb-2">
            This task requires
          </h2>
          <ul className="space-y-1.5 text-sm text-gray-200">
            {watchSeconds > 0 && (
              <li>▶️ Watch {formatDuration(watchSeconds)}</li>
            )}
            {engagementSteps(cfg).map((s) => (
              <li key={s.key}>✅ {s.label}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Instructions */}
      {task.instructions && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Steps
          </h2>
          <ol className="space-y-1.5 text-sm text-gray-200 list-decimal pl-5">
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

      {/* Instruction video (separate from the task's main video) */}
      {task.instructionVideoUrl && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1.5">
            <VideoIcon className="w-3.5 h-3.5" />
            Instruction video
          </h2>
          <div className="max-w-2xl mx-auto">
            <InlineVideoEmbed
              url={task.instructionVideoUrl}
              title={`Instruction video — ${task.title}`}
            />
          </div>
        </section>
      )}

      {/* State-driven action area */}
      {state.kind === "awaiting_review" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">Awaiting review</h2>
              <p className="text-xs text-sky-200/80 mt-1">
                You&apos;ve already submitted this — it&apos;s awaiting admin review.
                {task && task.pointsReward > 0
                  ? ` You'll get ${task.pointsReward.toLocaleString()} pts once approved.`
                  : ""}
              </p>
              <Link
                href="/video-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to video tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {state.kind === "completed_today" && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">
                You&apos;ve already done this today
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1">
                Your reward has been credited. Come back tomorrow for more.
              </p>
              <Link
                href="/video-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to video tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {state.kind === "blocked" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">
                Can&apos;t start this task right now
              </h2>
              <p className="text-xs text-amber-200/80 mt-1">{state.reason}</p>
              <Link
                href="/video-tasks"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to video tasks
              </Link>
            </div>
          </div>
        </section>
      )}

      {state.kind === "ready" && (
        <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Ready to watch?</h2>

            {watchSeconds > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-rose-500/15 border border-rose-500/40 px-4 py-3">
                <div className="p-2 rounded-lg bg-rose-500/30 text-rose-100 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-rose-200/80 font-bold">
                    Watch time required
                  </p>
                  <p className="text-2xl font-black text-white tabular-nums leading-none mt-0.5">
                    {formatDuration(watchSeconds)}
                    {minutes && (
                      <span className="text-sm font-bold text-rose-200/90 ml-2">
                        ≈ {minutes} min
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">
              {watchSeconds > 0 ? (
                <>
                  Stay on the player until the timer finishes. The video
                  can&apos;t be paused or skipped.
                </>
              ) : (
                <>
                  Watch the video on the next screen. The video can&apos;t be
                  paused or skipped.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              href="/video-tasks"
              className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={!hasVideoUrl}
              onClick={() =>
                setState({ kind: "watching", submissionId: state.submissionId })
              }
              className="flex-1 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              {hasVideoUrl ? "Start Watching" : "No video URL configured"}
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
