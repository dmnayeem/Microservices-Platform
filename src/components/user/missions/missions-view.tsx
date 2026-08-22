"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Target,
  Clock,
  Coins,
  Loader2,
  CheckCircle2,
  Trophy,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { runInterstitial } from "@/lib/reward-interstitial";
import { EVENT_ACTION_META, type EventActionType } from "@/lib/events-shared";

/**
 * Missions — the big-prize goals. Deliberately a separate surface from Events
 * (time-boxed marketing) and the Daily Mission (today's task checklist), even
 * though all three are fed by the same progress engine.
 */

interface TierView {
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
  reached: boolean;
  claimed: boolean;
}

interface MissionItem {
  id: string;
  title: string;
  description: string | null;
  iconEmoji: string | null;
  actionType: EventActionType;
  targetValue: number;
  pointsReward: number;
  xpReward: number;
  endAt: string | null;
  progress: number;
  claimed: boolean;
  completable: boolean;
  tierViews: TierView[];
  lockedBy: { id: string; title: string } | null;
}

function timeLeft(endAt: string | null): string | null {
  if (!endAt) return null;
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

export function MissionsView() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/missions", { cache: "no-store" });
      const d = r.ok ? await r.json() : { missions: [] };
      setMissions(d.missions ?? []);
    } catch {
      setMissions([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true));

  const claim = async (m: MissionItem, tierThreshold?: number) => {
    setClaiming(tierThreshold != null ? `${m.id}:${tierThreshold}` : m.id);
    try {
      const r = await fetch(`/api/missions/${m.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tierThreshold != null ? { tierThreshold } : {}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't claim");
      await runInterstitial();
      toast.success(
        `Reward claimed — +${d.rewardPoints} points${d.rewardXp ? ` / +${d.rewardXp} XP` : ""}!`
      );
      load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <Target className="w-6 h-6 text-emerald-400" /> Missions
      </h1>
      <p className="text-sm text-gray-400 -mt-1">
        Long-run goals with the biggest rewards on the platform. Progress is
        counted from the moment a mission goes live — keep going and claim.
      </p>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={3} />}

      {!loading && missions.length === 0 && (
        <EmptyState
          icon={Target}
          title="No missions available"
          description="Missions unlock as you level up and new ones are added regularly."
        />
      )}

      {!loading && missions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {missions.map((m) => {
            const pct = Math.min(
              100,
              Math.round((m.progress / Math.max(1, m.targetValue)) * 100)
            );
            const meta = EVENT_ACTION_META[m.actionType];
            const locked = !!m.lockedBy;
            const canClaim = !m.claimed && !locked && m.completable;
            const remaining = timeLeft(m.endAt);
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-2xl border p-4 flex flex-col",
                  locked
                    ? "border-gray-800 bg-gray-900/50 opacity-75"
                    : "border-gray-800 bg-gray-900"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-linear-to-br from-emerald-500 to-cyan-500 grid place-items-center text-xl shrink-0">
                    {m.iconEmoji || "🏆"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white line-clamp-2">
                      {m.title}
                    </p>
                    {remaining && (
                      <p className="text-[11px] text-gray-500 inline-flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {remaining}
                      </p>
                    )}
                  </div>
                </div>

                {m.description && (
                  <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                    {m.description}
                  </p>
                )}

                {/* The dedup rule, stated plainly — it's the thing users
                    otherwise complain about ("I liked 50 posts, why is it 12?"). */}
                <p className="text-[11px] text-gray-500 mt-2">{meta.hint}</p>

                {locked ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-2 text-[11px] text-amber-300">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Finish &quot;{m.lockedBy!.title}&quot; to unlock this mission.
                  </div>
                ) : (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-400">{meta.label}</span>
                      <span className="text-white font-bold tabular-nums">
                        {m.progress}/{m.targetValue} {meta.unit}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-emerald-500 to-cyan-500 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {m.tierViews.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {m.tierViews.map((t) => {
                      const busy = claiming === `${m.id}:${t.threshold}`;
                      return (
                        <div
                          key={t.threshold}
                          className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/60 border border-gray-800 px-2.5 py-1.5"
                        >
                          <span className="text-xs text-gray-300">
                            {t.threshold} {meta.unit} →{" "}
                            <span className="text-amber-400 font-bold">
                              +{t.rewardPoints}
                            </span>
                            {t.rewardXp ? (
                              <span className="text-violet-400"> +{t.rewardXp}xp</span>
                            ) : null}
                          </span>
                          {t.claimed ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Done
                            </span>
                          ) : (
                            <button
                              onClick={() => claim(m, t.threshold)}
                              disabled={!t.reached || locked || busy}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold",
                                t.reached && !locked
                                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                  : "bg-gray-800 text-gray-500 cursor-not-allowed"
                              )}
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trophy className="w-3.5 h-3.5" />
                              )}
                              {t.reached ? "Claim" : "Locked"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-amber-400 font-bold text-sm">
                      <Coins className="w-4 h-4" /> +{m.pointsReward}
                      {m.xpReward ? (
                        <span className="text-violet-400 ml-1">+{m.xpReward}xp</span>
                      ) : null}
                    </span>
                    {m.claimed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Claimed
                      </span>
                    ) : (
                      <button
                        onClick={() => claim(m)}
                        disabled={!canClaim || claiming === m.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold",
                          canClaim
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        )}
                      >
                        {claiming === m.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                        {canClaim ? "Claim" : locked ? "Locked" : "In progress"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
