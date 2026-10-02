"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A client-side tab that lives in the URL (`?tab=`), so a reload, a shared
 * link or Back→Forward lands on the same tab instead of the first one.
 *
 * Switching tabs REPLACES the history entry rather than pushing one: clicking
 * through six tabs must not take six presses of Back to leave the page. It uses
 * `history.replaceState`, which Next keeps in sync with `useSearchParams`, so
 * the switch is instant — no server round trip, and no unsaved form state lost
 * to a re-render.
 *
 * The server-rendered `AdminTabs` strip (links) does the same job for pages
 * whose tabs are server components; this is its client-state counterpart.
 *
 *   const [tab, setTab] = useUrlTab("overview", TAB_IDS);
 *
 * `param` names the query parameter — use a different one for a second tab
 * strip nested inside a page that already owns `?tab=`. The default tab is
 * written as no parameter at all, matching `AdminTabs`.
 */
export function useUrlTab<T extends string>(
  defaultTab: T,
  allowed: readonly T[],
  opts: {
    param?: string;
    /** Old ids that should still land somewhere: { financial: "money" }. */
    aliases?: Partial<Record<string, T>>;
  } = {}
): readonly [T, (next: T, extra?: Record<string, string | null>) => void] {
  const param = opts.param ?? "tab";
  const search = useSearchParams();
  const pathname = usePathname();

  const raw = search?.get(param) ?? null;
  const resolved = raw ? (opts.aliases?.[raw] ?? raw) : null;
  const tab =
    resolved && (allowed as readonly string[]).includes(resolved)
      ? (resolved as T)
      : defaultTab;

  const setTab = useCallback(
    (next: T, extra?: Record<string, string | null>) => {
      if (typeof window === "undefined") return;
      const p = new URLSearchParams(window.location.search);
      if (next === defaultTab) p.delete(param);
      else p.set(param, next);
      for (const [k, v] of Object.entries(extra ?? {})) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      const url = `${pathname}${qs ? `?${qs}` : ""}`;
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, "", url);
      }
    },
    [defaultTab, param, pathname]
  );

  return [tab, setTab] as const;
}
