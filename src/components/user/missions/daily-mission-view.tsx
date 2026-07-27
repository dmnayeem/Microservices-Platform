"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Target,
  Loader2,
  CheckCircle2,
  Circle,
  Lock,
  Trophy,
  Coins,
  Zap,
  Sparkles,
  Flame,
  ArrowRight,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { toast } from "sonner";
import { notifyCenter } from "@/lib/notify-center";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { TYPE_TO_ROUTE, TYPE_LABEL } from "@/lib/mission-labels";

interface MissionItem {
  id: string;
  taskType: string;
  description: string | null;
  targetCount: number;
  xpPerComplete: number;
  pointsPerComplete: number;
  duration: number | null;
  requiredLevel: number | null;
  order: number;
  completedToday: number;
  done: boolean;
}

interface MissionResponse {
  mission: {
    id: string;
    name: string;
    description: string | null;
    packageTier: string;
    requiredLevel: number;
    completionXpReward: number;
    completionPointsReward: number;
    linkReferralBonus: boolean;
    autoRefresh: boolean;
  } | null;
  items: MissionItem[];
  progress: { done: number; total: number; allDone: boolean };
  claimedToday: boolean;
  streak: number;
  today: string;
}

export function DailyMissionView() {
  const [data, setData] = useState<MissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  // `silent` skips the loading skeleton so background auto-refreshes don't flash.
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/daily-mission/today", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as MissionResponse;
      setData(d);
    } catch (err) {
      if (!silent) {
        toast.error("Couldn't load mission", {
          description: err instanceof Error ? err.message : "Try again",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Live refresh: tab refocus + 15s timer (paused while tab hidden).
  useAutoRefresh(() => load(true));

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/daily-mission/claim", {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      notifyCenter.reward({
        amount: d.points,
        unit: "pts",
        title: "Daily mission claimed!",
        description: `+${d.xp} XP · Streak: ${d.streak} day${d.streak === 1 ? "" : "s"} 🔥`,
      });
      await load();
    } catch (err) {
      notifyCenter.error(
        "Claim failed",
        err instanceof Error ? err.message : "Try again"
      );
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <ListSkeleton rows={5} />
      </div>
    );
  }

  if (!data?.mission) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-400" />
            Daily Task Mission
          </h1>
        </header>
        <EmptyState
          icon={Target}
          title="No mission today"
          description="Your tier doesn't have an active mission yet. Check back soon — or upgrade to unlock more."
          action={{ label: "View packages", href: "/packages" }}
        />
      </div>
    );
  }

  const { mission, items, progress, claimedToday, streak } = data;
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Target className="w-6 h-6 text-indigo-400" />
          Daily Task Mission
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Complete every task below to claim today&apos;s bonus.
        </p>
      </header>

      {/* Mission header card */}
      <div className="rounded-2xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/10 via-purple-500/5 to-gray-900 p-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl shrink-0">
            🎯
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white truncate">
                {mission.name}
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-indigo-500/15 text-indigo-300">
                {mission.packageTier}
              </span>
            </div>
            {mission.description && (
              <p className="text-xs text-gray-400 mt-1">{mission.description}</p>
            )}
          </div>
        </div>

        {/* Reward + streak */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" />
              Reward
            </p>
            <p className="text-sm font-bold text-white tabular-nums mt-0.5">
              {mission.completionPointsReward} pts
            </p>
          </div>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1">
              <Zap className="w-3 h-3 text-purple-400" />
              XP
            </p>
            <p className="text-sm font-bold text-white tabular-nums mt-0.5">
              +{mission.completionXpReward}
            </p>
          </div>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" />
              Streak
            </p>
            <p className="text-sm font-bold text-white tabular-nums mt-0.5">
              {streak} day{streak === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span className="font-semibold">Progress</span>
            <span className="tabular-nums">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-950 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-indigo-500 to-emerald-500 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {mission.linkReferralBonus && (
          <div className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Complete this mission to unlock today&apos;s referral bonus claim.
            </span>
          </div>
        )}
      </div>

      {/* Item list */}
      <div className="space-y-2">
        {items.map((it, i) => {
          const route = TYPE_TO_ROUTE[it.taskType] ?? "/tasks";
          const prevDone = i === 0 || items[i - 1].done;
          const isLocked =
            !it.done && !prevDone && it.completedToday === 0 && i > 0;
          const itemPct =
            it.targetCount > 0
              ? Math.min(100, (it.completedToday / it.targetCount) * 100)
              : 0;
          return (
            <div
              key={it.id}
              className={cn(
                "rounded-xl border p-3 flex items-start gap-3 transition-colors",
                it.done
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : isLocked
                  ? "bg-gray-950 border-gray-800 opacity-60"
                  : "bg-gray-900 border-gray-800"
              )}
            >
              <div className="shrink-0 mt-0.5">
                {it.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : isLocked ? (
                  <Lock className="w-5 h-5 text-gray-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-gray-800 text-gray-300">
                    {it.taskType}
                  </span>
                  <p className="text-sm font-semibold text-white">
                    {TYPE_LABEL[it.taskType] ?? it.taskType} ×{it.targetCount}
                  </p>
                  <span className="ml-auto text-xs tabular-nums text-gray-400">
                    {it.completedToday} / {it.targetCount}
                  </span>
                </div>
                {it.description && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {it.description}
                  </p>
                )}
                <div className="mt-2 h-1.5 rounded-full bg-gray-950 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-[width]",
                      it.done
                        ? "bg-emerald-500"
                        : "bg-linear-to-r from-indigo-500 to-purple-500"
                    )}
                    style={{ width: `${itemPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold tabular-nums">
                    <Coins className="w-3 h-3" />+{it.pointsPerComplete}/task
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-purple-400 tabular-nums">
                    <Zap className="w-3 h-3" />+{it.xpPerComplete}/task
                  </span>
                  {it.duration && (
                    <span className="text-gray-500">{it.duration} min</span>
                  )}
                </div>
              </div>
              {!it.done && !isLocked && (
                <Link
                  href={route}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold self-center"
                >
                  Start <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Claim button */}
      <button
        onClick={claim}
        disabled={claiming || !progress.allDone || claimedToday}
        className={cn(
          "w-full py-3.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors",
          claimedToday
            ? "bg-gray-800 text-gray-500 cursor-default"
            : progress.allDone
            ? "bg-linear-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
            : "bg-gray-800 text-gray-500 cursor-not-allowed"
        )}
      >
        {claiming ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : claimedToday ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Already claimed today
          </>
        ) : progress.allDone ? (
          <>
            <Trophy className="w-4 h-4" />
            Claim {mission.completionPointsReward} pts + {mission.completionXpReward} XP
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            Complete all tasks to claim
          </>
        )}
      </button>
    </div>
  );
}
