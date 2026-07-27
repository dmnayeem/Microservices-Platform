"use client";

import { useEffect, useState } from "react";
import { Trophy, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";

type Category = "ALL" | "ACTIVITY" | "EARNINGS" | "SOCIAL" | "ENGAGEMENT" | "REFERRAL" | "PROFILE";

interface Milestone {
  id: string;
  title: string;
  description?: string;
  category: Exclude<Category, "ALL">;
  current: number;
  target: number;
  unit?: string;
  pointsReward: number;
  badgeName?: string;
  status: "COMPLETED" | "IN_PROGRESS" | "LOCKED";
  claimed: boolean;
}

export function MilestonesView() {
  const [category, setCategory] = useState<Category>("ALL");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/milestones")
      .then((r) => (r.ok ? r.json() : { milestones: [] }))
      .then((d) => setMilestones(d.milestones ?? []))
      .catch(() => setMilestones([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = milestones.filter(
    (m) => category === "ALL" || m.category === category
  );

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">🎯 Milestones</h1>

      <FilterChips
        value={category}
        onChange={setCategory}
        options={[
          { value: "ALL", label: "All" },
          { value: "ACTIVITY", label: "Activity" },
          { value: "EARNINGS", label: "Earnings" },
          { value: "SOCIAL", label: "Social" },
          { value: "ENGAGEMENT", label: "Engagement" },
          { value: "REFERRAL", label: "Referral" },
          { value: "PROFILE", label: "Profile" },
        ]}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="No milestones in this category"
          description="Try a different filter."
        />
      )}

      {!loading &&
        visible.map((m) => {
          const pct = Math.min(100, (m.current / m.target) * 100);
          return (
            <div
              key={m.id}
              className={cn(
                "rounded-xl border p-3",
                m.status === "COMPLETED"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : m.status === "LOCKED"
                    ? "border-gray-800 bg-gray-900 opacity-60"
                    : "border-gray-800 bg-gray-900"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    m.status === "COMPLETED"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : m.status === "LOCKED"
                        ? "bg-gray-800 text-gray-500"
                        : "bg-indigo-500/15 text-indigo-400"
                  )}
                >
                  {m.status === "COMPLETED" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : m.status === "LOCKED" ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Trophy className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{m.title}</p>
                  {m.description && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {m.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-1 flex-1 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={cn(
                          "h-full",
                          m.status === "COMPLETED"
                            ? "bg-emerald-500"
                            : "bg-linear-to-r from-indigo-500 to-purple-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                      {m.current}
                      {m.unit ?? ""}/{m.target}
                      {m.unit ?? ""}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-amber-400 tabular-nums">
                    +{m.pointsReward}
                  </span>
                  {m.badgeName && (
                    <p className="text-[10px] text-purple-400 font-bold mt-0.5">
                      🏅 {m.badgeName}
                    </p>
                  )}
                </div>
              </div>
              {m.status === "COMPLETED" && m.claimed && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Claimed
                </p>
              )}
              {m.status === "COMPLETED" && !m.claimed && (
                <button
                  onClick={async () => {
                    setClaiming(m.id);
                    try {
                      await fetch(`/api/milestones/${m.id}/claim`, {
                        method: "POST",
                        headers: { "Idempotency-Key": newIdempotencyKey() },
                      });
                      setMilestones((arr) =>
                        arr.map((x) => (x.id === m.id ? { ...x, claimed: true } : x))
                      );
                    } finally {
                      setClaiming(null);
                    }
                  }}
                  disabled={claiming === m.id}
                  className="mt-2 w-full py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {claiming === m.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Claim"
                  )}
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}
