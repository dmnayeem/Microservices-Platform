"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isStandaloneApp } from "@/lib/standalone";
import { lsGet, lsSet, ssGet, ssSet } from "@/lib/safe-storage";

/**
 * Installed app: a fresh launch opens Home, like a native app.
 *
 * After the app is closed (swiped away), Android and iOS often reopen the
 * installed web app on the LAST page it showed instead of `start_url`, so a
 * user who closed everything came back to a half-finished task or a settings
 * screen. The OS does this, not our code, so the only place to correct it is
 * here.
 *
 * Rule — on a fresh load in the installed app, go to /dashboard when ALL of:
 *   - it is a new app session (sessionStorage is empty — cleared when the app
 *     is closed), or the app sat in the background for more than 30 minutes;
 *   - it is not a reload (pull-to-refresh keeps you where you are);
 *   - the page is exactly the one the user was last on — the signature of the
 *     OS restoring it. A push notification or link that opens a DIFFERENT
 *     page is a real destination and is left alone.
 *
 * A quick app switch (page still alive) never reloads, so it never triggers.
 */

const LAST_PATH = "rt_pwa_last_path";
const HIDDEN_AT = "rt_pwa_hidden_at";
const SESSION = "rt_pwa_session";
const HOME = "/dashboard";
const STALE_MS = 30 * 60 * 1000;

function navigationType(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? "navigate";
  } catch {
    return "navigate";
  }
}

export function PwaLaunchHome() {
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(false);

  // Once per page load: decide whether this was a cold launch onto a
  // restored page. Runs BEFORE the effect below records the current page.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (!isStandaloneApp()) return;

    const here = window.location.pathname + window.location.search;
    const last = lsGet(LAST_PATH);
    const freshSession = !ssGet(SESSION);
    ssSet(SESSION, "1");
    const hiddenAt = Number(lsGet(HIDDEN_AT) || 0);
    const longAway = hiddenAt > 0 && Date.now() - hiddenAt > STALE_MS;

    if (
      (freshSession || longAway) &&
      navigationType() !== "reload" &&
      window.location.pathname !== HOME &&
      last === here
    ) {
      router.replace(HOME);
    }
  }, [router]);

  // Remember the current page, and when the app went to the background.
  useEffect(() => {
    if (!isStandaloneApp()) return;
    lsSet(LAST_PATH, window.location.pathname + window.location.search);
  }, [pathname]);

  useEffect(() => {
    if (!isStandaloneApp()) return;
    const markHidden = () => lsSet(HIDDEN_AT, String(Date.now()));
    const onHide = () => {
      if (document.visibilityState === "hidden") markHidden();
    };
    // Back from the background after a long time while the page stayed alive
    // (bfcache): same rule as a cold launch.
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const hiddenAt = Number(lsGet(HIDDEN_AT) || 0);
      if (hiddenAt > 0 && Date.now() - hiddenAt > STALE_MS && window.location.pathname !== HOME) {
        router.replace(HOME);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", markHidden);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", markHidden);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  return null;
}
