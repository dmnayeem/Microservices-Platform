"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X, Loader2, PlayCircle, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/video-tasks";
import { confirmDialog } from "@/lib/confirm";
import { VideoOverlayAd } from "@/components/user/primitives/video-overlay-ad";

const ReactPlayer = dynamic(() => import("react-player"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-black">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  ),
});

interface Props {
  url: string;
  watchSeconds: number;
  title?: string;
  /** Task + submission ids — used to send server heartbeats so watch time is
   *  accrued server-side (anti-fraud), not just trusted from the client flag. */
  taskId: string;
  submissionId: string | null;
  onComplete: () => void;
  onClose: () => void;
}

type Phase = "warmup" | "watch" | "complete";

const WARMUP = 3;

/**
 * Fullscreen locked watch player for social WATCH/stream actions. Counts up to
 * `watchSeconds` (pausing when the tab is hidden), blocks pause/seek, then calls
 * `onComplete()`. Adapted from VideoTaskPlayer but with no submit of its own —
 * the parent bundle flow records the item as watched.
 */
export function SocialWatchModal({
  url,
  watchSeconds,
  title,
  taskId,
  submissionId,
  onComplete,
  onClose,
}: Props) {
  const target = Math.max(1, watchSeconds || 30);
  const [phase, setPhase] = useState<Phase>("warmup");
  const [warmupLeft, setWarmupLeft] = useState(WARMUP);
  const [watched, setWatched] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const watchedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const visibleRef = useRef(
    typeof document === "undefined" ? true : !document.hidden
  );
  const focusedRef = useRef(
    typeof document === "undefined" ? true : document.hasFocus()
  );
  const playingRef = useRef(false);
  const phaseRef = useRef<Phase>("warmup");
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const doneRef = useRef(false);

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

  // Server heartbeat — every 5s while genuinely watching (playing + visible +
  // focused), tell the server to accrue real seconds. The server clamps each
  // beat to real wall-clock, so this is the authoritative watch count the submit
  // route gates on; the client `watched` flag alone can no longer pass.
  useEffect(() => {
    if (!submissionId) return;
    const beat = () => {
      if (
        phaseRef.current !== "watch" ||
        !playingRef.current ||
        !visibleRef.current ||
        !focusedRef.current
      ) {
        return;
      }
      void fetch(`/api/tasks/${taskId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      }).catch(() => {});
    };
    const iv = setInterval(beat, 5000);
    return () => clearInterval(iv);
  }, [taskId, submissionId]);

  // Warmup countdown — transition happens inside the timeout (not synchronously
  // in the effect body) to avoid cascading renders.
  useEffect(() => {
    if (phase !== "warmup") return;
    const t = setTimeout(() => {
      if (warmupLeft <= 1) {
        setPhase("watch");
      } else {
        setWarmupLeft((s) => s - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, warmupLeft]);

  // Real playback tracking — advance only by genuine currentTime deltas while
  // playing + visible + focused; reject seeks. Mirrors VideoTaskPlayer.
  const canAccrue = () =>
    playingRef.current && visibleRef.current && focusedRef.current;

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t = e.currentTarget.currentTime;
    if (!Number.isFinite(t)) return;
    const delta = t - lastTimeRef.current;
    lastTimeRef.current = t;
    if (phaseRef.current !== "watch") return;
    if (!canAccrue()) return;
    if (delta <= 0 || delta > 2) return;
    const next = Math.min(target, watchedRef.current + delta);
    watchedRef.current = next;
    setWatched(next);
    if (next >= target) {
      setPhase("complete");
    }
  };

  const completeFromEnded = () => {
    if (phaseRef.current !== "watch") return;
    watchedRef.current = target;
    setWatched(target);
    setPhase("complete");
  };

  // Fire onComplete once when done — the user then leaves via the Continue button.
  useEffect(() => {
    if (phase !== "complete" || doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [phase, onComplete]);

  const handleCancel = async () => {
    if (phase !== "complete" && watched < target) {
      const ok = await confirmDialog({
        title: "Quit now?",
        description: "This action won't be counted.",
        tone: "warning",
        confirmLabel: "Quit",
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-100 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/80 to-transparent">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">
            Watch to unlock
          </p>
          {title && (
            <p className="text-sm text-white font-semibold truncate">{title}</p>
          )}
        </div>
        <button
          onClick={handleCancel}
          className="ml-3 p-2 rounded-full bg-gray-900/60 hover:bg-gray-800 text-gray-300"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Player */}
      <div className="relative flex-1">
        {url ? (
          <ReactPlayer
            ref={playerRef}
            src={url}
            playing={phase === "watch"}
            playsInline
            controls={false}
            muted={false}
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0, backgroundColor: "#000" }}
            onPlay={() => {
              playingRef.current = true;
              setIsPlaying(true);
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
            }}
            onTimeUpdate={handleTimeUpdate}
            config={{ youtube: { disablekb: 1, rel: 0, fs: 0 } }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-400">
            <p>No target URL configured.</p>
          </div>
        )}

        {/* Touch-block overlay — prevents pause/seek/skip */}
        <div
          className="absolute inset-0 z-10"
          onClick={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onTouchEnd={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none" }}
        />

        {/* Tap-to-play — a real user gesture starts genuine sound playback;
            watch time only accrues while actually playing. */}
        {phase === "watch" && !isPlaying && url && (
          <button
            type="button"
            onClick={() => {
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
            </span>
          </button>
        )}

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
                Stay on this screen.
              </p>
            </div>
          </div>
        )}

        {phase === "complete" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-emerald-950/90">
            <div className="text-center pointer-events-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-lg text-white font-bold">Done!</p>
              <p className="text-sm text-emerald-200 mt-1">Action unlocked.</p>
              <button
                onClick={onClose}
                className="mt-5 inline-flex items-center justify-center gap-1.5 px-8 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* In-video overlay banner strip (above the HUD, watch phase only) */}
        {phase === "watch" && (
          <div className="absolute bottom-16 inset-x-0 z-30 px-3 pointer-events-none">
            <div className="pointer-events-auto max-w-md mx-auto">
              <VideoOverlayAd />
            </div>
          </div>
        )}
      </div>

      {/* Bottom HUD — progress */}
      {phase === "watch" && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-linear-to-t from-black via-black/90 to-transparent px-4 pt-6 pb-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 inline-flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 text-indigo-400" />
              Watching
            </span>
            <span className="text-white tabular-nums font-mono">
              {formatDuration(watched)} / {formatDuration(target)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-[width] duration-300"
              style={{ width: `${(watched / target) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
