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
 * Home is the feed (/social) — the manifest's start_url, which carries
 * `?source=pwa` so a launch from the icon is recognisable (the marker is
 * stripped). Rules, on a fresh load in the installed app (never on a reload —
 * pull-to-refresh keeps you where you are):
 *   - launched from the icon (`source=pwa`) → Home;
 *   - a new app session (sessionStorage empty — cleared when the app is
 *     closed) or 5+ minutes in the background, landing on:
 *       · exactly the page the user was last on — the signature of the OS
 *         restoring it, or
 *       · /dashboard — the start_url of installs made before Home moved to
 *         the feed (iOS keeps the start_url it was installed with)
 *     → Home.
 * A push notification or link that opens a DIFFERENT page is a real
 * destination and is left alone.
 *
 * A quick app switch (page still alive) never reloads, so it never triggers.
 */

const LAST_PATH = "rt_pwa_last_path";
const HIDDEN_AT = "rt_pwa_hidden_at";
const SESSION = "rt_pwa_session";
const HOME = "/social";
const LEGACY_START = "/dashboard";
const STALE_MS = 5 * 60 * 1000;

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

    const params = new URLSearchParams(window.location.search);
    const fromIcon = params.get("source") === "pwa";
    if (fromIcon) params.delete("source");
    const path = window.location.pathname;
    const here = path + (params.toString() ? `?${params}` : "");
    const last = lsGet(LAST_PATH);
    const freshSession = !ssGet(SESSION);
    ssSet(SESSION, "1");
    const hiddenAt = Number(lsGet(HIDDEN_AT) || 0);
    const longAway = hiddenAt > 0 && Date.now() - hiddenAt > STALE_MS;

    if (navigationType() === "reload") return;
    if (fromIcon) {
      // Strip the marker (and land on Home if a restore swapped the path).
      router.replace(path === HOME ? here : HOME);
      return;
    }
    if ((freshSession || longAway) && path !== HOME && (last === here || path === LEGACY_START)) {
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
