"use client";

import { useEffect } from "react";

/**
 * Shared behaviour for every `error.tsx` / `global-error.tsx` boundary.
 *
 * 1. Report the error to Sentry — only when a public DSN is set (the import is
 *    dead code otherwise, so Sentry never ships to the browser for nothing).
 * 2. A stale-deploy error (the browser still holds the previous build's
 *    manifest, so a chunk or Server Action id no longer exists) cannot be fixed
 *    by `retry()` — only a full reload fetches the new build. Reload ONCE,
 *    guarded by a sessionStorage flag so a genuinely broken chunk can't loop.
 */

const RELOAD_FLAG = "rt:chunk-reload";
// Up to this many automatic reloads inside the window, then the buttons.
// One was not enough on mobile data: a chunk that dies in transit (a carrier
// breaking HTTP/3, a dropped radio link) often fails on the first reload too,
// while the browser is still switching to a working connection.
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 120_000;

export function isStaleDeployError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (e?.name === "ChunkLoadError") return true;
  const msg = e?.message ?? "";
  return /Loading chunk|Loading CSS chunk|Failed to load chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Failed to find Server Action/i.test(
    msg
  );
}

/** True if a reload was started (the caller can show a "Reloading…" state). */
function reloadOnceForStaleDeploy(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_FLAG);
    const prev = raw ? (JSON.parse(raw) as { n: number; at: number }) : null;
    const fresh = !prev || Date.now() - prev.at > RELOAD_WINDOW_MS;
    const n = fresh ? 0 : prev!.n;
    if (n >= MAX_RELOADS) return false;
    window.sessionStorage.setItem(
      RELOAD_FLAG,
      JSON.stringify({ n: n + 1, at: fresh ? Date.now() : prev!.at })
    );
  } catch {
    // Storage blocked (private mode / disabled) → no loop guard possible, so
    // don't auto-reload; the user still has the Reload button.
    return false;
  }
  // A short pause after the first try gives the connection time to recover.
  window.setTimeout(() => window.location.reload(), 600);
  return true;
}

function reportToSentry(error: Error) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {});
}

/** Call from a boundary: logs, reports, and auto-reloads on a stale deploy. */
export function useErrorRecovery(error: Error & { digest?: string }) {
  useEffect(() => {
    console.error(error);
    if (isStaleDeployError(error) && reloadOnceForStaleDeploy()) return;
    reportToSentry(error);
  }, [error]);
}

/** Hard reload — the escape hatch when `retry()` can't recover. */
export function hardReload() {
  window.location.reload();
}
