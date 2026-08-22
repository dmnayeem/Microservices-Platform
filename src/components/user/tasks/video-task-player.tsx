"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  X,
  Loader2,
  Upload,
  KeyRound,
  Sparkles,
  PlayCircle,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  Link2,
  SkipForward,
  Copy,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { notifyCenter } from "@/lib/notify-center";
import type { VideoConfig, EngagementKey, VideoStepProof } from "@/lib/video-tasks";
import {
  formatDuration,
  engagementSteps,
  effectiveSteps,
  stepIsRequired,
  stepType,
  STEP_TYPE_META,
} from "@/lib/video-tasks";
import { playerSource } from "@/lib/video-url";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { AdInterstitialOverlay } from "@/components/user/primitives/ad-interstitial-overlay";
import { VideoOverlayAd } from "@/components/user/primitives/video-overlay-ad";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";

const ReactPlayer = dynamic(() => import("react-player"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-black">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  ),
});

interface PlayerTask {
  id: string;
  title: string;
  pointsReward: number;
  xpReward: number;
  videoConfig?: VideoConfig | null;
  contentUrl?: string | null;
}

interface Props {
  task: PlayerTask;
  submissionId: string;
  /** Server-accrued watch seconds so far — resume instead of restarting at 0. */
  initialWatchedSeconds?: number;
  onClose: (didSubmit: boolean, status?: string) => void;
}

type Phase = "warmup" | "watch" | "complete" | "submitted";

export function VideoTaskPlayer({
  task,
  submissionId,
  initialWatchedSeconds = 0,
  onClose,
}: Props) {
  const cfg = task.videoConfig;
  const watchTarget = cfg?.watchSeconds ?? 30;
  const warmupTarget = cfg?.warmupSeconds ?? 0;
  const videoUrl = cfg?.videoUrl || task.contentUrl || "";
  // react-player v3's URL matchers are strict; normalize YouTube/Vimeo to their
  // canonical embed form so the player actually loads instead of black-screening.
  const playerSrc = useMemo(() => playerSource(videoUrl), [videoUrl]);
  // Clamp resume progress just below target so the player still enters the watch
  // phase (the completion gate re-checks server seconds on submit anyway).
  const resumeFrom = Math.max(0, Math.min(initialWatchedSeconds, Math.max(0, watchTarget - 1)));
  const proofReq = cfg?.proofRequirements ?? {
    screenshot: false,
    uniqueKey: false,
  };

  const [phase, setPhase] = useState<Phase>(
    warmupTarget > 0 ? "warmup" : "watch"
  );
  const [warmupLeft, setWarmupLeft] = useState(warmupTarget);
  const [watched, setWatched] = useState(resumeFrom);
  const [isPlaying, setIsPlaying] = useState(false);
  // No autoplay: the video only starts after a real user tap (iOS Safari blocks
  // autoplay-with-sound and doesn't fire play() on cross-origin YouTube iframes).
  const [userStarted, setUserStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  // Player couldn't load the media (bad/unsupported URL) — show a clear error
  // + external link instead of a silent black box.
  const [loadError, setLoadError] = useState(false);
  // Final server-decided status (APPROVED/AUTO_APPROVED/PENDING) — used to land
  // the user on the right tab after they press Done.
  const [finalStatus, setFinalStatus] = useState<string | undefined>(undefined);
  // Portal-mount guard so we only render into document.body on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uniqueKey, setUniqueKey] = useState("");
  // YouTube-style engagement steps + the user's honor confirmations.
  const engSteps = useMemo(() => engagementSteps(cfg), [cfg]);
  const [engDone, setEngDone] = useState<Record<EngagementKey, boolean>>({
    subscribe: false,
    like: false,
    comment: false,
  });
  const allEngDone = engSteps.every((s) => engDone[s.key]);
  const [copiedComment, setCopiedComment] = useState(false);
  // Sequential proof steps (new flow): shown one at a time after the video.
  // `stepIndex` = how many steps are done (the active step is at this index);
  // `stepShots` holds the uploaded screenshot URL per step id.
  const steps = useMemo(() => effectiveSteps(cfg), [cfg]);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepShots, setStepShots] = useState<Record<string, string>>({});
  // Per-step pasted proof link + whether each step was done or skipped.
  const [stepLinks, setStepLinks] = useState<Record<string, string>>({});
  const [stepStatus, setStepStatus] = useState<
    Record<string, "done" | "skipped">
  >({});
  // After the video is watched, the player collapses to a compact bar so the
  // steps take the screen (re-openable via the bar's toggle).
  const [videoCollapsed, setVideoCollapsed] = useState(false);
  // True once the user presses Complete — opens the outro ad, then submits.
  const [completePressed, setCompletePressed] = useState(false);
  // The flow is "done" once every step has been addressed (saved or skipped)
  // AND every REQUIRED step was actually completed (optional steps may skip).
  const reachedEnd = steps.length > 0 && stepIndex >= steps.length;
  const requiredStepsDone = steps
    .filter(stepIsRequired)
    .every((s) => stepStatus[s.id] === "done");
  const allStepsDone = reachedEnd && requiredStepsDone;
  // Interstitial ad gates — playback waits for the intro ad; the reward flow
  // waits for the outro ad. Both resolve immediately when no ad is available.
  const [introAdDone, setIntroAdDone] = useState(false);
  const [outroAdDone, setOutroAdDone] = useState(false);
  const submittedRef = useRef(false);
  const watchedRef = useRef(resumeFrom);
  const lastTimeRef = useRef(0);
  // Seek-to-resume runs once, on the first real playback tick.
  const seekedRef = useRef(false);
  // Actual media duration (seconds), captured from the player. Sent on submit
  // so the server can cap the required watch time at the real video length —
  // otherwise a video shorter than watchSeconds is impossible to complete.
  const durationRef = useRef(0);
  // Gating refs — watch time only accrues while the video is genuinely
  // playing AND the tab is both visible and focused. Kept in refs so the
  // per-frame timeupdate handler and the heartbeat interval read live values
  // without re-subscribing.
  const visibleRef = useRef(
    typeof document === "undefined" ? true : !document.hidden
  );
  const focusedRef = useRef(
    typeof document === "undefined" ? true : document.hasFocus()
  );
  const playingRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const handleCancelRef = useRef<() => void>(() => {});

  // Mirror phase into a ref so the timeupdate handler reads the live value.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Track tab visibility + window focus — either being lost stops accrual.
  useEffect(() => {
    const onVis = () => {
      visibleRef.current = !document.hidden;
    };
    const onFocus = () => {
      focusedRef.current = true;
    };
    const onBlur = () => {
      focusedRef.current = false;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Warmup countdown — held until the intro ad is dismissed.
  useEffect(() => {
    if (phase !== "warmup") return;
    if (!introAdDone) return;
    if (warmupLeft <= 0) {
      setPhase("watch");
      return;
    }
    const t = setTimeout(() => {
      setWarmupLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, warmupLeft, introAdDone]);

  // ── Real playback tracking ──────────────────────────────────────────────
  // Advance watched seconds by the actual delta of the player's currentTime,
  // and only while the video is playing + the tab is visible + focused. Seeks
  // (delta <= 0, or a forward jump > 2s) are ignored so the counter reflects
  // genuinely-watched time, not scrubbing.
  const canAccrue = () =>
    playingRef.current && visibleRef.current && focusedRef.current;

  const handleTimeUpdate = (
    e: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    const dur = e.currentTarget.duration;
    if (Number.isFinite(dur) && dur > 0) durationRef.current = dur;
    const t = e.currentTarget.currentTime;
    if (!Number.isFinite(t)) return;
    const delta = t - lastTimeRef.current;
    lastTimeRef.current = t;
    if (phaseRef.current !== "watch") return;
    if (!canAccrue()) return;
    // Normal playback ticks are small positive deltas; reject seeks/jumps.
    if (delta <= 0 || delta > 2) return;
    const next = Math.min(watchTarget, watchedRef.current + delta);
    watchedRef.current = next;
    setWatched(next);
    if (next >= watchTarget) {
      setPhase("complete");
    }
  };

  const completeFromEnded = () => {
    // Video ended before hitting watchTarget (video shorter than target):
    // a genuine full watch still counts.
    if (phaseRef.current !== "watch") return;
    watchedRef.current = watchTarget;
    setWatched(watchTarget);
    setPhase("complete");
  };

  // ── Heartbeat ───────────────────────────────────────────────────────────
  // Ping the server so IT accrues the authoritative watchedSeconds — the
  // submit gate trusts that value, not the client's local counter. The first
  // beat (fired on playback start) only anchors the clock; each later beat
  // credits the real, capped gap since the previous one. `force` lets the
  // pre-submit beat flush the final interval even after playback has ended.
  const sendBeat = async (force = false) => {
    if (!force && !canAccrue()) return;
    try {
      await fetch(`/api/tasks/${task.id}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
        keepalive: true,
      });
    } catch {
      /* transient network error — next beat will catch up */
    }
  };

  useEffect(() => {
    if (phase !== "watch") return;
    const id = setInterval(() => void sendBeat(), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, task.id, submissionId]);

  const needsProofForm = proofReq.screenshot || proofReq.uniqueKey;
  /**
   * Whether the task collects anything after the video. When it doesn't,
   * `autoSubmit` means "don't show a proof form", NOT "submit by itself" — the
   * user still presses the button below.
   *
   * There used to be an effect here that submitted with no user action at all,
   * so the task went from playing to done with nothing to press and no signal
   * that the work had been sent. It's gone: submitting is always something the
   * user chooses to do.
   */
  const needsInteraction =
    needsProofForm || engSteps.length > 0 || steps.length > 0;

  // Step flow: after the user presses Complete and the outro ad is closed,
  // create the submission.
  useEffect(() => {
    if (steps.length === 0) return;
    if (!completePressed || !outroAdDone) return;
    if (submittedRef.current) return;
    void doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completePressed, outroAdDone]);

  // Collapse the player once the video is watched so the steps get the room.
  useEffect(() => {
    if (phase === "complete" && needsInteraction) setVideoCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Advance to the next step (its required proof — screenshot and/or link —
  // must be provided).
  const saveStep = () => {
    const s = steps[stepIndex];
    if (!s) return;
    if (s.requireScreenshot && !stepShots[s.id]?.trim()) {
      toast.error("Upload a screenshot for this step first");
      return;
    }
    if (s.requireLink && !stepLinks[s.id]?.trim()) {
      toast.error("Paste the proof link for this step first");
      return;
    }
    setStepStatus((m) => ({ ...m, [s.id]: "done" }));
    setStepIndex((i) => Math.min(i + 1, steps.length));
  };

  // Skip an OPTIONAL step (required steps can't be skipped).
  const skipStep = () => {
    const s = steps[stepIndex];
    if (!s || stepIsRequired(s)) return;
    setStepStatus((m) => ({ ...m, [s.id]: "skipped" }));
    setStepIndex((i) => Math.min(i + 1, steps.length));
  };

  const doSubmit = async () => {
    if (submittedRef.current) return;
    // Legacy engagement/proof-form checks only apply to the old flow (no steps).
    // When typed steps are present (incl. steps synthesized from engagement),
    // proof is per-step and validated below.
    if (steps.length === 0) {
      if (proofReq.screenshot && !screenshotUrl.trim()) {
        toast.error("Screenshot URL is required");
        return;
      }
      if (!allEngDone) {
        toast.error("Please complete all the steps first");
        return;
      }
    }
    if (proofReq.uniqueKey && !uniqueKey.trim()) {
      toast.error("Unique key is required");
      return;
    }
    // Sequential steps: every REQUIRED step must carry its required proof
    // (screenshot and/or link). Optional/skipped steps are ignored.
    const stepImages = steps.map((s) => stepShots[s.id] ?? "");
    if (steps.length > 0) {
      const missing = steps.find(
        (s) =>
          stepIsRequired(s) &&
          ((s.requireScreenshot && !stepShots[s.id]?.trim()) ||
            (s.requireLink && !stepLinks[s.id]?.trim()))
      );
      if (missing) {
        toast.error("Complete all required steps first");
        return;
      }
    }
    const videoSteps: VideoStepProof[] = steps.map((s) => ({
      id: s.id,
      type: stepType(s),
      screenshotUrl: stepShots[s.id]?.trim() || undefined,
      link: stepLinks[s.id]?.trim() || undefined,
      status: stepStatus[s.id] ?? "done",
    }));
    submittedRef.current = true;
    setBusy(true);
    try {
      // Flush the final watch gap to the server so its authoritative
      // watchedSeconds is up to date before the gate runs.
      await sendBeat(true);
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          videoDuration: durationRef.current || undefined,
          proof: videoUrl,
          proofImages:
            steps.length > 0
              ? stepImages.filter((u) => u.trim())
              : screenshotUrl
                ? [screenshotUrl]
                : [],
          videoSteps: steps.length > 0 ? videoSteps : undefined,
          uniqueKey,
          // Legacy honor confirmations only when NOT using typed steps.
          engagement:
            steps.length === 0 && engSteps.length
              ? engSteps.reduce(
                  (acc, s) => ({ ...acc, [s.key]: engDone[s.key] }),
                  {} as Record<EngagementKey, boolean>
                )
              : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const status = data?.submission?.status as string | undefined;
      setFinalStatus(status);
      if (status === "REJECTED") {
        toast.error("Submission rejected", {
          description: data?.submission?.rejectionReason ?? undefined,
        });
        // Brief pause so the user sees the toast, then close
        setTimeout(() => onClose(true, status), 1500);
        return;
      }
      setPhase("submitted");
      if (status === "PENDING") {
        notifyCenter.success("Submitted for review", "You'll be notified once approved.");
      } else {
        notifyCenter.reward({
          amount: task.pointsReward,
          unit: "pts",
          title: "Watched & rewarded!",
        });
      }
      // Stay on the success screen — the user leaves via the "Done" button.
    } catch (err) {
      // Let the user press Submit again.
      submittedRef.current = false;
      toast.error("Couldn't submit", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (phase === "submitted") {
      onClose(true, finalStatus);
      return;
    }
    if (phase === "complete" && submittedRef.current) {
      onClose(true, finalStatus);
      return;
    }
    if (
      phase === "warmup" ||
      (phase === "watch" && watched < watchTarget)
    ) {
      const ok = await confirmDialog({
        title: "Quit now and lose your progress?",
        description: "You won't earn points.",
        tone: "warning",
        confirmLabel: "Quit",
      });
      if (!ok) return;
    }
    onClose(false);
  };

  // Keep a live handle to handleCancel so the mount-only popstate listener
  // always runs the current closure (fresh phase/watched), not a stale one.
  useEffect(() => {
    handleCancelRef.current = () => void handleCancel();
  });

  // Playback lock — a hardware/browser Back (or back-swipe) shouldn't silently
  // drop the user out mid-watch. We trap history so Back routes through the
  // same "Quit now?" confirm as the X button. Released once watching is done.
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const onPop = () => {
      const p = phaseRef.current;
      if (p === "complete" || p === "submitted") return; // allow leaving
      // Re-trap our position, then prompt.
      window.history.pushState(null, "", window.location.href);
      handleCancelRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Warn on tab refresh/close while actively watching.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const p = phaseRef.current;
      if (p === "warmup" || p === "watch") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const watchPct = useMemo(
    () =>
      watchTarget > 0 ? Math.min(100, (watched / watchTarget) * 100) : 0,
    [watched, watchTarget]
  );

  if (!mounted) return null;

  // Portal to <body> so the full-screen player lives in the ROOT stacking
  // context — otherwise an ancestor transform/opacity (pull-to-refresh, page
  // fade) traps its z-index and the sidebar/header/bottom-bar paint over it.
  return createPortal(
    <div className="fixed inset-0 z-100 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/80 to-transparent">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">
            Video Task
          </p>
          <p className="text-sm text-white font-semibold truncate">
            {task.title}
          </p>
        </div>
        <button
          onClick={handleCancel}
          disabled={busy}
          className="ml-3 p-2 rounded-full bg-gray-900/60 hover:bg-gray-800 text-gray-300 disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Player — once the video is watched it collapses to a compact bar so the
          proof steps get the screen (tap the bar to replay). */}
      {videoCollapsed ? (
        <button
          type="button"
          onClick={() => setVideoCollapsed(false)}
          className="shrink-0 mt-14 mx-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-left"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white truncate">
              Video watched
            </span>
            <span className="block text-[11px] text-emerald-200/80">
              Tap to replay the video
            </span>
          </span>
          <ChevronDown className="w-4 h-4 text-emerald-300 shrink-0" />
        </button>
      ) : (
      <div className="relative flex-1">
        {playerSrc ? (
          <ReactPlayer
            ref={playerRef}
            src={playerSrc}
            playing={phase === "watch" && introAdDone && userStarted}
            controls={false}
            playsInline
            muted={false}
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#000",
            }}
            onPlay={() => {
              playingRef.current = true;
              setIsPlaying(true);
              // Resume: seek to the server-accrued position once, so navigating
              // away and back doesn't restart the video from 0.
              if (!seekedRef.current) {
                seekedRef.current = true;
                if (resumeFrom > 0 && playerRef.current) {
                  try {
                    playerRef.current.currentTime = resumeFrom;
                    lastTimeRef.current = resumeFrom;
                  } catch {
                    /* seek unsupported on this source — accrue from here instead */
                  }
                }
              }
              // Anchor the server clock at real playback start (first beat
              // credits 0), so short videos don't fail the gate on a race.
              void sendBeat();
            }}
            onPause={() => {
              playingRef.current = false;
              setIsPlaying(false);
            }}
            onEnded={() => {
              playingRef.current = false;
              setIsPlaying(false);
              completeFromEnded();
            }}
            onError={() => {
              playingRef.current = false;
              setIsPlaying(false);
              setLoadError(true);
            }}
            onTimeUpdate={handleTimeUpdate}
            config={{
              youtube: {
                disablekb: 1,
                rel: 0,
                fs: 0,
                // Hide video annotations/cards. NOTE: this does NOT remove
                // YouTube's own pre-roll ads — those play inside a cross-origin
                // iframe and cannot be skipped programmatically.
                iv_load_policy: 3,
              },
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-400">
            <p>No video URL configured.</p>
          </div>
        )}

        {/* Load error — the media couldn't play (bad/unsupported URL). Show a
            clear message + external link instead of a silent black screen. */}
        {loadError && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/95 px-6 text-center">
            <div className="max-w-xs space-y-3">
              <p className="text-sm font-semibold text-white">
                Couldn&apos;t load this video
              </p>
              <p className="text-xs text-gray-400">
                The video link may be invalid or unsupported for in-app playback.
                You can open it directly and try again.
              </p>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
                >
                  <ExternalLink className="w-4 h-4" /> Open video
                </a>
              )}
              <button
                onClick={handleCancel}
                className="block w-full text-xs text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Touch-block overlay — swallows clicks/taps so users can't pause/seek */}
        <div
          className="absolute inset-0 z-10"
          onClick={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onTouchEnd={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none" }}
        />

        {/* Tap-to-play — browsers block autoplay-with-sound, and muted views
            don't register on YouTube/FB. A real user gesture starts genuine
            playback with sound. Shown whenever we're in the watch phase but
            the player isn't actually playing. */}
        {phase === "watch" && !isPlaying && videoUrl && introAdDone && (
          <button
            type="button"
            onClick={() => {
              // Flip react-player's `playing` state — this starts BOTH HTML5
              // <video> and cross-origin YouTube iframes (a direct DOM .play()
              // is a no-op on the YT iframe). Also nudge the element for an
              // instant start on native video.
              setUserStarted(true);
              const p = playerRef.current;
              if (p && typeof p.play === "function") {
                const r = p.play();
                if (r && typeof (r as Promise<void>).catch === "function") {
                  (r as Promise<void>).catch(() => {});
                }
              }
            }}
            className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-sm"
          >
            <span className="flex flex-col items-center gap-3">
              <span className="grid place-items-center w-20 h-20 rounded-full bg-white/15 ring-2 ring-white/40">
                <PlayCircle className="w-11 h-11 text-white" />
              </span>
              <span className="text-sm font-semibold text-white">
                Tap to play with sound
              </span>
              <span className="text-xs text-gray-300">
                Watch time counts only while the video is playing
              </span>
            </span>
          </button>
        )}

        {/* Phase 1: warmup */}
        {phase === "warmup" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 pointer-events-none">
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">
                Get ready
              </p>
              <p className="text-7xl font-black text-white tabular-nums">
                {warmupLeft}
              </p>
              <p className="text-sm text-gray-400 mt-3">
                Starting in… stay on this screen.
              </p>
            </div>
          </div>
        )}

        {/* Phase 4: submitted overlay */}
        {phase === "submitted" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-emerald-950/90">
            <div className="text-center px-4">
              <Sparkles className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-xs uppercase tracking-widest text-emerald-300 font-bold mb-1">
                Earned
              </p>
              <p className="text-5xl font-black text-white tabular-nums">
                +{task.pointsReward}
              </p>
              <p className="text-sm text-emerald-200 mt-2">points credited</p>
              {/* Completion-screen sponsor slot. */}
              <div className="mt-5 w-full max-w-md mx-auto">
                <AdRenderer placement="TASK_COMPLETE" />
              </div>
            </div>
          </div>
        )}

        {/* Sponsored slots above and below the video (opt-in; null when no ad) */}
        <div className="absolute top-14 inset-x-0 z-30 px-3 pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-auto">
            <AdRenderer placement="VIDEO_ABOVE" dismissible />
          </div>
        </div>
        <div className="absolute bottom-28 inset-x-0 z-30 px-3 pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-auto">
            <AdRenderer placement="VIDEO_BELOW" dismissible />
          </div>
        </div>

        {/* In-video overlay banner strip (pinned above the HUD, watch phase only) */}
        {phase === "watch" && (
          <div className="absolute bottom-16 inset-x-0 z-30 px-3 pointer-events-none">
            <div className="pointer-events-auto max-w-md mx-auto">
              <VideoOverlayAd />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Bottom HUD — scrollable + safe-area padding so the proof inputs and
          Submit button stay reachable when the mobile keyboard is open. When the
          video is collapsed the HUD fills the remaining space (normal flow). */}
      <div
        className={cn(
          "z-20 overflow-y-auto px-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3",
          videoCollapsed
            ? "relative flex-1 bg-black"
            : "absolute bottom-0 inset-x-0 max-h-[70vh] bg-linear-to-t from-black via-black/90 to-transparent"
        )}
      >
        {phase === "submitted" && (
          <button
            onClick={() => onClose(true, finalStatus)}
            className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
          >
            Done — back to tasks
          </button>
        )}

        {phase === "watch" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300 inline-flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-indigo-400" />
                Watching
              </span>
              <span className="text-white tabular-nums font-mono">
                {formatDuration(watched)} / {formatDuration(watchTarget)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-[width] duration-300"
                style={{ width: `${watchPct}%` }}
              />
            </div>
          </>
        )}

        {phase === "complete" && (
          <div className="space-y-3">
            {steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-white">
                  Finish these steps to earn:
                </p>
                {steps.map((s, i) => {
                  const done = i < stepIndex;
                  const active = i === stepIndex;
                  const shot = stepShots[s.id] ?? "";
                  const link = stepLinks[s.id] ?? "";
                  const meta = STEP_TYPE_META[stepType(s)];
                  const optional = !stepIsRequired(s);
                  const skipped = stepStatus[s.id] === "skipped";
                  const canSave =
                    (!s.requireScreenshot || !!shot.trim()) &&
                    (!s.requireLink || !!link.trim());
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-lg border p-2.5 space-y-2 transition-colors",
                        done
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : active
                            ? "border-indigo-500/40 bg-gray-900"
                            : "border-gray-800 bg-gray-950 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white inline-flex items-center gap-1.5 min-w-0">
                          {done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <span className="shrink-0">{meta.emoji}</span>
                          )}
                          <span className="truncate">
                            {s.label || meta.verb}
                          </span>
                          {optional && (
                            <span className="shrink-0 text-[9px] font-bold uppercase text-gray-400 bg-gray-800 rounded px-1.5 py-0.5">
                              {skipped ? "Skipped" : "Optional"}
                            </span>
                          )}
                        </span>
                        {active && s.actionUrl && (
                          <a
                            href={s.actionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 text-xs font-semibold shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {meta.openText}
                          </a>
                        )}
                      </div>
                      {active && (
                        <>
                          {stepType(s) === "comment" && s.commentTemplate && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  ?.writeText(s.commentTemplate ?? "")
                                  .then(() => toast.success("Comment copied"))
                                  .catch(() => {});
                              }}
                              className="w-full flex items-start gap-2 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-2 text-left"
                            >
                              <Copy className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                              <span className="flex-1 text-xs text-gray-300">
                                {s.commentTemplate}
                              </span>
                            </button>
                          )}
                          {s.requireScreenshot && (
                            <ProofImageUpload
                              value={shot}
                              onChange={(url) =>
                                setStepShots((p) => ({ ...p, [s.id]: url }))
                              }
                              placeholder="Upload a screenshot of this step"
                            />
                          )}
                          {s.requireLink && (
                            <div className="relative">
                              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                              <input
                                type="url"
                                value={link}
                                onChange={(e) =>
                                  setStepLinks((p) => ({
                                    ...p,
                                    [s.id]: e.target.value,
                                  }))
                                }
                                placeholder="Paste the proof link (e.g. your comment URL)"
                                className="w-full pl-8 pr-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveStep}
                              disabled={!canSave}
                              className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Save &amp; continue
                            </button>
                            {optional && (
                              <button
                                type="button"
                                onClick={skipStep}
                                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                              >
                                <SkipForward className="w-4 h-4" />
                                Skip
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {allStepsDone && proofReq.uniqueKey && (
                  <div>
                    <label className="flex text-xs font-medium text-gray-400 mb-1 items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      Unique Key <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={uniqueKey}
                      onChange={(e) => setUniqueKey(e.target.value)}
                      placeholder="Enter the key shown in the video"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    {cfg?.uniqueKeyHint && (
                      <p className="text-[11px] text-amber-400/80 mt-1">
                        💡 {cfg.uniqueKeyHint}
                      </p>
                    )}
                  </div>
                )}
                {allStepsDone && (
                  <button
                    type="button"
                    onClick={() => setCompletePressed(true)}
                    disabled={busy || (proofReq.uniqueKey && !uniqueKey.trim())}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Complete
                  </button>
                )}
              </div>
            )}
            {steps.length === 0 && (
              <>
            {engSteps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-white">
                  Finish these steps to earn:
                </p>
                {engSteps.map((s) => (
                  <div
                    key={s.key}
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white">{s.label}</span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 text-xs font-semibold shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    </div>
                    {s.key === "comment" && cfg?.engagement?.commentTemplate && (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-2 py-1.5 rounded bg-gray-950 border border-gray-800 text-gray-300 text-xs break-words">
                          {cfg.engagement.commentTemplate}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(cfg.engagement!.commentTemplate!)
                              .then(() => {
                                setCopiedComment(true);
                                setTimeout(() => setCopiedComment(false), 1500);
                              });
                          }}
                          className="px-2 py-1.5 rounded bg-gray-800 text-gray-200 text-xs font-semibold shrink-0"
                        >
                          {copiedComment ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={engDone[s.key]}
                        onChange={(e) =>
                          setEngDone((p) => ({ ...p, [s.key]: e.target.checked }))
                        }
                        className="rounded bg-gray-800 border-gray-600 text-emerald-500"
                      />
                      <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        I did this
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            {needsProofForm && (
              <div className="space-y-2">
                {proofReq.screenshot && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Screenshot <span className="text-red-400">*</span>
                    </label>
                    <ProofImageUpload
                      value={screenshotUrl}
                      onChange={setScreenshotUrl}
                    />
                  </div>
                )}
                {proofReq.uniqueKey && (
                  <div>
                    <label className="flex text-xs font-medium text-gray-400 mb-1 items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      Unique Key <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={uniqueKey}
                      onChange={(e) => setUniqueKey(e.target.value)}
                      placeholder="Enter the key shown in the video"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    {cfg?.uniqueKeyHint && (
                      <p className="text-[11px] text-amber-400/80 mt-1">
                        💡 {cfg.uniqueKeyHint}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Always an explicit press — the user needs to see that their work
                was sent, not have it happen silently behind them. */}
            <button
              onClick={doSubmit}
              disabled={busy || !allEngDone}
              className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {busy
                ? "Submitting…"
                : allEngDone
                  ? `Submit & Claim +${task.pointsReward} pts`
                  : "Complete the steps above"}
            </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Intro interstitial — shown on open; playback is held until it's
          dismissed. Resolves immediately (onDone) if no ad / ad-free plan. */}
      <AdInterstitialOverlay
        open={!introAdDone}
        placement="VIDEO_INTERSTITIAL"
        allowClose
        onDone={() => setIntroAdDone(true)}
      />

      {/* Outro interstitial — shown once watching completes, before the reward
          is claimed. Also resolves immediately when no ad is available. */}
      <AdInterstitialOverlay
        open={
          (steps.length > 0 ? completePressed : phase === "complete") &&
          !outroAdDone
        }
        placement="VIDEO_INTERSTITIAL"
        allowClose
        onDone={() => setOutroAdDone(true)}
      />
    </div>,
    document.body
  );
}
