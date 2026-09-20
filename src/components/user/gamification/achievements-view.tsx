"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, Loader2 } from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { cn, pts } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { runInterstitial } from "@/lib/reward-interstitial";

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

  // Claimable first (there's a reward waiting), then still-in-progress /
  // locked (something to work toward), and claimed last — it's a record of
  // what you've already done, not something that needs your attention.
  // `Array.prototype.sort` is stable, so each bucket keeps the API's own
  // type/threshold order.
  const sorted = useMemo(() => {
    const rank = (a: Achievement) => (a.canClaim ? 0 : !a.isUnlocked ? 1 : 2);
    return [...items].sort((x, y) => rank(x) - rank(y));
  }, [items]);

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
        // Gate AFTER the credit lands, never before: the reward is already
        // banked, so a slow or missing ad cannot cost the user anything.
        // Resolves instantly when there's no ad configured or the plan is
        // ad-free. Mirrors the milestones claim flow — one shared mechanism.
        await runInterstitial();
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
      <p className="text-sm text-(--app-ink-3)">
        Unlocked: <strong className="text-white">{summary?.unlocked ?? 0}</strong> /{" "}
        {summary?.total ?? items.length}
        {summary && summary.pointsEarned > 0 && (
          <span className="text-(--app-ink-3)">
            {" "}
            · {pts(summary.pointsEarned)} pts collected
          </span>
        )}
      </p>

      {summary && summary.pointsClaimable > 0 && (
        <div className="rounded-(--app-r-control) border border-(--app-info-line) bg-(--app-info-soft) px-3 py-2.5 t-body text-(--app-info)">
          You have <strong>{pts(summary.pointsClaimable)} points</strong> waiting.
          Tap a claimable badge above to collect it.
        </div>
      )}

      {loading && <ListSkeleton rows={3} />}

      {!loading && items.length === 0 && (
        <p className="text-sm text-(--app-ink-3) py-10 text-center">
          No achievements are set up yet.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {sorted.map((a) => (
            <button
              key={a.id}
              onClick={() => setActive(a)}
              className={cn(
                "app-tap app-press app-lift relative aspect-square rounded-(--app-r-control) border flex flex-col items-center justify-center gap-0.5 p-1.5 text-center",
                a.canClaim
                  ? "bg-(--app-info-soft) border-(--app-info-line)"
                  : a.isUnlocked
                    ? "bg-(--app-surface-2) border-(--app-line) opacity-80"
                    : "bg-(--app-surface-2) border-(--app-line) opacity-60"
              )}
            >
              <div className="text-xl leading-none">
                {a.isUnlocked ? (
                  "🏆"
                ) : (
                  <Lock className="w-4 h-4 text-(--app-ink-3)" />
                )}
              </div>
              <p
                className={cn(
                  "t-meta font-bold text-center line-clamp-2",
                  a.canClaim
                    ? "text-(--app-info)"
                    : a.isUnlocked
                      ? "text-(--app-ink-2)"
                      : "text-(--app-ink-3)"
                )}
              >
                {a.name}
              </p>
              {/* Locked badges show how far along you are, so the grid says what
                  to do next instead of only what you have not got. */}
              {!a.isUnlocked && (
                <span className="text-[10px] text-(--app-ink-3) tabular-nums">
                  {a.progress.current}/{a.progress.target}
                </span>
              )}
              {a.canClaim && (
                <span className="absolute top-1 right-1 app-chip-info px-1 py-0 text-[8px] leading-tight">
                  Claim
                </span>
              )}
              {a.isClaimed && (
                <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-(--app-in)" />
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
            className="app-panel max-w-sm w-full text-center"
          >
            <div className="text-6xl mb-3">{active.isUnlocked ? "🏆" : "🔒"}</div>
            <h2 className="t-section text-white">{active.name}</h2>
            {active.description && (
              <p className="t-body text-(--app-ink-3) mt-1 mb-3">
                {active.description}
              </p>
            )}

            <div className="mb-4">
              <div className="h-1.5 rounded-full bg-(--app-surface-2) overflow-hidden">
                <div
                  className="h-full bg-(--app-info)"
                  style={{ width: `${active.progress.percentage}%` }}
                />
              </div>
              <p className="t-meta text-(--app-ink-3) mt-1.5 tabular-nums">
                {active.progress.current.toLocaleString()} /{" "}
                {active.progress.target.toLocaleString()} {active.typeLabel}
              </p>
            </div>

            {(active.pointsReward > 0 || active.xpReward > 0) && (
              <p className="t-body font-bold text-(--app-info)">
                Reward: {active.pointsReward > 0 && `+${pts(active.pointsReward)} pts`}
                {active.pointsReward > 0 && active.xpReward > 0 && " · "}
                {active.xpReward > 0 && `+${active.xpReward} XP`}
              </p>
            )}
            {active.completedAt && (
              <p className="t-meta text-(--app-in) mt-2">
                Unlocked on {new Date(active.completedAt).toLocaleDateString()}
              </p>
            )}
            {active.isClaimed && (
              <p className="t-meta text-(--app-ink-3) mt-1">Reward collected.</p>
            )}

            {active.canClaim && (
              <button
                onClick={() => claim(active)}
                disabled={claiming === active.id}
                className="app-press app-tap mt-4 w-full rounded-(--app-r-control) app-accent text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
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
                "app-press app-tap w-full rounded-(--app-r-control) text-sm font-bold",
                active.canClaim
                  ? "mt-2 bg-(--app-surface-2) border border-(--app-line) text-(--app-ink-2)"
                  : "mt-4 app-accent"
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
