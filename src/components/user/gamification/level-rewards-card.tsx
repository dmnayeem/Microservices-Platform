"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Gift, Loader2, Lock } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";

interface Row {
  level: number;
  points: number;
  reached: boolean;
  claimed: boolean;
}
interface Data {
  enabled: boolean;
  level: number;
  rows: Row[];
  claimable: number;
}

/**
 * The level reward ladder: every level with a reward, what it pays, and a
 * Claim button once reached. `compact` = a short strip for the Rank tab with a
 * link to the full page.
 */
export function LevelRewardsCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/level-rewards", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const claim = async (level: number) => {
    setBusy(level);
    try {
      const r = await fetch("/api/level-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't claim");
      toast.success(`Level ${level} reward claimed!`, { description: `+${pts(d.points)} pts added to your balance` });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setBusy(null);
    }
  };

  if (!data || !data.enabled || data.rows.length === 0) {
    return compact ? null : (
      <div className="app-card text-center text-sm text-(--app-ink-3)">No level rewards right now — check back soon.</div>
    );
  }

  const rows = compact
    ? // Claimable first, then the next one or two ahead.
      [...data.rows.filter((r) => r.reached && !r.claimed), ...data.rows.filter((r) => !r.reached).slice(0, 2)].slice(0, 3)
    : data.rows;

  return (
    <div className="app-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-section inline-flex items-center gap-2 text-white">
          <Gift className="h-5 w-5 text-amber-300" /> Level rewards
        </h2>
        {data.claimable > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
            {data.claimable} to claim
          </span>
        )}
      </div>
      <p className="t-meta text-(--app-ink-3)">
        You are level <b className="text-white">{data.level}</b>. Every level below pays once — complete tasks to earn
        XP and level up.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const ready = r.reached && !r.claimed;
          return (
            <li
              key={r.level}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                ready ? "border-amber-400/40 bg-amber-500/10" : "border-(--app-line) bg-(--app-surface-2)"
              )}
            >
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black",
                  r.reached ? "bg-amber-500/20 text-amber-200" : "bg-(--app-surface) text-(--app-ink-3)"
                )}
              >
                {r.level}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white">Level {r.level}</p>
                <p className="t-meta text-(--app-ink-3)">{pts(r.points)} points</p>
              </div>
              {r.claimed ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Claimed
                </span>
              ) : ready ? (
                <button
                  type="button"
                  onClick={() => claim(r.level)}
                  disabled={busy !== null}
                  className="app-accent inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black disabled:opacity-60"
                >
                  {busy === r.level && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Claim
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-(--app-ink-3)">
                  <Lock className="h-3.5 w-3.5" /> Locked
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {compact && (
        <Link href="/level-rewards" className="block text-center text-xs font-bold text-(--app-accent-ink)">
          See all level rewards
        </Link>
      )}
    </div>
  );
}
