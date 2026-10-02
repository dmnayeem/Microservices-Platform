"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import type { PwaRewardStatus } from "@/lib/pwa-shared";

/**
 * "Install the app and get X points" — shown only while the install reward is
 * switched on and this user has not been paid it. After the install it turns
 * into progress ("opened on 1 of 2 days"), and disappears once paid. The
 * server decides all of it (passed in by the dashboard, from the user row it
 * already reads — no request of its own); this only renders.
 */
export function PwaRewardCard({ status: s }: { status: PwaRewardStatus | null }) {
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const take = () => setCanPrompt(!!window.__egBip);
    take();
    window.addEventListener("eg-bip", take);
    return () => {
      window.removeEventListener("eg-bip", take);
    };
  }, []);

  if (!s || !s.offered || s.rewarded) return null;

  const pts = s.points.toLocaleString();
  const started = s.installed || s.days > 0;
  const shown = Math.min(s.days, s.minDays);

  const install = async () => {
    const bip = window.__egBip;
    if (!bip) return;
    try {
      await bip.prompt();
      await bip.userChoice;
    } catch {
      /* ignore */
    }
    window.__egBip = null;
    setCanPrompt(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
        <Smartphone className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        {started ? (
          <>
            <p className="text-sm font-bold text-white">App installed — {pts} points almost yours</p>
            <p className="mt-0.5 text-xs text-(--app-ink-2)">
              Open the app from your home screen on {s.minDays} different days to unlock it. {shown} of {s.minDays}{" "}
              day{s.minDays === 1 ? "" : "s"} so far.
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.round((shown / Math.max(1, s.minDays)) * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-white">Install the app and get {pts} points</p>
            <p className="mt-0.5 text-xs text-(--app-ink-2)">
              Add RevType to your home screen, then open it from there on {s.minDays} different day
              {s.minDays === 1 ? "" : "s"}.
              {!canPrompt && " Use your browser menu → Install app / Add to Home Screen."}
            </p>
          </>
        )}
      </div>
      {!started && canPrompt && (
        <button
          onClick={install}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Install
        </button>
      )}
    </div>
  );
}
