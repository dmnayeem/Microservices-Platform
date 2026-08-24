"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PlayCircle, Timer, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { pts } from "@/lib/utils";

/**
 * Watch-to-earn video ads.
 *
 * Renders **nothing at all** unless the server says the feature is on. That is
 * the shipped state: `ads.rewarded_enabled` defaults to false because a rewarded
 * ad pays points OUT, and with only house inventory every watch costs the owner
 * money and earns him none. The switch flips the day inventory pays.
 *
 * The countdown accrues from **real playback**, not a wall clock — `playing &&
 * visible && focused`, advanced by `currentTime` deltas, with a delta over two
 * seconds rejected so a seek cannot skip to the end. That is the pattern
 * `video-task-player.tsx` already uses for video tasks; `AdInterstitialOverlay`'s
 * countdown is a plain `setTimeout` and is deliberately not what is copied here.
 *
 * The server does not trust any of it. The claim carries a signed watch token and
 * is refused until `watchSeconds` have elapsed since the ad was served, on top of
 * the per-ad cooldown and the daily cap. This UI is the honest path, not the
 * enforcement.
 */

interface RewardedAd {
  id: string;
  title: string;
  headline: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  ctaLabel: string;
  targetUrl: string | null;
  rewardPoints: number;
  watchSeconds: number;
  cooldownRemaining: number;
  watchToken: string;
}

interface Feed {
  enabled: boolean;
  ads: RewardedAd[];
  dailyCap?: number;
  todayEarned?: number;
  remaining?: number;
}

export function RewardedVideoSection() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState<RewardedAd | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ads/rewarded");
      if (!r.ok) throw new Error();
      setFeed((await r.json()) as Feed);
    } catch {
      // A failure here must not break Browse & Earn, which shares this page.
      setFeed({ enabled: false, ads: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Off, still loading, or nothing to watch → render nothing rather than an
  // empty section that looks broken.
  if (!feed?.enabled || feed.ads.length === 0) return null;

  const cap = feed.dailyCap ?? 0;
  const earned = feed.todayEarned ?? 0;
  const capPct = cap > 0 ? Math.min(100, Math.round((earned / cap) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PlayCircle className="w-4.5 h-4.5 text-emerald-400" />
            Watch &amp; Earn
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Watch a short video all the way through to earn points.
          </p>
        </div>
        {cap > 0 && (
          <div className="text-right">
            <p className="text-[11px] text-gray-500">Today</p>
            <p className="text-sm font-bold text-white tabular-nums">
              {pts(earned)} / {pts(cap)} pts
            </p>
          </div>
        )}
      </div>

      {cap > 0 && (
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-[width] duration-500"
            style={{ width: `${capPct}%` }}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {feed.ads.map((ad) => (
          <RewardedCard key={ad.id} ad={ad} onWatch={() => setOpen(ad)} />
        ))}
      </div>

      {open && (
        <RewardedPlayer
          ad={open}
          onClose={() => setOpen(null)}
          onEarned={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RewardedCard({ ad, onWatch }: { ad: RewardedAd; onWatch: () => void }) {
  const [left, setLeft] = useState(ad.cooldownRemaining);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const ready = left <= 0;
  return (
    <div className="glass rounded-xl p-3 flex items-center gap-3">
      <div className="w-14 h-14 shrink-0 rounded-lg bg-gray-800 overflow-hidden grid place-items-center">
        {ad.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <PlayCircle className="w-6 h-6 text-gray-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{ad.title}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {ad.watchSeconds}s · <b className="text-amber-400">+{pts(ad.rewardPoints)} pts</b>
        </p>
      </div>
      <button
        onClick={onWatch}
        disabled={!ready}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
      >
        {ready ? (
          "Watch"
        ) : (
          <>
            <Timer className="w-3 h-3" />
            {formatLeft(left)}
          </>
        )}
      </button>
    </div>
  );
}

function formatLeft(sec: number): string {
  if (sec >= 3600) return `${Math.ceil(sec / 3600)}h`;
  if (sec >= 60) return `${Math.ceil(sec / 60)}m`;
  return `${sec}s`;
}

function RewardedPlayer({
  ad,
  onClose,
  onEarned,
}: {
  ad: RewardedAd;
  onClose: () => void;
  onEarned: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [watched, setWatched] = useState(0);
  const [claiming, setClaiming] = useState(false);

  // Accrual state in refs, not state: these are read inside event handlers that
  // fire many times a second, and re-rendering on each would be pointless churn.
  const playing = useRef(false);
  const visible = useRef(true);
  const focused = useRef(true);
  const lastTime = useRef(0);

  useEffect(() => {
    const onVis = () => {
      visible.current = document.visibilityState === "visible";
    };
    const onFocus = () => {
      focused.current = true;
    };
    const onBlur = () => {
      focused.current = false;
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

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const delta = v.currentTime - lastTime.current;
    lastTime.current = v.currentTime;
    // Reject a non-positive delta (a rewind) and anything over two seconds (a
    // seek, or a tab that was frozen). Only real, forward, watched time counts.
    if (delta <= 0 || delta > 2) return;
    if (!playing.current || !visible.current || !focused.current) return;
    setWatched((w) => Math.min(ad.watchSeconds, w + delta));
  };

  // A video shorter than the required watch time still counts when it ends —
  // otherwise a 10s creative with a 15s requirement could never be claimed.
  const onEnded = () => {
    playing.current = false;
    setWatched(ad.watchSeconds);
  };

  const done = watched >= ad.watchSeconds;
  const pct = Math.min(100, Math.round((watched / Math.max(1, ad.watchSeconds)) * 100));

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const r = await fetch(`/api/ads/${ad.id}/reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchToken: ad.watchToken }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Every one of these is a real server-side gate, so the message is the
        // server's rather than a generic "try again".
        toast.error(d.error ?? "Couldn't claim", {
          description:
            d.code === "TOO_SOON"
              ? `${d.secondsRemaining}s of watch time still needed`
              : d.cooldownRemaining
                ? `Available again in ${formatLeft(d.cooldownRemaining)}`
                : undefined,
        });
        return;
      }
      toast.success(`+${pts(d.rewarded)} points`);
      onEarned();
    } catch {
      toast.error("Couldn't claim", { description: "Check your connection" });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-9999 bg-black/95 grid place-items-center p-4">
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white truncate">{ad.title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {ad.videoUrl ? (
          <video
            ref={videoRef}
            src={ad.videoUrl}
            autoPlay
            playsInline
            controls
            onPlay={() => {
              playing.current = true;
            }}
            onPause={() => {
              playing.current = false;
            }}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            className="w-full rounded-xl bg-black max-h-[60vh]"
          />
        ) : ad.imageUrl ? (
          // No video on the creative — fall back to the image and let the server's
          // elapsed-time check be the whole gate.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.imageUrl} alt="" className="w-full rounded-xl" />
        ) : null}

        {ad.headline && <p className="text-sm text-gray-300">{ad.headline}</p>}

        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {ad.targetUrl && (
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block text-center text-xs font-semibold text-blue-400 hover:text-blue-300"
          >
            {ad.ctaLabel}
          </a>
        )}

        <button
          onClick={claim}
          disabled={!done || claiming}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {claiming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : done ? (
            `Claim +${pts(ad.rewardPoints)} pts`
          ) : (
            `Keep watching · ${Math.max(0, Math.ceil(ad.watchSeconds - watched))}s`
          )}
        </button>
      </div>
    </div>
  );
}
