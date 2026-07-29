"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ShieldAlert, Loader2, RefreshCw, X } from "lucide-react";
import {
  subscribeAdblock,
  getAdblockSnapshot,
  getAdblockServerSnapshot,
  recheckAdblock,
  dismissAdblockOverlay,
  warmAdblock,
} from "@/lib/adblock";

/**
 * Single global host for the ad-blocker gate. Warms detection once on load and
 * renders a blocking full-screen overlay when a task-open guard (`ensureAdsAllowed`)
 * detects a blocker. Closeable + Re-check (fail-safe) — the guard re-shows it on
 * the next task-open if the blocker is still on.
 */
export function AdblockHost() {
  const open = useSyncExternalStore(
    subscribeAdblock,
    getAdblockSnapshot,
    getAdblockServerSnapshot
  );
  const [checking, setChecking] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);

  useEffect(() => {
    warmAdblock();
  }, []);

  if (!open) return null;

  const onRecheck = async () => {
    setChecking(true);
    setStillBlocked(false);
    const clear = await recheckAdblock();
    setChecking(false);
    if (!clear) setStillBlocked(true);
  };

  return (
    <div className="fixed inset-0 z-10001 bg-black/95 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-gray-900 p-6 text-center">
        <button
          onClick={dismissAdblockOverlay}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">Ad blocker detected</h1>
        <p className="text-sm text-gray-400 mt-1.5">
          Please turn off your ad blocker (or anti-adblock extension) to open
          tasks, then re-check to continue.
        </p>
        {stillBlocked && (
          <p className="text-xs text-amber-300 mt-2">
            Still detected — make sure it&apos;s fully disabled for this site,
            then try again.
          </p>
        )}
        <button
          onClick={onRecheck}
          disabled={checking}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {checking ? "Checking…" : "I've turned it off — Re-check"}
        </button>
      </div>
    </div>
  );
}
