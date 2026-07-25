"use client";

import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  /** Poll interval in ms while the tab is visible. Default 30000. */
  intervalMs?: number;
  /** When false, no listeners/timers are attached. Default true. */
  enabled?: boolean;
}

/**
 * Re-runs `callback` to keep a surface's data fresh:
 *  - on window `focus`
 *  - on `visibilitychange` → visible (fires once immediately)
 *  - on a `setInterval` (default 30s) that is PAUSED while the tab is hidden
 *
 * The interval never resets when `callback` changes (a ref holds the latest
 * one), so passing an inline arrow function is fine. All listeners/timers are
 * cleaned up on unmount or when `enabled` flips off.
 *
 * Returning to a tab fires BOTH `focus` and `visibilitychange` → visible, which
 * used to run `callback` twice (two API round-trips per refocus). A 1s
 * coalescing guard collapses the pair into a single run.
 *
 * Note: this does NOT call `callback` on mount — callers already fetch on mount
 * (App Router remounts page components on navigation). It only adds the live
 * refetch triggers on top.
 */
export function useAutoRefresh(
  callback: () => void,
  { intervalMs = 30000, enabled = true }: AutoRefreshOptions = {}
): void {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // Coalesce focus + visibilitychange (both fire on tab-return) into one run.
    let lastRun = 0;
    const run = (coalesce = false) => {
      const now = Date.now();
      if (coalesce && now - lastRun < 1000) return;
      lastRun = now;
      cbRef.current();
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      if (timer === null) timer = setInterval(() => run(), intervalMs);
    };
    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onFocus = () => run(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run(true);
        startTimer();
      } else {
        stopTimer();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Only poll when the tab is currently visible.
    if (document.visibilityState === "visible") startTimer();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      stopTimer();
    };
  }, [intervalMs, enabled]);
}
