"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Coins,
  Sparkles,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { detectAdblock } from "@/lib/adblock";
import { RewardedVideoSection } from "@/components/user/ads/rewarded-video-section";

interface BrowseConfig {
  enabled: boolean;
  pointsPerTick: number;
  tickSeconds: number;
  dailyCap: number;
  todayEarned: number;
  remaining: number;
  nextInSec: number;
}

// Count a second toward the reward only when the tab is visible AND the user has
// interacted within this window — stops fully-idle/background farming while still
// letting someone read the page without constant motion.
const IDLE_MS = 120_000;

export function WatchAdsView() {
  const [cfg, setCfg] = useState<BrowseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);

  const [progress, setProgress] = useState(0); // seconds into current interval
  const [todayEarned, setTodayEarned] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [pop, setPop] = useState<number | null>(null); // "+N" flash

  const claimingRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const cfgRef = useRef<BrowseConfig | null>(null);
  const remainingRef = useRef(0);
  cfgRef.current = cfg;
  remainingRef.current = remaining;

  // Initial config + adblock probe.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, isBlocked] = await Promise.all([
          fetch("/api/browse-earn").then((r) => r.json()),
          detectAdblock(),
        ]);
        if (!alive) return;
        setCfg(res);
        setTodayEarned(res.todayEarned ?? 0);
        setRemaining(res.remaining ?? 0);
        setProgress(0);
        setBlocked(isBlocked);
      } catch {
        /* leave cfg null → error card */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Track user activity (idle guard).
  useEffect(() => {
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  const claim = useCallback(async () => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    try {
      const res = await fetch("/api/browse-earn/claim", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setTodayEarned(d.todayEarned ?? 0);
        setRemaining(d.remaining ?? 0);
        setPop(d.rewarded ?? cfgRef.current?.pointsPerTick ?? 1);
        setTimeout(() => setPop(null), 1200);
      } else if (res.status === 429 && typeof d.remaining === "number") {
        // Cap hit server-side.
        setRemaining(0);
      }
    } catch {
      /* transient — the next interval retries */
    } finally {
      setProgress(0);
      claimingRef.current = false;
    }
  }, []);

  // The 1-second reward ticker.
  useEffect(() => {
    if (!cfg?.enabled) return;
    const id = setInterval(() => {
      const c = cfgRef.current;
      if (!c) return;
      if (blocked) return;
      if (remainingRef.current <= 0) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current > IDLE_MS) return;
      if (claimingRef.current) return;

      setProgress((p) => {
        const next = p + 1;
        if (next >= c.tickSeconds) {
          void claim();
          return c.tickSeconds; // hold full until claim resets it
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cfg?.enabled, blocked, claim]);

  const recheck = async () => {
    setChecking(true);
    try {
      const isBlocked = await detectAdblock();
      setBlocked(isBlocked);
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!cfg || !cfg.enabled) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center">
        <div className="glass rounded-2xl p-6">
          <Sparkles className="w-8 h-8 mx-auto text-gray-600" />
          <h1 className="text-lg font-bold text-white mt-3">Browse &amp; Earn</h1>
          <p className="text-sm text-gray-400 mt-1">
            This is currently unavailable. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  const capReached = remaining <= 0;
  const pct = Math.min(100, Math.round((progress / cfg.tickSeconds) * 100));
  const capPct =
    cfg.dailyCap > 0
      ? Math.min(100, Math.round((todayEarned / cfg.dailyCap) * 100))
      : 0;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Coins className="w-5 h-5 text-amber-400" />
          Browse &amp; Earn
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Keep this page open and earn <b className="text-amber-400">+{cfg.pointsPerTick} pts</b>{" "}
          every {cfg.tickSeconds}s while the ads are showing — up to {cfg.dailyCap} pts a day.
        </p>
      </div>

      {/* Top ad slot (network CPM impression) */}
      <AdRenderer placement="EARN_BROWSE" />

      {/* Reward card */}
      <div className="glass rounded-2xl p-5">
        {blocked ? (
          <div className="text-center py-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 ring-1 ring-red-500/20 grid place-items-center">
              <ShieldAlert className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm font-bold text-white mt-3">Ad blocker detected</p>
            <p className="text-xs text-gray-400 mt-1">
              Rewards need the ads to load. Turn off your ad blocker for this site,
              then re-check.
            </p>
            <button
              onClick={recheck}
              disabled={checking}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
            >
              {checking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Re-check
            </button>
          </div>
        ) : capReached ? (
          <div className="text-center py-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 grid place-items-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-white mt-3">
              You&apos;ve earned today&apos;s maximum 🎉
            </p>
            <p className="text-xs text-gray-400 mt-1">
              You collected {todayEarned} / {cfg.dailyCap} pts. Come back tomorrow
              for more.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300 inline-flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-400" />
                Earning while you view…
              </span>
              <span className="relative text-sm font-bold text-white tabular-nums">
                +{cfg.pointsPerTick} pts in {Math.max(0, cfg.tickSeconds - progress)}s
                {pop != null && (
                  <span className="absolute -top-5 right-0 text-emerald-400 font-bold animate-bounce">
                    +{pop}
                  </span>
                )}
              </span>
            </div>
            {/* Interval progress */}
            <div className="mt-2 h-2.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-indigo-500 to-violet-500 transition-[width] duration-500 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}

        {/* Daily total */}
        <div className="mt-5 pt-4 border-t border-gray-800/60">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Today</span>
            <span className="text-white font-bold tabular-nums">
              {todayEarned} / {cfg.dailyCap} pts
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-amber-500 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${capPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Watch-to-earn video. Renders nothing at all unless an admin has turned
          rewarded ads on — the default is off, because a rewarded ad pays points
          OUT and house inventory earns nothing back. */}
      <RewardedVideoSection />

      {/* Second ad slot — more of the page is ad-supported = more impressions */}
      <AdRenderer placement="EARN_BROWSE" />

      <p className="text-[11px] text-gray-500 text-center">
        Points are credited automatically while this tab stays open and active.
        Switching away or closing the page pauses earning.
      </p>
    </div>
  );
}
