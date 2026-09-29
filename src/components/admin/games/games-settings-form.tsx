"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { GAMES_BOUNDS } from "@/lib/game-settings-bounds";

export interface GamesSettingsValues {
  enabled: boolean;
  maxPointsPerTick: number;
  minTickSeconds: number;
  globalDailyCap: number;
  maxPerSession: number;
}

type NumKey = Exclude<keyof GamesSettingsValues, "enabled">;

const FIELDS: { key: NumKey; label: string; hint: string; unit: string }[] = [
  {
    key: "maxPointsPerTick",
    label: "Max points per tick",
    hint: "Ceiling on any single game's points-per-tick. A game set higher pays this.",
    unit: "points",
  },
  {
    key: "minTickSeconds",
    label: "Shortest tick",
    hint: "Floor on any game's tick length — the real rate limiter. A game set shorter waits this long.",
    unit: "seconds",
  },
  {
    key: "globalDailyCap",
    label: "Daily cap across all games",
    hint: "Points one user may earn per local day from every game combined. 0 = no cap.",
    unit: "points / day",
  },
  {
    key: "maxPerSession",
    label: "Max points per session",
    hint: "Points one user may earn in one play session, whatever the game says. 0 = no cap.",
    unit: "points",
  },
];

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500 disabled:opacity-50";

export function GamesSettingsForm({
  initial,
  defaults,
  canEdit,
}: {
  initial: GamesSettingsValues;
  defaults: GamesSettingsValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  const errorFor = (k: NumKey): string | null => {
    const n = v[k];
    const b = GAMES_BOUNDS[k];
    if (!Number.isInteger(n)) return "Whole number";
    if (n < b.min || n > b.max) return `${b.min.toLocaleString()}–${b.max.toLocaleString()}`;
    return null;
  };
  const hasError = FIELDS.some((f) => errorFor(f.key));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Game settings saved");
      router.refresh();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Game earning guardrails</h2>
          <p className="text-sm text-slate-400">
            Each game sets its own reward; these are the platform-wide limits every game is
            clamped to, so one mistyped game cannot drain points.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={v.enabled}
            disabled={!canEdit}
            onChange={(e) => setV((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <span>
            Pay points for playing games
            <span className="block text-xs text-slate-500">
              Master switch. Off stops earning in every game, whatever each game is set to.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => {
            const err = errorFor(f.key);
            return (
              <label key={f.key} className="block text-sm text-slate-300">
                {f.label}{" "}
                <span className="text-xs text-slate-500">({f.unit})</span>
                <input
                  type="number"
                  step={1}
                  min={GAMES_BOUNDS[f.key].min}
                  max={GAMES_BOUNDS[f.key].max}
                  value={Number.isFinite(v[f.key]) ? v[f.key] : ""}
                  disabled={!canEdit}
                  onChange={(e) => setV((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                  className={`${inp} mt-1 ${err ? "border-red-500" : ""}`}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {f.hint} Default {defaults[f.key].toLocaleString()}.
                </span>
                {err && <span className="block text-xs text-red-400">Must be {err}.</span>}
              </label>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || hasError}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
          <button
            type="button"
            onClick={() => setV(defaults)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" /> Defaults
          </button>
        </div>
      )}
    </div>
  );
}
