"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Flame, Gift, Check, Loader2, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";
import { notifyCenter } from "@/lib/notify-center";
import {
  QUICK_EARN_ICONS,
  COLOR_CLASSES,
  type QuickEarnTile,
} from "@/lib/feed-quick-earn";

interface Widgets {
  balance: { points: number; todayEarnings: number };
  streak: { current: number; canClaim: boolean };
}

/**
 * Mobile/tablet-only earn strip shown below the feed banner slider: a Daily
 * Bonus claim card on top, then the Quick Earn tiles (3-up mobile, 4-up tablet).
 * Self-fetches its widget data — it renders on a different breakpoint than the
 * desktop right rail (`lg:hidden`), so they never both mount on the same screen.
 */
export function MobileEarnBlock({
  quickEarn,
  className,
}: {
  quickEarn?: QuickEarnTile[];
  className?: string;
}) {
  const [data, setData] = useState<Widgets | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feed/rail-widgets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.balance) return;
        setData({ balance: d.balance, streak: d.streak });
        setClaimed(!d.streak?.canClaim);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/daily-reward", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't claim");
      setClaimed(true);
      setData((prev) =>
        prev
          ? {
              ...prev,
              balance: {
                ...prev.balance,
                points: prev.balance.points + (d.reward?.points ?? 0),
              },
              streak: { ...prev.streak, current: d.newStreak ?? prev.streak.current },
            }
          : prev
      );
      notifyCenter.reward({
        amount: d.reward?.points ?? 0,
        unit: "pts",
        title: "Daily reward claimed!",
        description: `Day ${d.reward?.day ?? ""} streak 🔥`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setClaiming(false);
    }
  };

  const tiles = (quickEarn ?? []).filter((t) => t.enabled);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Daily Bonus claim */}
      {data && (
        <section className="glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-eyebrow">Your balance</p>
              <p className="text-2xl font-extrabold text-white tabular-nums mt-0.5 inline-flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                <Coins className="w-5 h-5 text-amber-400 shrink-0" />
                {pts(data.balance.points)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-eyebrow">Today</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                +{data.balance.todayEarnings.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-300">
              <Flame className="w-4 h-4" />
              {data.streak.current}-day streak
            </span>
            {claimed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <Check className="w-3.5 h-3.5" /> Claimed
              </span>
            ) : (
              <button
                onClick={claim}
                disabled={claiming}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {claiming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Gift className="w-3.5 h-3.5" />
                )}
                Claim
              </button>
            )}
          </div>
        </section>
      )}

      {/* Quick Earn — 3-up mobile, 4-up tablet */}
      {tiles.length > 0 && (
        <section className="glass p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Quick Earn</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {tiles.map((q) => {
              const Icon = QUICK_EARN_ICONS[q.icon] ?? Zap;
              return (
                <Link
                  key={q.id}
                  href={q.href}
                  className="glass-hover flex flex-col items-center gap-1 rounded-xl bg-gray-950/40 border border-gray-800 px-2 py-3 text-center font-semibold text-gray-200"
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0",
                      COLOR_CLASSES[q.color] ?? "text-indigo-400"
                    )}
                  />
                  <span className="w-full truncate text-xs leading-tight">
                    {q.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
