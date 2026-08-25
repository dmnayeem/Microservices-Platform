"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { cn, pts } from "@/lib/utils";
import { toast } from "@/lib/toast";

/**
 * Mirrors what `GET /api/achievements` actually returns.
 *
 * This component used to read `d.badges` — a field that response has never
 * contained — so `setBadges(d.badges ?? [])` fell back to an empty array on
 * every load and the page rendered an empty grid for every user, forever.
 */
interface Achievement {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  typeLabel: string;
  threshold: number;
  pointsReward: number;
  xpReward: number;
  progress: { current: number; target: number; percentage: number };
  isUnlocked: boolean;
  completedAt: string | null;
  isClaimed: boolean;
  canClaim: boolean;
}

interface Summary {
  total: number;
  unlocked: number;
  percentage: number;
  pointsEarned: number;
  pointsClaimable: number;
}

export function AchievementsView() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Achievement | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/achievements");
      if (!r.ok) throw new Error("failed");
      const d = await r.json();
      setItems(d.achievements ?? []);
      setSummary(d.summary ?? null);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (a: Achievement) => {
    setClaiming(a.id);
    try {
      const r = await fetch(`/api/achievements/${a.id}/claim`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Could not claim this achievement.");
      } else {
        const parts = [
          d.pointsAwarded > 0 ? `${pts(d.pointsAwarded)} points` : null,
          d.xpAwarded > 0 ? `${d.xpAwarded} XP` : null,
        ].filter(Boolean);
        toast.success(`Claimed ${a.name} — ${parts.join(" + ")}`);
        setActive(null);
      }
      await load();
    } catch {
      toast.error("Could not claim this achievement.");
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">🏅 Achievements</h1>
      <p className="text-sm text-gray-400">
        Unlocked: <strong className="text-white">{summary?.unlocked ?? 0}</strong> /{" "}
        {summary?.total ?? items.length}
        {summary && summary.pointsEarned > 0 && (
          <span className="text-gray-500">
            {" "}
            · {pts(summary.pointsEarned)} pts collected
          </span>
        )}
      </p>

      {summary && summary.pointsClaimable > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
          You have <strong>{pts(summary.pointsClaimable)} points</strong> waiting.
          Tap an unlocked badge to collect it.
        </div>
      )}

      {loading && <ListSkeleton rows={3} />}

      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-500 py-10 text-center">
          No achievements are set up yet.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => setActive(a)}
              className={cn(
                "relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 p-2 transition-colors",
                a.isUnlocked
                  ? "border-amber-500/30 bg-linear-to-br from-amber-500/10 to-orange-500/5"
                  : "border-gray-800 bg-gray-900 opacity-60"
              )}
            >
              <div className="text-3xl">
                {a.isUnlocked ? (
                  "🏆"
                ) : (
                  <Lock className="w-6 h-6 text-gray-600" />
                )}
              </div>
              <p
                className={cn(
                  "text-[10px] font-bold text-center line-clamp-2",
                  a.isUnlocked ? "text-white" : "text-gray-500"
                )}
              >
                {a.name}
              </p>
              {/* Locked badges show how far along you are, so the grid says what
                  to do next instead of only what you have not got. */}
              {!a.isUnlocked && (
                <span className="text-[9px] text-gray-500 tabular-nums">
                  {a.progress.current}/{a.progress.target}
                </span>
              )}
              {a.canClaim && (
                <span className="absolute top-1 right-1 px-1 py-0.5 rounded bg-amber-500 text-black text-[8px] font-black">
                  CLAIM
                </span>
              )}
              {a.isClaimed && (
                <span className="absolute top-1 right-1 text-[10px] text-emerald-400">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-100 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl p-6 max-w-sm w-full text-center"
          >
            <div className="text-6xl mb-3">{active.isUnlocked ? "🏆" : "🔒"}</div>
            <h2 className="text-xl font-bold text-white">{active.name}</h2>
            {active.description && (
              <p className="text-sm text-gray-400 mt-1 mb-3">
                {active.description}
              </p>
            )}

            <div className="mb-4">
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-amber-500 to-orange-500"
                  style={{ width: `${active.progress.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                {active.progress.current.toLocaleString()} /{" "}
                {active.progress.target.toLocaleString()} {active.typeLabel}
              </p>
            </div>

            {(active.pointsReward > 0 || active.xpReward > 0) && (
              <p className="text-sm text-amber-400 font-bold">
                Reward: {active.pointsReward > 0 && `+${pts(active.pointsReward)} pts`}
                {active.pointsReward > 0 && active.xpReward > 0 && " · "}
                {active.xpReward > 0 && `+${active.xpReward} XP`}
              </p>
            )}
            {active.completedAt && (
              <p className="text-[11px] text-emerald-400 mt-2">
                Unlocked on {new Date(active.completedAt).toLocaleDateString()}
              </p>
            )}
            {active.isClaimed && (
              <p className="text-[11px] text-gray-500 mt-1">Reward collected.</p>
            )}

            {active.canClaim && (
              <button
                onClick={() => claim(active)}
                disabled={claiming === active.id}
                className="mt-4 w-full py-2.5 rounded-lg bg-amber-500 text-black text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {claiming === active.id && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Claim reward
              </button>
            )}
            <button
              onClick={() => setActive(null)}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-bold",
                active.canClaim
                  ? "mt-2 bg-gray-800 text-gray-300"
                  : "mt-4 bg-indigo-500 text-white"
              )}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
