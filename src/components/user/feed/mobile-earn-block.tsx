"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Flame, Gift, Check, Loader2, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";
import { notifyCenter } from "@/lib/notify-center";
import { BalanceSkeleton } from "@/components/user/primitives/skeleton";
// `COLOR_CLASSES` is deliberately not imported any more: the admin still picks
// a colour per Quick Earn tile and it is still stored, but the feed renders
// these tiles neutral. See the note on the grid below.
import {
  QUICK_EARN_ICONS,
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
 * desktop right rail (`xl:hidden`), so they never both mount on the same screen.
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
      {/* The money surface on the feed.
          It was a glass panel with an amber coin, an emerald "today" figure and
          an orange streak strip — three hues at roughly one size, so the
          balance did not read as the subject of its own card. It is now the one
          gradient panel on this screen, the figure is `t-figure` (up to 32px,
          weight 800) against an 11px label, and the streak sits on the gradient
          as a translucent strip rather than importing a fourth colour. */}
      {/* The card reserves its own height while the fetch is in flight. It used
          to render nothing, so the whole feed jumped down by ~150px the moment
          the balance arrived — on the screen people open first. */}
      {!data && <BalanceSkeleton />}
      {data && (
        <section className="app-accent app-accent-glow rounded-(--app-r-card) p-(--app-pad)">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="t-eyebrow text-white/90">Your balance</p>
              <p className="t-figure mt-1 inline-flex items-center gap-2 min-w-0 whitespace-nowrap text-white">
                <Coins className="w-6 h-6 shrink-0 text-white/90" />
                {pts(data.balance.points)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="t-eyebrow text-white/90">Today</p>
              <p className="t-figure-sm mt-1 text-white">
                +{data.balance.todayEarnings.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 rounded-(--app-r-control) bg-black/20 border border-white/25 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
              <Flame className="w-4 h-4" />
              {data.streak.current}-day streak
            </span>
            {claimed ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-white/90">
                <Check className="w-3.5 h-3.5" /> Claimed
              </span>
            ) : (
              <button
                onClick={claim}
                disabled={claiming}
                className="app-press app-tap-row inline-flex items-center gap-1.5 px-4 rounded-full app-on-white bg-white text-xs font-extrabold disabled:opacity-60"
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

      {/* Quick Earn — 3-up mobile, 4-up tablet.
          The tile icons used to be coloured from an admin-picked palette, so
          six shortcuts were six hues sitting directly under the balance card
          and competing with it. Neutral now: the heading says what the row is,
          and the card above it is what the eye should reach first. */}
      {tiles.length > 0 && (
        <section className="app-card">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-(--app-ink-3)" />
            <h2 className="t-section text-white">Quick Earn</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 [&>*:last-child:nth-child(3n+1)]:col-span-3 sm:[&>*:last-child:nth-child(3n+1)]:col-span-1">
            {tiles.map((q) => {
              const Icon = QUICK_EARN_ICONS[q.icon] ?? Zap;
              return (
                <Link
                  key={q.id}
                  href={q.href}
                  className={cn(
                    "app-tile app-press app-lift flex flex-col items-center justify-center gap-1.5",
                    "min-h-20 px-2 py-3 text-center font-bold text-(--app-ink)"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0 text-(--app-ink-3)" />
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
