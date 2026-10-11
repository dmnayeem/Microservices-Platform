"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import type { LevelRewardsConfig } from "@/lib/level-rewards";

/**
 * The level reward ladder: which levels pay, and how many points. Each pays
 * once per account; the claimed counts show how many people took it.
 */
export function LevelRewardsEditor({
  initial,
  claims,
  usersAt,
  canEdit,
}: {
  initial: LevelRewardsConfig;
  /** level → accounts that claimed it. */
  claims: Record<number, number>;
  /** level → accounts at or above it (could claim). */
  usersAt: Record<number, number>;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rows, setRows] = useState(initial.rows.map((r) => ({ level: String(r.level), points: String(r.points) })));
  const [saving, setSaving] = useState(false);
  const inp =
    "w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60";

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gamification/level-rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          rows: rows.map((r) => ({ level: Number(r.level), points: Number(r.points) })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      setRows(d.value.rows.map((r: { level: number; points: number }) => ({ level: String(r.level), points: String(r.points) })));
      toast.success("Level rewards saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Level rewards</h2>
          <p className="mt-1 text-sm text-slate-400">
            Points a user claims when they reach a level — once per level, per account. Users are told with a
            celebration popup when they reach a level that has a reward, and claim it on /level-rewards (also shown
            on the Rank tab). The level only rises with XP from real work.
          </p>
        </div>
        <label className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
          On
        </label>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-slate-500">No levels yet — add one (for example level 3).</p>}
        {rows.map((r, i) => {
          const lv = Number(r.level);
          return (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 p-3">
              <label className="text-xs text-slate-400">
                Level
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={r.level}
                  disabled={!canEdit}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}
                  className={`${inp} ml-2`}
                />
              </label>
              <label className="text-xs text-slate-400">
                Points
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={r.points}
                  disabled={!canEdit}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))}
                  className={`${inp} ml-2`}
                />
              </label>
              <span className="text-xs text-slate-500">
                {claims[lv] ?? 0} claimed · {usersAt[lv] ?? 0} at this level or above
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const last = rows.length ? Number(rows[rows.length - 1]!.level) || 1 : 1;
              setRows((rs) => [...rs, { level: String(Math.max(3, last + 2)), points: "100" }]);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add level
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      )}
    </div>
  );
}
