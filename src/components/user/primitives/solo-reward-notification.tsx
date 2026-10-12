"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SoloRewardNotificationProps {
  href?: string;
  storageKey?: string;
}

export function SoloRewardNotification({
  href = "/profile?solo=1",
  storageKey = "solo_reward_dismissed_at",
}: SoloRewardNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const dismissed = Number(localStorage.getItem(storageKey) ?? 0);
        if (Date.now() - dismissed < 6 * 60 * 60 * 1000) return;
        const res = await fetch("/api/solo-reward/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.status === "ELIGIBLE") setVisible(true);
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, String(Date.now()));
    setVisible(false);
  };

  return (
    <div
      className={cn(
        // Above the tab bar's measured height (gesture inset included), not a
        // flat 5rem that the raised Home button and the inset overlapped.
        "fixed bottom-[max(calc(1rem+var(--bottom-nav-h,0px)),calc(1rem+env(safe-area-inset-bottom)))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-100",
        "animate-in slide-in-from-bottom-4 fade-in"
      )}
    >
      <div className="rounded-2xl border border-amber-400/40 bg-linear-to-r from-amber-500 to-yellow-600 p-3 shadow-2xl flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Solo Reward Ready!</p>
          <p className="text-xs text-white/90">Tap to claim your daily bonus.</p>
        </div>
        <Link
          href={href}
          onClick={() => setVisible(false)}
          className="px-3 py-1.5 rounded-lg bg-white text-amber-700 text-xs font-bold hover:bg-white/90"
        >
          Claim
        </Link>
        <button
          onClick={dismiss}
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
