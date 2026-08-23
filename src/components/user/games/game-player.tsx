"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Coins, ExternalLink, AlertTriangle } from "lucide-react";
import { AdInterstitialOverlay } from "@/components/user/primitives/ad-interstitial-overlay";
import type { AdPlacementName } from "@/lib/ad-placements";

export interface PlayableGame {
  id: string;
  title: string;
  embedUrl: string;
}

/**
 * Full-screen game shell.
 *
 * Everything that decides money is server-side: the session, the play clock and
 * the ad count. This component only reports *that* a beat happened and whether
 * the iframe has loaded — it never sends a duration, because there would be
 * nothing stopping it sending a large one.
 */

/** How long to wait for the iframe's load event before calling it broken. */
const LOAD_WATCHDOG_MS = 8_000;

interface SessionInfo {
  sessionId: string;
  reward: {
    enabled: boolean;
    pointsPerTick: number;
    tickSeconds: number;
    remainingToday: number;
    maxPerSession: number;
    requiresAd: boolean;
  };
  ads: {
    enabled: boolean;
    onOpen: boolean;
    onResume: boolean;
    onQuit: boolean;
    intervalSeconds: number;
    throttleSeconds: number;
  };
  beatSeconds: number;
}

export function GamePlayer({
  game,
  onClose,
  adPlacement = "GAME_INTERSTITIAL",
}: {
  game: PlayableGame;
  onClose: () => void;
  adPlacement?: AdPlacementName;
}) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [started, setStarted] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [earned, setEarned] = useState(0);
  const [flash, setFlash] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const afterAdRef = useRef<() => void>(() => {});
  const lastAdRef = useRef(0);
  const wasHiddenRef = useRef(false);
  const loadedRef = useRef(false);
  const sessionRef = useRef<SessionInfo | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ── Open the session ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/games/${game.id}/session`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SessionInfo | null) => {
        if (cancelled || !d) {
          // No session means no earning, but the game must still be playable.
          if (!cancelled) setStarted(true);
          return;
        }
        setSession(d);
        if (d.ads.enabled && d.ads.onOpen) {
          afterAdRef.current = () => setStarted(true);
          setShowAd(true);
        } else {
          setStarted(true);
        }
      })
      .catch(() => !cancelled && setStarted(true));
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  // Lock body scroll while the player is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── End the session on unmount / tab close ───────────────────────────────
  const endSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || endedRef.current) return;
    endedRef.current = true;
    const body = JSON.stringify({ sessionId: s.sessionId });
    // `sendBeacon` survives the page going away; fetch would be cancelled.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `/api/games/${game.id}/session/end`,
        new Blob([body], { type: "application/json" })
      );
    } else {
      fetch(`/api/games/${game.id}/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, [game.id]);

  useEffect(() => {
    const onHide = () => endSession();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      endSession();
    };
  }, [endSession]);

  // ── Heartbeat ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !started) return;
    const beat = async () => {
      // Only beat while the tab is actually in front. A background tab is not
      // playing, and the server clamps anyway — this just avoids the round trip.
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/games/${game.id}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            loaded: loadedRef.current,
          }),
        });
        if (r.status === 409) {
          // Another tab took the slot, or the sweep closed this session.
          setNotice("This game was opened in another tab — earning paused here.");
          return;
        }
        const d = await r.json();
        if (typeof d.sessionPoints === "number") setEarned(d.sessionPoints);
        if (d.awarded > 0) {
          setFlash(d.awarded);
          setTimeout(() => setFlash(0), 2000);
        }
        if (d.capped) setNotice("You've hit today's game reward limit.");
        else if (d.awaitingAd) setNotice("Watch an ad to keep earning.");
        else setNotice(null);
      } catch {
        // A dropped beat costs at most one interval; the next one recovers.
      }
    };
    const id = setInterval(beat, session.beatSeconds * 1000);
    return () => clearInterval(id);
  }, [session, started, game.id]);

  // ── Load watchdog ────────────────────────────────────────────────────────
  // Cross-origin JS cannot see `X-Frame-Options: DENY` — no error fires, the
  // frame is simply blank. Without this the user stares at black forever.
  useEffect(() => {
    if (!started || loaded) return;
    const t = setTimeout(() => setLoadFailed(true), LOAD_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [started, loaded]);

  const handleAdDone = () => {
    setShowAd(false);
    lastAdRef.current = Date.now();
    const fn = afterAdRef.current;
    afterAdRef.current = () => {};
    fn();
  };

  const throttleMs = (session?.ads.throttleSeconds ?? 60) * 1000;
  const adsOn = session?.ads.enabled !== false;

  // Ad on tab return.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        wasHiddenRef.current = true;
        return;
      }
      if (wasHiddenRef.current && started && !showAd) {
        wasHiddenRef.current = false;
        if (
          adsOn &&
          session?.ads.onResume &&
          Date.now() - lastAdRef.current > throttleMs
        ) {
          afterAdRef.current = () => {};
          setShowAd(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [started, showAd, adsOn, session?.ads.onResume, throttleMs]);

  // Mid-session interstitial.
  useEffect(() => {
    const every = session?.ads.intervalSeconds ?? 0;
    if (!started || !adsOn || every <= 0) return;
    const id = setInterval(() => {
      if (document.hidden) return; // never interrupt a tab nobody is looking at
      if (Date.now() - lastAdRef.current < throttleMs) return;
      afterAdRef.current = () => {};
      setShowAd(true);
    }, every * 1000);
    return () => clearInterval(id);
  }, [started, adsOn, session?.ads.intervalSeconds, throttleMs]);

  const quit = () => {
    endSession();
    if (adsOn && session?.ads.onQuit) {
      afterAdRef.current = onClose;
      setShowAd(true);
    } else {
      onClose();
    }
  };

  const reward = session?.reward;

  return (
    <div className="fixed inset-0 z-10000 bg-black flex flex-col">
      <div className="flex items-center gap-3 px-3 h-12 bg-gray-950 border-b border-gray-800 shrink-0">
        <p className="text-sm font-bold text-white truncate flex-1">{game.title}</p>

        {reward?.enabled && (
          <span className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold tabular-nums">
            <Coins className="w-3.5 h-3.5" />
            {earned}
            {flash > 0 && (
              <span className="absolute -top-5 right-0 text-emerald-400 text-xs font-bold animate-pulse">
                +{flash}
              </span>
            )}
          </span>
        )}

        <button
          onClick={quit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
        >
          <X className="w-4 h-4" /> Quit
        </button>
      </div>

      {notice && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/25 text-[11px] text-amber-300 shrink-0">
          {notice}
        </div>
      )}

      <div className="flex-1 relative bg-black">
        {started ? (
          <>
            <iframe
              src={game.embedUrl}
              title={game.title}
              onLoad={() => {
                setLoaded(true);
                setLoadFailed(false);
              }}
              className="absolute inset-0 w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-orientation-lock"
              allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope; clipboard-write"
              allowFullScreen
            />
            {!loaded && !loadFailed && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-7 h-7 animate-spin text-gray-600" />
              </div>
            )}
            {loadFailed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <p className="text-sm text-white font-semibold">
                  This game didn&apos;t load
                </p>
                <p className="text-xs text-gray-400 max-w-sm">
                  It may block being shown inside another site. You can open it in
                  a new tab instead — you won&apos;t earn points there.
                </p>
                <a
                  href={game.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in a new tab
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-gray-600" />
          </div>
        )}
      </div>

      {/* Served by OUR route, so the server records that this session saw an ad
          — `rewardRequiresAd` cannot be satisfied by a client claim. */}
      <AdInterstitialOverlay
        open={showAd}
        onDone={handleAdDone}
        placement={adPlacement}
        source={
          session
            ? {
                url: `/api/games/${game.id}/ad`,
                body: { sessionId: session.sessionId },
              }
            : undefined
        }
      />
    </div>
  );
}
