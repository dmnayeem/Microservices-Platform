"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCog, X } from "lucide-react";

const DISMISS_KEY = "profile_gate_banner_dismissed";

/**
 * Gentle nudge shown on the dashboard/home when the admin requires profile
 * completion and the user hasn't finished the core essentials. Dismissible for
 * the session (reappears next visit until the profile is complete).
 */
export function ProfileCompletionBanner({
  done,
  total,
  percentage,
}: {
  done: number;
  total: number;
  percentage: number;
}) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  if (hidden) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <UserCog className="w-4.5 h-4.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Complete your profile to unlock Tasks &amp; Missions
          </p>
          <p className="text-xs text-amber-200/80 mt-0.5">
            {done}/{total} essentials done · {percentage}%
          </p>
          <div className="h-1.5 rounded-full bg-amber-950/40 overflow-hidden mt-2">
            <div
              className="h-full bg-amber-400 rounded-full transition-[width]"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <Link
            href="/profile?tab=personal"
            className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-(--app-on-bright) text-xs font-bold active:scale-[0.97] transition-transform"
          >
            <UserCog className="w-3.5 h-3.5" />
            Finish profile
          </Link>
        </div>
        <button
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
          aria-label="Dismiss"
          className="p-1 rounded-lg text-amber-300/70 hover:text-(--app-ink) shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
