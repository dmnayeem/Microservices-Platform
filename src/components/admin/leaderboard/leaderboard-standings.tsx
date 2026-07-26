"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Coins,
  Sparkles,
  Users,
  ListChecks,
  Crown,
  Medal,
  Award,
  Loader2,
  ArrowDownToLine,
  Gift,
  Calendar,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { userDisplayId } from "@/lib/display-id";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { PackageBadge } from "@/components/user/profile/badges";

interface CombinedRow {
  rank: number;
  userId: string;
  name: string | null;
  avatar: string | null;
  level: number;
  packageSlug: string;
  packageName: string | null;
  score: number;
  components: { points: number; xp: number; tasks: number; team: number };
  isEligible: boolean;
}

interface LBResponse {
  leaderboard: CombinedRow[];
  eligiblePackages: string[];
  currentUser:
    | {
        rank: number | string;
        score: number;
        components: CombinedRow["components"];
        isEligible: boolean;
        packageSlug: string;
        isInTop: boolean;
      }
    | null;
  metadata: { totalParticipants: number; lastUpdated: string };
}

interface PrizeRow {
  rank: number;
  points: number;
  xp?: number;
  giftName?: string;
  giftImage?: string;
}

interface PreviousCycle {
  cycleId: string;
  period: "daily" | "weekly" | "monthly";
  metric: string;
  totalPrize: number;
  cycledAt: string;
  winners: Array<{
    rank: number;
    userId: string;
    name: string;
    value: number;
    prize: number;
  }>;
}

interface Props {
  settings: Record<string, unknown>;
}

export function LeaderboardStandings({ settings }: Props) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [data, setData] = useState<LBResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previous, setPrevious] = useState<PreviousCycle[]>([]);
  const [previousLoading, setPreviousLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/leaderboard?type=combined&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setData(d as LBResponse);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    setPreviousLoading(true);
    fetch("/api/admin/leaderboard/history")
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setPrevious((d.cycles ?? []) as PreviousCycle[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setPreviousLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const prizeRows: PrizeRow[] = useMemo(() => {
    const distKey = `${period}_distribution`;
    const distribution = (settings[distKey] as number[] | undefined) ?? [];
    const giftItems =
      (settings.gift_items as PrizeRow[] | undefined) ?? [];
    const xpKey = `${period}_xp_distribution`;
    const xpDistribution = (settings[xpKey] as number[] | undefined) ?? [];
    const rows: PrizeRow[] = [];
    const max = Math.max(distribution.length, giftItems.length, xpDistribution.length);
    for (let i = 0; i < max; i++) {
      const giftRow = giftItems.find((g) => g.rank === i + 1);
      rows.push({
        rank: i + 1,
        points: distribution[i] ?? 0,
        xp: xpDistribution[i],
        giftName: giftRow?.giftName,
        giftImage: giftRow?.giftImage,
      });
    }
    return rows;
  }, [settings, period]);

  const filteredPrevious = previous.filter((c) => c.period === period);

  const eligibleSet = new Set(
    (data?.eligiblePackages ?? []).map((s) => s.toUpperCase())
  );

  return (
    <div className="space-y-6">
      {/* Period selector + summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Period
            </span>
            <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-700">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-md transition-colors capitalize",
                    period === p
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              {data?.metadata.totalParticipants?.toLocaleString() ?? "—"}{" "}
              participants
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              {(data?.eligiblePackages ?? []).length} plans eligible
            </span>
          </div>
        </div>

        {/* Eligibility hint chips */}
        {data?.eligiblePackages && data.eligiblePackages.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 font-semibold uppercase tracking-wider">
              Eligible:
            </span>
            {data.eligiblePackages.map((slug) => (
              <span
                key={slug}
                className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono uppercase"
              >
                {slug}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Prize distribution */}
      <PrizeDistributionCard
        prizeRows={prizeRows}
        period={period}
        totalPrize={
          asNumber(settings[`${period}_prize`]) ??
          prizeRows.reduce((sum, p) => sum + p.points, 0)
        }
      />

      {/* Top 50 — Combined ranking */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                Top 50 — Combined Ranking
              </h3>
              <p className="text-[11px] text-slate-500">
                Mixed score across Points + XP + Tasks + Team
              </p>
            </div>
          </div>
          {data?.metadata.lastUpdated && (
            <span className="text-[11px] text-slate-500">
              Updated{" "}
              {new Date(data.metadata.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : !data || data.leaderboard.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            No participants yet.
          </div>
        ) : (
          <div className="max-h-160 overflow-y-auto divide-y divide-slate-800 scrollbar-thin">
            {data.leaderboard.map((row) => (
              <LeaderboardRow key={row.userId} row={row} />
            ))}
          </div>
        )}

        {/* Sticky "your rank" bar */}
        {data?.currentUser && (
          <div className="sticky bottom-0 px-4 sm:px-5 py-3 bg-linear-to-r from-indigo-600/95 to-purple-600/95 backdrop-blur-md border-t border-indigo-500/40 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/30 flex items-center justify-center text-white font-extrabold text-sm tabular-nums">
              {typeof data.currentUser.rank === "number"
                ? `#${data.currentUser.rank}`
                : data.currentUser.rank}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-white/80">
                Your rank
              </p>
              <p className="text-sm font-bold text-white truncate inline-flex items-center gap-2">
                {data.currentUser.isInTop
                  ? "You're in the top 50!"
                  : "Outside the top 50 — keep grinding."}
                {data.currentUser.isEligible ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" />
                    Prize-eligible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
                    <Lock className="w-3 h-3" />
                    Upgrade to claim
                  </span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-white/70">
                Score
              </p>
              <p className="text-base font-extrabold text-white tabular-nums">
                {data.currentUser.score.toFixed(1)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Previous winners */}
      <PreviousWinnersSection
        loading={previousLoading}
        cycles={filteredPrevious}
        currentPeriod={period}
      />

      {/* Tiny legend explaining how eligibility shows up in rows */}
      {data?.leaderboard && data.leaderboard.length > 0 && (
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-2 px-1">
          <Lock className="w-3 h-3" />
          Rows with the lock icon belong to plans not currently in the prize-eligibility allowlist
          {eligibleSet.size > 0 && (
            <>
              {" "}— change which plans qualify in <strong className="text-slate-300">Settings</strong>.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function LeaderboardRow({ row }: { row: CombinedRow }) {
  const isPodium = row.rank <= 3;
  const PodiumIcon =
    row.rank === 1 ? Crown : row.rank === 2 ? Medal : row.rank === 3 ? Award : null;
  const podiumColor =
    row.rank === 1
      ? "text-amber-300"
      : row.rank === 2
      ? "text-slate-300"
      : row.rank === 3
      ? "text-orange-400"
      : "text-slate-500";
  const initial = (row.name || "U").charAt(0).toUpperCase();
  return (
    <Link
      href={`/admin/users/${row.userId}`}
      className={cn(
        "flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors",
        row.isEligible
          ? "hover:bg-slate-800/50"
          : "opacity-75 hover:opacity-100 hover:bg-slate-800/40"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-extrabold tabular-nums text-sm border",
          isPodium
            ? "bg-linear-to-br from-amber-500/20 to-yellow-500/20 border-amber-500/40 text-amber-200"
            : "bg-slate-950 border-slate-700 text-slate-400"
        )}
      >
        {PodiumIcon ? (
          <PodiumIcon className={cn("w-5 h-5", podiumColor)} />
        ) : (
          `#${row.rank}`
        )}
      </div>

      <Avatar
        src={row.avatar}
        size={36}
        fallbackText={initial}
        className="shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-white truncate">
            {row.name || "Anonymous"}
          </p>
          {row.packageSlug && row.packageSlug !== "default" && (
            <PackageBadge tier={row.packageSlug} size="sm" />
          )}
          {row.isEligible ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Eligible
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider"
              title="This user's plan is not in the prize-eligibility allowlist."
            >
              <Lock className="w-2.5 h-2.5" />
              Not eligible
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
          {userDisplayId(row.userId)}
          <span className="ml-2 font-sans">Lv {row.level}</span>
        </p>

        {/* Per-metric component breakdown */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
          <Component icon={<Coins className="w-3 h-3" />} value={row.components.points} color="text-amber-300" />
          <Component icon={<Sparkles className="w-3 h-3" />} value={row.components.xp} color="text-purple-300" />
          <Component icon={<ListChecks className="w-3 h-3" />} value={row.components.tasks} color="text-indigo-300" />
          <Component icon={<Users className="w-3 h-3" />} value={row.components.team} color="text-emerald-300" />
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-base font-extrabold text-white tabular-nums">
          {row.score.toFixed(1)}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          Score
        </p>
      </div>
    </Link>
  );
}

function Component({
  icon,
  value,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  color: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", color)}>
      {icon}
      {value.toLocaleString()}
    </span>
  );
}

function PrizeDistributionCard({
  prizeRows,
  period,
  totalPrize,
}: {
  prizeRows: PrizeRow[];
  period: string;
  totalPrize: number;
}) {
  if (prizeRows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
        <Gift className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-400 font-semibold">
          No prize distribution configured for this period
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          Open the Settings tab to configure {period} rewards.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-500/5 via-slate-900 to-slate-900 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Gift className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white inline-flex items-center gap-2 capitalize">
              {period} Prize Distribution
            </h3>
            <p className="text-[11px] text-slate-400">
              {prizeRows.length} winners ·{" "}
              <span className="text-amber-300 font-semibold tabular-nums">
                {totalPrize.toLocaleString()} pts
              </span>{" "}
              total pool
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5">
        {prizeRows.map((p) => (
          <PrizeTile key={p.rank} row={p} />
        ))}
      </div>
    </div>
  );
}

function PrizeTile({ row }: { row: PrizeRow }) {
  const isPodium = row.rank <= 3;
  const tone =
    row.rank === 1
      ? "from-amber-500/15 to-yellow-500/15 border-amber-500/40"
      : row.rank === 2
      ? "from-slate-500/15 to-slate-400/15 border-slate-400/40"
      : row.rank === 3
      ? "from-orange-500/15 to-rose-500/15 border-orange-500/40"
      : "from-slate-800 to-slate-900 border-slate-700";
  const rankColor =
    row.rank === 1
      ? "text-amber-300"
      : row.rank === 2
      ? "text-slate-200"
      : row.rank === 3
      ? "text-orange-300"
      : "text-slate-300";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 bg-linear-to-br relative overflow-hidden",
        tone
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black/30 border border-white/10 text-sm font-extrabold tabular-nums",
            rankColor
          )}
        >
          #{row.rank}
        </span>
        {isPodium && <Crown className={cn("w-4 h-4", rankColor)} />}
      </div>
      {row.giftImage && (
        <div className="relative w-full h-20 overflow-hidden rounded-lg bg-slate-950 mb-2">
          <SmartImage
            src={row.giftImage}
            alt={row.giftName ?? ""}
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
      )}
      {row.giftName && (
        <p className="text-sm font-bold text-white truncate mb-1">
          🎁 {row.giftName}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
          <Coins className="w-3 h-3" />
          <span className="tabular-nums">{row.points.toLocaleString()}</span>
        </span>
        {row.xp !== undefined && row.xp > 0 && (
          <span className="inline-flex items-center gap-1 text-purple-300 font-semibold">
            <Sparkles className="w-3 h-3" />
            <span className="tabular-nums">{row.xp.toLocaleString()} XP</span>
          </span>
        )}
      </div>
    </div>
  );
}

function PreviousWinnersSection({
  loading,
  cycles,
  currentPeriod,
}: {
  loading: boolean;
  cycles: PreviousCycle[];
  currentPeriod: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-800">
        <ArrowDownToLine className="w-4 h-4 text-slate-400" />
        <h3 className="text-base font-bold text-white capitalize">
          Previous {currentPeriod} winners
        </h3>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading history…
        </div>
      ) : cycles.length === 0 ? (
        <div className="p-8 text-center">
          <Trophy className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-400 font-semibold">
            No past {currentPeriod} cycles yet
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Reset the leaderboard from Settings to crown winners and snapshot
            them here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {cycles.slice(0, 5).map((c) => (
            <details key={c.cycleId} className="group/cycle">
              <summary className="cursor-pointer list-none px-4 sm:px-5 py-3 hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">
                      {new Date(c.cycledAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {c.metric.replace(/_/g, " ").toLowerCase()} ·{" "}
                      {c.winners.length} winners ·{" "}
                      <span className="text-amber-300">
                        {c.totalPrize.toLocaleString()} pts
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 group-open/cycle:text-indigo-400">
                  toggle
                </span>
              </summary>
              <div className="px-4 sm:px-5 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {c.winners.slice(0, 12).map((w) => (
                    <Link
                      key={`${c.cycleId}-${w.rank}`}
                      href={`/admin/users/${w.userId}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                        #{w.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {w.name}
                        </p>
                        <p className="text-[10px] text-slate-500 tabular-nums">
                          {w.value.toLocaleString()} ·{" "}
                          <span className="text-amber-300">
                            {w.prize.toLocaleString()} pts
                          </span>
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}
