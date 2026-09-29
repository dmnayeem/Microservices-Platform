"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  DAILY_REWARD_DEFAULTS,
  SOLO_REWARD_DEFAULTS,
  validateDailyRewardConfig,
  validateSoloRewardConfig,
  type DailyRewardConfig,
  type SoloRewardConfig,
} from "@/lib/reward-config";

const inp =
  "w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500 disabled:opacity-50";

async function put(kind: "daily" | "solo", value: unknown) {
  const res = await fetch("/api/admin/gamification/rewards", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, value }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
}

export function DailySoloRewardsEditor({
  daily: initialDaily,
  solo: initialSolo,
  canEdit,
}: {
  daily: DailyRewardConfig;
  solo: SoloRewardConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [daily, setDaily] = useState(initialDaily);
  const [solo, setSolo] = useState(initialSolo);
  const [busy, setBusy] = useState<"daily" | "solo" | null>(null);

  const dailyCheck = validateDailyRewardConfig(daily);
  const soloCheck = validateSoloRewardConfig(solo);

  const save = async (kind: "daily" | "solo") => {
    setBusy(kind);
    try {
      await put(kind, kind === "daily" ? daily : solo);
      toast.success(kind === "daily" ? "Daily reward saved" : "Solo reward saved", {
        description: "Applies to the next claim. Nothing already paid changes.",
      });
      router.refresh();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const setDay = (i: number, patch: Partial<{ points: number; xp: number }>) =>
    setDaily((p) => ({
      ...p,
      days: p.days.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    }));

  const setBox = (i: number, patch: Partial<DailyRewardConfig["mysteryBox"][number]>) =>
    setDaily((p) => ({
      ...p,
      mysteryBox: p.mysteryBox.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    }));

  return (
    <div className="space-y-6">
      {/* Daily reward */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Daily check-in reward</h2>
          <p className="text-sm text-slate-400">
            Paid once per local day. The streak climbs day 1 → 7 and then starts the ladder
            again; a missed day resets it to day 1. XP is multiplied by the user&apos;s plan XP
            multiplier.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {daily.days.map((d, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400">Day {i + 1}</p>
              <label className="block text-[11px] text-slate-500">
                Points
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(d.points) ? d.points : ""}
                  disabled={!canEdit}
                  onChange={(e) => setDay(i, { points: Number(e.target.value) })}
                  className={inp}
                />
              </label>
              <label className="block text-[11px] text-slate-500">
                XP
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(d.xp) ? d.xp : ""}
                  disabled={!canEdit}
                  onChange={(e) => setDay(i, { xp: Number(e.target.value) })}
                  className={inp}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={daily.mysteryBoxEnabled}
              disabled={!canEdit}
              onChange={(e) => setDaily((p) => ({ ...p, mysteryBoxEnabled: e.target.checked }))}
            />
            Day 7 also opens a mystery box
          </label>
          <p className="text-xs text-slate-500">
            One outcome is picked at random (each equally likely), then a whole number between
            its minimum and maximum. Add the same outcome twice to make it twice as likely.
          </p>
          <div className="space-y-2">
            {daily.mysteryBox.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <label className="text-[11px] text-slate-500">
                  Gives
                  <select
                    value={o.type}
                    disabled={!canEdit}
                    onChange={(e) => setBox(i, { type: e.target.value as "points" | "xp" })}
                    className={inp}
                  >
                    <option value="points">Points</option>
                    <option value="xp">XP</option>
                  </select>
                </label>
                <label className="text-[11px] text-slate-500">
                  Min
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(o.min) ? o.min : ""}
                    disabled={!canEdit}
                    onChange={(e) => setBox(i, { min: Number(e.target.value) })}
                    className={inp}
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Max
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(o.max) ? o.max : ""}
                    disabled={!canEdit}
                    onChange={(e) => setBox(i, { max: Number(e.target.value) })}
                    className={inp}
                  />
                </label>
                <button
                  type="button"
                  title="Remove outcome"
                  disabled={!canEdit || daily.mysteryBox.length <= 1}
                  onClick={() =>
                    setDaily((p) => ({ ...p, mysteryBox: p.mysteryBox.filter((_, j) => j !== i) }))
                  }
                  className="mb-1.5 text-slate-500 hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {canEdit && daily.mysteryBox.length < 10 && (
            <button
              type="button"
              onClick={() =>
                setDaily((p) => ({
                  ...p,
                  mysteryBox: [...p.mysteryBox, { type: "points", min: 0, max: 0 }],
                }))
              }
              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <Plus className="h-3.5 w-3.5" /> Add outcome
            </button>
          )}
        </div>

        {!dailyCheck.ok && <p className="text-xs text-red-400">{dailyCheck.error}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save("daily")}
              disabled={busy !== null || !dailyCheck.ok}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save daily reward
            </button>
            <button
              type="button"
              onClick={() => setDaily(DAILY_REWARD_DEFAULTS)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" /> Built-in values
            </button>
          </div>
        )}
      </section>

      {/* Solo reward */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Solo reward</h2>
          <p className="text-sm text-slate-400">
            A once-a-day bonus a user unlocks by completing enough tasks and earning enough in
            their local day.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-400">
            Points paid
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(solo.points) ? solo.points : ""}
              disabled={!canEdit}
              onChange={(e) => setSolo((p) => ({ ...p, points: Number(e.target.value) }))}
              className={inp}
            />
          </label>
          <label className="text-xs text-slate-400">
            XP paid
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(solo.xp) ? solo.xp : ""}
              disabled={!canEdit}
              onChange={(e) => setSolo((p) => ({ ...p, xp: Number(e.target.value) }))}
              className={inp}
            />
          </label>
          <label className="text-xs text-slate-400">
            Tasks approved today
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(solo.tasksToday) ? solo.tasksToday : ""}
              disabled={!canEdit}
              onChange={(e) => setSolo((p) => ({ ...p, tasksToday: Number(e.target.value) }))}
              className={inp}
            />
          </label>
          <label className="text-xs text-slate-400">
            Earned today ($)
            <input
              type="number"
              min={0}
              step={0.01}
              value={Number.isFinite(solo.earningsToday) ? solo.earningsToday : ""}
              disabled={!canEdit}
              onChange={(e) => setSolo((p) => ({ ...p, earningsToday: Number(e.target.value) }))}
              className={inp}
            />
          </label>
        </div>
        {!soloCheck.ok && <p className="text-xs text-red-400">{soloCheck.error}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save("solo")}
              disabled={busy !== null || !soloCheck.ok}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "solo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save solo reward
            </button>
            <button
              type="button"
              onClick={() => setSolo(SOLO_REWARD_DEFAULTS)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" /> Built-in values
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
