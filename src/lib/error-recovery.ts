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

const RELOAD_FLAG = "rt:chunk-reload-at";
// A second stale-deploy error within this window means the reload didn't help.
const RELOAD_WINDOW_MS = 60_000;

export function isStaleDeployError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (e?.name === "ChunkLoadError") return true;
  const msg = e?.message ?? "";
  return /Loading chunk|Loading CSS chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Failed to find Server Action/i.test(
    msg
  );
}

/** True if a reload was started (the caller can show a "Reloading…" state). */
function reloadOnceForStaleDeploy(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (last && Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // Storage blocked (private mode / disabled) → no loop guard possible, so
    // don't auto-reload; the user still has the Reload button.
    return false;
  }
  window.location.reload();
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
