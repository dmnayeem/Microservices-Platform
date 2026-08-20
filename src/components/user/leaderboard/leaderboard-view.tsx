"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Medal, Crown } from "lucide-react";
import { cn, pts } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Avatar } from "@/components/user/primitives/avatar";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";

interface Row {
  rank: number;
  userId: string;
  name: string | null;
  avatar: string | null;
  level: number;
  packageTier: string;
  value: number;
}

interface CurrentUser {
  rank: number | string;
  value: number;
  isInTop: boolean;
}

const METRICS = [
  { key: "points", label: "Points", suffix: "pts" },
  { key: "xp", label: "XP", suffix: "XP" },
  { key: "tasks", label: "Tasks", suffix: "" },
  { key: "referrals", label: "Referrals", suffix: "" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function LeaderboardView({ currentUserId }: { currentUserId: string }) {
  const [metric, setMetric] = useState<MetricKey>("points");
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // `silent` skips the loading state so background auto-refreshes don't flash.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await fetch(`/api/leaderboard?type=${metric}&limit=50`, {
          cache: "no-store",
        });
        const d = r.ok ? await r.json() : { leaderboard: [], currentUser: null };
        setRows(d.leaderboard ?? []);
        setMe(d.currentUser ?? null);
      } catch {
        if (!silent) {
          setRows([]);
          setMe(null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [metric]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live refresh: tab refocus + 15s timer (paused while tab hidden).
  useAutoRefresh(() => load(true));

  const suffix = METRICS.find((m) => m.key === metric)!.suffix;
  // Compact past a million: the podium column is ~100px on a 360px phone, so a
  // full-precision 7-digit score pushed the name and the value into each other.
  const fmt = (v: number) => `${pts(v)}${suffix ? ` ${suffix}` : ""}`;

  const changeMetric = (next: MetricKey) => {
    if (next === metric) return;
    setLoading(true);
    setMetric(next);
  };

  // Podium display order: 2nd, 1st, 3rd (1st raised in the middle).
  const podium = [rows[1], rows[0], rows[2]];
  const podiumMeta = [
    { ring: "ring-gray-300/60", badge: "bg-gray-300 text-gray-900", icon: Medal, rank: 2 },
    { ring: "ring-amber-400/70", badge: "bg-amber-400 text-amber-950", icon: Crown, rank: 1 },
    { ring: "ring-orange-500/60", badge: "bg-orange-500 text-orange-950", icon: Medal, rank: 3 },
  ];

  // Rank chip colour for the list (top 3 tinted, rest neutral).
  const rankChip = (rank: number) =>
    rank === 1
      ? "bg-amber-400/15 text-amber-300 ring-amber-400/30"
      : rank === 2
        ? "bg-gray-300/15 text-gray-200 ring-gray-300/30"
        : rank === 3
          ? "bg-orange-500/15 text-orange-300 ring-orange-500/30"
          : "bg-gray-800 text-gray-400 ring-gray-700/60";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" />
          Leaderboard
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          See where you rank against other earners.
        </p>
      </div>

      {/* Metric filter */}
      <FilterChips
        value={metric}
        onChange={changeMetric}
        options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
      />

      {loading ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Complete tasks to appear on the leaderboard!"
        />
      ) : (
        <>
          {/* Top 3 podium */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
            {podium.map((row, i) => {
              const meta = podiumMeta[i];
              const raised = i === 1;
              const Icon = meta.icon;
              return (
                <div
                  key={row ? row.userId : i}
                  className={cn(
                    "glass rounded-2xl px-2 py-4 sm:p-5 text-center relative",
                    raised && "-mt-3 sm:-mt-4 ring-1 ring-amber-400/30"
                  )}
                >
                  {/* Crown floats above the #1 card */}
                  {raised && (
                    <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 mx-auto -mt-1 mb-1 drop-shadow" />
                  )}
                  <div className="relative w-fit mx-auto">
                    {row ? (
                      <Avatar
                        src={row.avatar}
                        name={row.name}
                        size={raised ? 64 : 52}
                        className={cn("ring-2", meta.ring)}
                      />
                    ) : (
                      <div
                        className={cn(
                          "rounded-full bg-gray-800 flex items-center justify-center ring-2",
                          meta.ring
                        )}
                        style={{ width: raised ? 64 : 52, height: raised ? 64 : 52 }}
                      >
                        <Icon className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute -bottom-1 left-1/2 -translate-x-1/2 min-w-5 h-5 px-1 rounded-full text-[11px] font-extrabold inline-flex items-center justify-center ring-2 ring-gray-950 tabular-nums",
                        meta.badge
                      )}
                    >
                      {meta.rank}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-xs sm:text-sm font-semibold truncate mt-2.5",
                      row ? "text-white" : "text-gray-500"
                    )}
                  >
                    {row ? row.name : "No one yet"}
                  </p>
                  {row && (
                    <p className="text-amber-400 font-bold text-xs sm:text-sm tabular-nums mt-0.5 whitespace-nowrap">
                      {fmt(row.value)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Current user (if outside the top list) */}
          {me && !me.isInTop && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-indigo-300 font-medium">
                Your rank: <span className="font-bold">#{me.rank}</span>
              </span>
              <span className="text-sm text-white font-semibold tabular-nums">
                {fmt(me.value)}
              </span>
            </div>
          )}

          {/* Full ranking — a row list (mobile-first; no horizontal scroll). */}
          <div className="glass rounded-2xl divide-y divide-gray-800/60 overflow-hidden">
            {rows.map((row) => {
              const isMe = row.userId === currentUserId;
              return (
                <div
                  key={row.userId}
                  className={cn(
                    "flex items-center gap-3 px-3 sm:px-4 py-2.5",
                    isMe && "bg-indigo-500/10"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-8 h-8 rounded-lg ring-1 inline-flex items-center justify-center text-xs font-extrabold tabular-nums",
                      rankChip(row.rank)
                    )}
                  >
                    {row.rank}
                  </span>
                  <Avatar
                    src={row.avatar}
                    name={row.name}
                    size={36}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {row.name ?? "User"}
                      {isMe && (
                        <span className="ml-1.5 text-[10px] font-bold text-indigo-400">
                          You
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      Level {row.level}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-white tabular-nums">
                    {fmt(row.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
