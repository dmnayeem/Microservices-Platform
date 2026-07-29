"use client";

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import dynamic from "next/dynamic";
import { Gauge, Loader2, AlertCircle } from "lucide-react";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface Props {
  /** Video is fetched as a short-lived signed URL from the gated /stream route
   *  — the raw URL is never handed to the client. */
  courseId: string;
  lessonId: string;
  subtitlesUrl: string | null;
  /** Resume position in seconds. */
  initialPosition: number;
  /** Fires every ~15s with current playback position. */
  onPositionTick: (positionSeconds: number) => void;
  /** Fires once when the player learns the video duration. */
  onDuration: (durationSeconds: number) => void;
  /** Throttled watched-seconds tracker (max of [previousWatched, currentPosition]). */
  onWatched: (watchedSeconds: number) => void;
  /** Fires when the learner crosses the 90% completion threshold for the
   *  first time. The consumer can call mark-complete in response. */
  onCrossed: () => void;
}

export function LessonVideoPlayer({
  courseId,
  lessonId,
  subtitlesUrl,
  initialPosition,
  onPositionTick,
  onDuration,
  onWatched,
  onCrossed,
}: Props) {
  const [speed, setSpeed] = useState<number>(1);
  const [duration, setDuration] = useState<number>(0);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const watchedRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const lastSavedAtRef = useRef<number>(0);
  const crossedRef = useRef<boolean>(false);
  const seekedInitialRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Resolve a signed, enrollment-checked source. The raw URL never reaches the
  // DOM. The parent keys this component by lessonId, so each lesson gets a fresh
  // mount (initial src=null) — no synchronous reset needed here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/courses/${courseId}/lessons/${lessonId}/stream`,
          { cache: "no-store" }
        );
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !d.url) {
          setError(true);
          return;
        }
        setSrc(d.url as string);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId]);

  useEffect(() => {
    return () => {
      // Flush on unmount
      if (lastTickRef.current > 0) onPositionTick(lastTickRef.current);
      if (watchedRef.current > 0) onWatched(watchedRef.current);
    };
  }, [onPositionTick, onWatched]);

  // Belt-and-suspenders download hardening on the underlying <video> element.
  useEffect(() => {
    if (!src) return;
    const el = containerRef.current?.querySelector("video");
    if (!el) return;
    el.setAttribute("controlsList", "nodownload noremoteplayback");
    el.setAttribute("disablePictureInPicture", "");
    (el as HTMLVideoElement).disableRemotePlayback = true;
  }, [src]);

  const handleTimeUpdate = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      const t = e.currentTarget.currentTime;
      lastTickRef.current = t;
      if (t > watchedRef.current) watchedRef.current = t;

      // ~15s autosave throttle (in wall-clock seconds, not playback)
      const now = Date.now();
      if (now - lastSavedAtRef.current > 15_000) {
        lastSavedAtRef.current = now;
        onPositionTick(t);
        onWatched(watchedRef.current);
      }

      // Completion threshold (>= 90% watched)
      if (
        !crossedRef.current &&
        duration > 0 &&
        watchedRef.current / duration >= 0.9
      ) {
        crossedRef.current = true;
        onCrossed();
      }
    },
    [duration, onCrossed, onPositionTick, onWatched]
  );

  const handleLoadedMetadata = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      const d = e.currentTarget.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        onDuration(d);
      }
      // One-shot resume
      if (!seekedInitialRef.current && initialPosition > 5) {
        try {
          e.currentTarget.currentTime = initialPosition;
        } catch {
          // ignore — some engines don't allow seek before play
        }
      }
      seekedInitialRef.current = true;
    },
    [initialPosition, onDuration]
  );

  return (
    <div className="relative bg-black rounded-2xl border border-gray-800 overflow-hidden">
      <div
        ref={containerRef}
        className="relative pt-[56.25%]"
        onContextMenu={(e) => e.preventDefault()}
      >
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 p-4 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <p className="text-sm">Couldn&apos;t load this video. Refresh, or make sure you&apos;re enrolled.</p>
          </div>
        ) : !src ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
          </div>
        ) : (
          <ReactPlayer
            src={src}
            controls
            playsInline
            playbackRate={speed}
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          >
            {subtitlesUrl && (
              <track
                kind="subtitles"
                src={subtitlesUrl}
                srcLang="en"
                label="English"
                default
              />
            )}
          </ReactPlayer>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 p-2 border-t border-gray-800 bg-gray-950">
        <Gauge className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[10px] text-gray-500 uppercase font-bold mr-1">
          Speed
        </span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={
              "px-2 py-0.5 rounded text-[11px] font-bold tabular-nums " +
              (speed === s
                ? "bg-indigo-500 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800")
            }
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
