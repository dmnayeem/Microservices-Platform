"use client";

import { confirmDialog } from "@/lib/confirm";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  RotateCcw,
  Trophy,
  History,
  Gift,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  CircleSlash,
  Zap,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface PackageOption {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  initial: Record<string, unknown>;
  canEdit: boolean;
  packages: PackageOption[];
}

type Period = "daily" | "weekly" | "monthly";

interface CycleWinner {
  rank: number;
  userId: string;
  name: string;
  value: number;
  prize: number;
}

interface Cycle {
  cycleId: string;
  period: Period;
  metric: string;
  totalPrize: number;
  cycledAt: string;
  winners: CycleWinner[];
}

interface GiftItem {
  rank: number;
  giftName: string;
  giftImage?: string;
}

const DEFAULTS = {
  enabled: true,
  metric: "COMBINED" as
    | "COMBINED"
    | "POINTS_EARNED"
    | "TASKS_COMPLETED"
    | "REFERRALS"
    | "XP_EARNED",
  daily_prize: 5000,
  weekly_prize: 25000,
  monthly_prize: 100000,
  daily_winners: 1,
  weekly_winners: 3,
  monthly_winners: 5,
  daily_distribution: [5000] as number[],
  weekly_distribution: [12500, 7500, 5000] as number[],
  monthly_distribution: [50000, 25000, 15000, 6000, 4000] as number[],
  daily_xp_distribution: [] as number[],
  weekly_xp_distribution: [] as number[],
  monthly_xp_distribution: [5000, 2500, 1500, 1000, 500] as number[],
  gift_items: [] as GiftItem[],
  /** Package slugs whose users are eligible to win prizes. Free users
   *  always SEE their rank but only those in eligible packages can claim. */
  eligible_packages: ["STARTER", "PRO", "ELITE", "VIP"] as string[],
  min_entries: 5,
  auto_reset: true,
};

type Values = typeof DEFAULTS;

export function LeaderboardSettingsForm({ initial, canEdit, packages }: Props) {
  const router = useRouter();
  const [v, setV] = useState<Values>({ ...DEFAULTS, ...(initial as Partial<Values>) });
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<Period | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const set = <K extends keyof Values>(k: K, val: Values[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/leaderboard/history");
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setCycles(d.cycles ?? []);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const settings: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) settings[`lb_${k}`] = val;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "leaderboard", settings }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Leaderboard settings saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const triggerReset = async (period: Period) => {
    if (
      !(await confirmDialog({
        title: `Reset ${period} leaderboard now?`,
        description: "This selects winners and credits prizes.",
        tone: "warning",
        confirmLabel: "Reset",
      }))
    )
      return;
    setResetting(period);
    try {
      const res = await fetch("/api/admin/leaderboard/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(
        `${period[0].toUpperCase() + period.slice(1)} leaderboard reset complete`,
        {
          description: `${data.awarded} winner${data.awarded === 1 ? "" : "s"} · ${data.totalDistributed} pts distributed`,
        }
      );
      await loadHistory();
      router.refresh();
    } catch (err) {
      toast.error(`${period} reset failed`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResetting(null);
    }
  };

  const distributionField = (
    period: Period,
    winnerCount: number,
    distribution: number[]
  ) => {
    const key = `${period}_distribution` as keyof Values;
    const updated = (next: number[]) => set(key, next as never);
    const sized = [...distribution];
    while (sized.length < winnerCount) sized.push(0);
    sized.length = winnerCount;
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400">
          Per-rank distribution ({winnerCount} rank{winnerCount === 1 ? "" : "s"}):
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sized.map((amt, i) => (
            <div key={i} className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-400">
                #{i + 1}
              </span>
              <input
                type="number"
                min={0}
                value={amt}
                onChange={(e) => {
                  const copy = [...sized];
                  copy[i] = parseInt(e.target.value) || 0;
                  updated(copy);
                }}
                disabled={!canEdit}
                className="w-full pl-8 pr-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 tabular-nums">
          Sum: {sized.reduce((a, b) => a + b, 0).toLocaleString()} pts (target pool:{" "}
          {Number(v[`${period}_prize` as keyof Values] ?? 0).toLocaleString()} pts)
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!v.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            disabled={!canEdit}
            className="rounded bg-slate-800 border-slate-600 text-emerald-500"
          />
          <span className="text-white font-medium">Leaderboard enabled</span>
        </label>

        <Field label="Ranking Metric">
          <select
            value={v.metric as string}
            onChange={(e) => set("metric", e.target.value as never)}
            disabled={!canEdit}
            className={inp}
          >
            <option value="COMBINED">
              Combined (mix of all 4 — recommended)
            </option>
            <option value="POINTS_EARNED">Points Earned</option>
            <option value="TASKS_COMPLETED">Tasks Completed</option>
            <option value="REFERRALS">Referrals</option>
            <option value="XP_EARNED">XP Earned</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Combined ranks each user by the average of their percentile across
            Points, XP, Tasks, and Team — so being well-rounded matters.
          </p>
        </Field>

        {(["daily", "weekly", "monthly"] as const).map((period) => {
          const prizeKey = `${period}_prize` as keyof Values;
          const winnersKey = `${period}_winners` as keyof Values;
          const distributionKey = `${period}_distribution` as keyof Values;
          const winnerCount = Number(v[winnersKey] ?? 1);
          return (
            <div
              key={period}
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white capitalize">
                  {period} Leaderboard
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Total Prize Pool (pts)">
                  <input
                    type="number"
                    min={0}
                    value={Number(v[prizeKey] ?? 0)}
                    onChange={(e) =>
                      set(prizeKey as never, (parseInt(e.target.value) || 0) as never)
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field label="Number of Winners">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={winnerCount}
                    onChange={(e) =>
                      set(
                        winnersKey as never,
                        Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) as never
                      )
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              {distributionField(
                period,
                winnerCount,
                (v[distributionKey] as number[]) ?? []
              )}
            </div>
          );
        })}

        <Field label="Minimum entries to publish leaderboard">
          <input
            type="number"
            min={1}
            value={Number(v.min_entries ?? 5)}
            onChange={(e) => set("min_entries", parseInt(e.target.value) || 5)}
            disabled={!canEdit}
            className={inp}
          />
        </Field>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={save}
            disabled={!canEdit || busy}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>

      {/* Plan eligibility */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1 inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Prize Eligibility
          </h2>
          <p className="text-sm text-slate-400">
            Which plans can actually claim prizes? Users on excluded plans
            still appear on the leaderboard with their rank, but the reset
            skips them when picking winners.
          </p>
        </div>

        <PlanEligibilityPicker
          packages={packages}
          selected={(v.eligible_packages as string[]) ?? []}
          onChange={(next) => set("eligible_packages", next)}
          disabled={!canEdit}
        />
      </div>

      {/* Gift items editor */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1 inline-flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" />
            Gift Items
          </h2>
          <p className="text-sm text-slate-400">
            Optional physical/digital prizes per rank — mobile, gadget, tour
            package, etc. Shown alongside point + XP rewards on the standings
            page.
          </p>
        </div>

        <GiftItemsEditor
          items={(v.gift_items as GiftItem[]) ?? []}
          onChange={(next) => set("gift_items", next)}
          disabled={!canEdit}
        />
      </div>

      {/* Reset controls — Manual + Automatic side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manual */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-1 inline-flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-400" />
            Manual Reset
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Trigger a reset right now. Each one selects winners, credits
            prizes, and snapshots a history row.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => triggerReset(p)}
                disabled={!canEdit || resetting !== null}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  p === "daily"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                    : p === "weekly"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20"
                }`}
              >
                {resetting === p ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : p === "monthly" ? (
                  <Trophy className="w-4 h-4" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Reset {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Automatic */}
        <div
          className={`rounded-xl border p-6 transition-colors ${
            v.auto_reset
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-slate-900 border-slate-800"
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              Automatic Reset
            </h2>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                v.auto_reset
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/30"
              }`}
            >
              {v.auto_reset ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Enabled
                </>
              ) : (
                <>
                  <CircleSlash className="w-3 h-3" />
                  Disabled
                </>
              )}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1 mb-4">
            When enabled, leaderboards reset on schedule (daily 00:00, weekly
            Mon 00:00, monthly 1st 00:00) and prize distribution runs
            automatically. Disable to require manual resets only.
          </p>

          {/* Switch-style toggle */}
          <label
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              canEdit
                ? "border-slate-700 bg-slate-950 hover:border-slate-600"
                : "border-slate-800 bg-slate-950 opacity-60 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              checked={!!v.auto_reset}
              onChange={(e) => set("auto_reset", e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <span
              className="relative w-11 h-6 rounded-full bg-slate-700 peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                Auto-reset on schedule
              </p>
              <p className="text-[11px] text-slate-500 inline-flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Recommended for production
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Past winners */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-1 inline-flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          Past Winners
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Last 10 cycles across all periods.
        </p>
        {historyLoading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : cycles.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center border border-dashed border-slate-800 rounded-lg">
            No past cycles yet. Run a reset to record one.
          </div>
        ) : (
          <div className="space-y-3">
            {cycles.map((c) => (
              <details
                key={c.cycleId}
                className="rounded-lg border border-slate-800 bg-slate-950"
              >
                <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-900 transition-colors">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                        c.period === "daily"
                          ? "bg-amber-500/10 text-amber-400"
                          : c.period === "weekly"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-purple-500/10 text-purple-400"
                      }`}
                    >
                      {c.period}
                    </span>
                    <span className="text-sm text-white">
                      {format(new Date(c.cycledAt), "PP p")}
                    </span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {(c.winners?.length ?? 0)} winner{c.winners?.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="text-amber-400 text-sm font-bold tabular-nums">
                    {(c.totalPrize ?? 0).toLocaleString()} pts
                  </span>
                </summary>
                <div className="border-t border-slate-800 p-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="text-left pb-2">Rank</th>
                        <th className="text-left pb-2">User</th>
                        <th className="text-right pb-2">{c.metric.replace(/_/g, " ")}</th>
                        <th className="text-right pb-2">Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(c.winners ?? []).map((w) => (
                        <tr key={w.userId} className="border-t border-slate-800">
                          <td className="py-1.5 text-amber-400 font-bold">
                            #{w.rank}
                          </td>
                          <td className="py-1.5 text-white">{w.name}</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">
                            {w.value.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-emerald-400 font-semibold tabular-nums">
                            +{w.prize.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function GiftItemsEditor({
  items,
  onChange,
  disabled,
}: {
  items: GiftItem[];
  onChange: (next: GiftItem[]) => void;
  disabled?: boolean;
}) {
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const nextRank =
    sorted.length === 0 ? 1 : Math.max(...sorted.map((i) => i.rank)) + 1;

  const update = (rank: number, patch: Partial<GiftItem>) => {
    onChange(items.map((i) => (i.rank === rank ? { ...i, ...patch } : i)));
  };

  const remove = (rank: number) => {
    onChange(items.filter((i) => i.rank !== rank));
  };

  const add = () => {
    onChange([...items, { rank: nextRank, giftName: "", giftImage: "" }]);
  };

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-center text-xs text-slate-500">
          No gift items configured. Add one below to attach a physical or
          digital prize to a rank.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <div
              key={item.rank}
              className="rounded-lg border border-slate-700 bg-slate-950 p-3 flex items-start gap-3"
            >
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Rank
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={item.rank}
                  disabled={disabled}
                  onChange={(e) =>
                    update(item.rank, {
                      rank: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm font-bold text-white text-center tabular-nums focus:outline-none focus:border-blue-500"
                />
              </div>
              <GiftThumbnailUploader
                value={item.giftImage}
                onChange={(url) => update(item.rank, { giftImage: url })}
                disabled={disabled}
              />
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={item.giftName}
                  disabled={disabled}
                  onChange={(e) =>
                    update(item.rank, { giftName: e.target.value })
                  }
                  placeholder="Gift name (e.g. iPhone 15 Pro)"
                  className={inp}
                />
                <input
                  type="url"
                  value={item.giftImage ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    update(item.rank, { giftImage: e.target.value })
                  }
                  placeholder="…or paste image URL"
                  className={`${inp} font-mono text-xs`}
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(item.rank)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                title="Remove gift"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-700 hover:border-amber-500/50 text-sm text-slate-400 hover:text-amber-300 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        Add gift for rank #{nextRank}
      </button>
    </div>
  );
}

function PlanEligibilityPicker({
  packages,
  selected,
  onChange,
  disabled,
}: {
  packages: PackageOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected.map((s) => s.toUpperCase()));
  const toggle = (slug: string) => {
    const upper = slug.toUpperCase();
    const next = selectedSet.has(upper)
      ? selected.filter((s) => s.toUpperCase() !== upper)
      : [...selected, upper];
    onChange(next);
  };

  // Always include the standard tier set (Free + paid tiers) so the admin
  // can configure eligibility even when the Package table is sparse / missing
  // rows / has rows toggled inactive. Any matching DB row takes precedence.
  const STANDARD_TIERS: PackageOption[] = [
    { id: "free-default", slug: "FREE", name: "Free" },
    { id: "starter-default", slug: "STARTER", name: "Starter" },
    { id: "pro-default", slug: "PRO", name: "Pro" },
    { id: "elite-default", slug: "ELITE", name: "Elite" },
    { id: "vip-default", slug: "VIP", name: "VIP" },
  ];
  const optionList = (() => {
    const seen = new Set(packages.map((p) => p.slug.toUpperCase()));
    const list = [...packages];
    for (const fallback of STANDARD_TIERS) {
      if (!seen.has(fallback.slug.toUpperCase())) {
        list.push(fallback);
      }
    }
    // Sort: standard tier order first, then any remaining custom plans
    const order = new Map(
      STANDARD_TIERS.map((t, i) => [t.slug.toUpperCase(), i])
    );
    list.sort((a, b) => {
      const ai = order.get(a.slug.toUpperCase()) ?? 999;
      const bi = order.get(b.slug.toUpperCase()) ?? 999;
      return ai - bi;
    });
    return list;
  })();

  if (optionList.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-center text-xs text-slate-500">
        No active packages found. Create packages first to control eligibility.
      </div>
    );
  }

  const selectAll = () =>
    onChange(optionList.map((p) => p.slug.toUpperCase()));
  const clearAll = () => onChange([]);
  const allSelected = optionList.every((p) =>
    selectedSet.has(p.slug.toUpperCase())
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="inline-flex items-center gap-2 text-xs text-slate-400">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold tabular-nums">
            {selectedSet.size}
          </span>
          /
          <span className="tabular-nums">{optionList.length}</span>
          <span>plan{optionList.length === 1 ? "" : "s"} selected</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || allSelected}
            onClick={selectAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Select all
          </button>
          <button
            type="button"
            disabled={disabled || selectedSet.size === 0}
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CircleSlash className="w-3.5 h-3.5" />
            Clear all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
        {optionList.map((p) => {
        const active = selectedSet.has(p.slug.toUpperCase());
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(p.slug)}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 ${
              active
                ? "border-emerald-500/50 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950 hover:border-slate-600"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-sm font-bold truncate ${
                  active ? "text-emerald-200" : "text-slate-200"
                }`}
              >
                {p.name}
              </p>
              <p className="text-[10px] text-slate-500 font-mono uppercase">
                {p.slug}
              </p>
            </div>
            <span
              className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                active
                  ? "border-emerald-400 bg-emerald-500/20"
                  : "border-slate-600"
              }`}
            >
              {active && (
                <span className="block w-2 h-2 rounded-sm bg-emerald-300" />
              )}
            </span>
          </button>
        );
      })}
      </div>
    </>
  );
}

function GiftThumbnailUploader({
  value,
  onChange,
  disabled,
}: {
  value: string | undefined;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const url = d.cloudFrontUrl || d.url || d.s3Url;
      if (!url) throw new Error("Upload returned no URL");
      onChange(url);
      toast.success("Gift image uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      title={value ? "Click to replace image" : "Click or drag to upload"}
      className={`relative w-14 h-14 rounded-lg shrink-0 overflow-hidden border-2 transition-colors ${
        dragOver
          ? "border-amber-400 bg-amber-500/10"
          : value
          ? "border-slate-700 bg-slate-900 hover:border-amber-500/60"
          : "border-dashed border-slate-700 bg-slate-900 hover:border-amber-500/50"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {value ? (
        <SmartImage src={value} alt="" fill sizes="56px" className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Gift className="w-5 h-5 text-slate-600" />
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      )}
      {!busy && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors opacity-0 hover:opacity-100">
          <Upload className="w-4 h-4 text-white drop-shadow" />
        </div>
      )}
    </button>
  );
}
