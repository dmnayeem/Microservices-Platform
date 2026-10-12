"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

/**
 * The red counts on Daily Mission, Missions and Events (see src/lib/nav-counts.ts).
 *
 * One store for the whole shell, so the sidebar and the phone's bottom bar
 * share one request instead of each polling. Refreshed every minute while the
 * tab is visible, and on every page change — finish a task, move on, and the
 * count has already gone down.
 */
export interface NavCounts {
  dailyMission: number;
  missions: number;
  events: number;
  lottery: number;
  /** More counts by page (tasks left per type, rewards to claim, …). */
  byHref: Record<string, number>;
}

const ZERO: NavCounts = { dailyMission: 0, missions: 0, events: 0, lottery: 0, byHref: {} };

/** Every count by the page it belongs to — one map for the menu, bottom bar and Quick Earn. */
export function navCountMap(c: NavCounts): Record<string, number> {
  return {
    ...c.byHref,
    "/daily-mission": c.dailyMission,
    "/missions": c.missions,
    "/events": c.events,
    "/lottery": c.lottery,
  };
}
let inflight: Promise<void> | null = null;
let lastAt = 0;

const useStore = create<{ counts: NavCounts; set: (c: NavCounts) => void }>((set) => ({
  counts: ZERO,
  set: (counts) => set({ counts }),
}));

function load(force = false, minGapMs = 5_000): Promise<void> {
  // Two consumers mounting together, or a quick back-and-forth between pages,
  // collapse into one request.
  if (inflight) return inflight;
  if (!force && Date.now() - lastAt < minGapMs) return Promise.resolve();
  inflight = fetch("/api/nav-counts", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Partial<NavCounts> | null) => {
      if (!d) return;
      useStore.getState().set({
        dailyMission: Number(d.dailyMission) || 0,
        missions: Number(d.missions) || 0,
        events: Number(d.events) || 0,
        lottery: Number(d.lottery) || 0,
        byHref:
          d.byHref && typeof d.byHref === "object"
            ? Object.fromEntries(
                Object.entries(d.byHref as Record<string, unknown>).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
              )
            : {},
      });
    })
    .catch(() => {})
    .finally(() => {
      lastAt = Date.now();
      inflight = null;
    });
  return inflight;
}

export function useNavCounts(): NavCounts {
  const pathname = usePathname();
  useEffect(() => {
    void load();
  }, [pathname]);
  // Not forced: every consumer (header, sidebar, tab bar, feed rail) runs its
  // own 60s timer, started at different mount times, and a forced load from
  // each was one /api/nav-counts (~15 queries) per consumer per minute. Any
  // load in the last 30s already answers the poll.
  useAutoRefresh(() => void load(false, 30_000), { intervalMs: 60_000 });
  return useStore((s) => s.counts);
}

/**
 * The number itself up to 99. Not the bell's "9+": a daily mission starts at
 * ~20 completions, and the point of this badge is to watch it go 21 → 20 → 19
 * as tasks are done — capped at 9+ it would sit still until the last nine.
 */
export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * Re-read the counts now — called right after a claim, so the badge drops on
 * the page the user is already on instead of at the next minute's poll.
 */
export function refreshNavCounts(): void {
  void load(true);
}
