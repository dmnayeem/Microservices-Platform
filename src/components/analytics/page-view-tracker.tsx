"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Fire-and-forget beacon; survives navigation/unload via keepalive.
function beacon(path: string, view: boolean, dwellMs: number) {
  try {
    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ path, view, dwellMs }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * First-party page-view tracker. Mounted once at the root; on every route change
 * it beacons a "view" for the new page and flushes the FOREGROUND time spent on
 * the previous page (paused while the tab is hidden). Sends only the path +
 * timing — the server resolves the visitor and rolls up daily stats. Renders null.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const activeMs = useRef(0);
  const lastResume = useRef<number | null>(null);
  const curPath = useRef<string | null>(null);

  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const accrue = () => {
    if (lastResume.current != null) {
      activeMs.current += nowMs() - lastResume.current;
      lastResume.current = null;
    }
  };

  // Send the foreground time accumulated on the current page, then reset.
  const flush = () => {
    accrue();
    const ms = Math.round(activeMs.current);
    activeMs.current = 0;
    if (curPath.current && ms >= 1000) beacon(curPath.current, false, ms);
  };

  // Foreground timing + leave flush (mount once). flush()/accrue() only touch
  // refs, so the captured closure stays correct across renders.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else if (lastResume.current == null) lastResume.current = nowMs();
    };
    const onHide = () => flush();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On route change: flush the previous page's dwell, then start the new page.
  useEffect(() => {
    if (!pathname) return;
    flush(); // previous page (no-op on first mount)
    curPath.current = pathname;
    activeMs.current = 0;
    lastResume.current =
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? nowMs()
        : null;
    beacon(pathname, true, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
