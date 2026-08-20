"use client";
import { STAT_LABEL_CLASS, STAT_VALUE_CLASS_SM } from "@/components/user/primitives/stat-card";

import { useState } from "react";
import {
  MessageSquare,
  Users,
  UserPlus,
  Coins,
  ListChecks,
  Trophy,
  Sparkles,
  Award,
  UsersRound,
  DollarSign,
} from "lucide-react";
import { cn, usd } from "@/lib/utils";

type Tone = "indigo" | "amber" | "emerald" | "purple" | "rose" | "sky" | "violet";

const TONES: Record<Tone, string> = {
  indigo: "text-indigo-400 bg-indigo-500/10",
  amber: "text-amber-400 bg-amber-500/10",
  emerald: "text-emerald-400 bg-emerald-500/10",
  purple: "text-purple-400 bg-purple-500/10",
  rose: "text-rose-400 bg-rose-500/10",
  sky: "text-sky-400 bg-sky-500/10",
  violet: "text-violet-400 bg-violet-500/10",
};

export function StatTile({
  icon,
  label,
  value,
  tone = "indigo",
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: Tone;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="glass glass-hover p-3 flex items-center gap-3 min-w-0">
      <div className={cn("p-2 rounded-lg shrink-0", TONES[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className={STAT_LABEL_CLASS}>{label}</p>
        <p className={STAT_VALUE_CLASS_SM}>{value}</p>
      </div>
      {trailing}
    </div>
  );
}

export function SocialStatsGroup({
  posts,
  followers,
  following,
}: {
  posts: number | null | undefined;
  followers: number | null | undefined;
  following: number | null | undefined;
}) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
        Profile
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          icon={<MessageSquare className="w-4 h-4" />}
          label="Posts"
          value={(posts ?? 0).toLocaleString()}
          tone="indigo"
        />
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label="Followers"
          value={(followers ?? 0).toLocaleString()}
          tone="purple"
        />
        <StatTile
          icon={<UserPlus className="w-4 h-4" />}
          label="Following"
          value={(following ?? 0).toLocaleString()}
          tone="emerald"
        />
      </div>
    </section>
  );
}

interface LifetimeStats {
  totalEarnedPoints: number | null;
  totalEarnedUsd: number | null;
  tasksCompleted: number;
  rank: number;
  totalXp: number;
  level: number;
  team: number;
}

export function LifetimeStatsGroup({ stats }: { stats: LifetimeStats }) {
  const [unit, setUnit] = useState<"points" | "usd">("points");
  const earningsValue =
    stats.totalEarnedPoints === null && stats.totalEarnedUsd === null
      ? "—"
      : unit === "points"
      ? (stats.totalEarnedPoints ?? 0).toLocaleString()
      : `${usd((stats.totalEarnedUsd ?? 0))}`;

  const canToggle =
    stats.totalEarnedPoints !== null && stats.totalEarnedUsd !== null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
          Lifetime Stats
        </h2>
        {canToggle && (
          <button
            onClick={() => setUnit((p) => (p === "points" ? "usd" : "points"))}
            className="text-[10px] uppercase tracking-wider text-indigo-400 hover:text-indigo-300 font-bold"
          >
            Show in {unit === "points" ? "USD" : "points"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile
          icon={
            unit === "points" ? (
              <Coins className="w-4 h-4" />
            ) : (
              <DollarSign className="w-4 h-4" />
            )
          }
          label="Total Earned"
          value={earningsValue}
          tone="amber"
        />
        <StatTile
          icon={<ListChecks className="w-4 h-4" />}
          label="Tasks"
          value={stats.tasksCompleted.toLocaleString()}
          tone="sky"
        />
        <StatTile
          icon={<Trophy className="w-4 h-4" />}
          label="Rank"
          value={`#${stats.rank.toLocaleString()}`}
          tone="rose"
        />
        <StatTile
          icon={<Sparkles className="w-4 h-4" />}
          label="Total XP"
          value={stats.totalXp.toLocaleString()}
          tone="violet"
        />
        <StatTile
          icon={<Award className="w-4 h-4" />}
          label="Level"
          value={`Lv ${stats.level}`}
          tone="emerald"
        />
        <StatTile
          icon={<UsersRound className="w-4 h-4" />}
          label="Team"
          value={stats.team.toLocaleString()}
          tone="purple"
        />
      </div>
    </section>
  );
}
