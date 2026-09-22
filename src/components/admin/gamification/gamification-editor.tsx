"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { XP_SOURCES } from "@/lib/xp-sources";

interface Curve {
  thresholds: number[];
  step: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  type: string;
  threshold: number;
  pointsReward: number;
  xpReward: number;
  isActive: boolean;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500";

/** The achievement `type` values the unlock engine understands. */
const TYPES = [
  { id: "TASKS_COMPLETED", label: "Tasks completed" },
  { id: "POINTS_EARNED", label: "Points earned" },
  { id: "REFERRALS", label: "Referrals made" },
  { id: "STREAK", label: "Day streak" },
  { id: "LEVEL", label: "Level reached" },
];

export function GamificationEditor({
  curve,
  achievements,
  levelSpread,
  canEdit,
}: {
  curve: Curve;
  achievements: Achievement[];
  levelSpread: { level: number; users: number }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<number[]>(curve.thresholds);
  const [step, setStep] = useState<number>(curve.step);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Achievement[]>(achievements);

  const usersAt = (level: number) =>
    levelSpread.find((l) => l.level === level)?.users ?? 0;

  /* The one rule the curve must obey. A flat or falling step makes "what level
     is this XP" ambiguous — a user would satisfy two levels at once — so it is
     checked here, in the save route, and again when the value is read back. */
  const firstBreak = (() => {
    let last = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!Number.isFinite(rows[i]) || rows[i] <= last) return i;
      last = rows[i];
    }
    return -1;
  })();
  const curveValid = firstBreak === -1 && step > 0;

  const saveCurve = async () => {
    if (!curveValid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gamification/level-curve", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds: rows, step }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Level curve saved", {
        description:
          "Nobody is demoted by a change here — levels only ever rise. Run the level backfill to raise anyone the new curve has moved up.",
      });
      router.refresh();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const saveAchievement = async (a: Achievement) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gamification/achievements", {
        method: a.id.startsWith("new-") ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Saved");
      router.refresh();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const removeAchievement = async (a: Achievement) => {
    if (a.id.startsWith("new-")) {
      setList((l) => l.filter((x) => x.id !== a.id));
      return;
    }
    const ok = await confirmDialog({
      title: `Delete "${a.name}"?`,
      description:
        "Users who already unlocked it keep their record. If anyone has, it is switched off instead of deleted — that stops new unlocks and leaves the history readable.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/gamification/achievements?id=${encodeURIComponent(a.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Deleted");
      router.refresh();
    } catch (e) {
      toast.error("Could not delete", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, p: Partial<Achievement>) =>
    setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="space-y-6">
      {/* ── The curve ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white">XP per level</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Total XP to REACH each level, counted from zero. Level 1 is always
            0. Each figure must be larger than the one above it.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="text-left px-4 py-2">Level</th>
                <th className="text-left px-4 py-2">Total XP to reach it</th>
                <th className="text-right px-4 py-2">Costs from the one below</th>
                <th className="text-right px-4 py-2">Users here now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr>
                <td className="px-4 py-2 font-semibold text-white">1</td>
                <td className="px-4 py-2 text-slate-500">0 — everyone starts here</td>
                <td className="px-4 py-2 text-right text-slate-600">—</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                  {usersAt(1)}
                </td>
              </tr>
              {rows.map((v, i) => (
                <tr key={i} className={i === firstBreak ? "bg-red-500/5" : ""}>
                  <td className="px-4 py-2 font-semibold text-white">{i + 2}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={1}
                      value={Number.isFinite(v) ? v : ""}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setRows((r) => r.map((x, j) => (j === i ? n : x)));
                      }}
                      className={`${inp} max-w-[160px]`}
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                    {(v - (i === 0 ? 0 : rows[i - 1])).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                    {usersAt(i + 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {firstBreak !== -1 && (
          <p className="px-4 py-2.5 text-xs text-red-300 border-t border-slate-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Level {firstBreak + 2} is not higher than the level below it. A
              curve that does not climb makes &quot;what level is this XP&quot;
              ambiguous — a user would be two levels at once — so this will not
              save until it is fixed.
            </span>
          </p>
        )}

        <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Every level after {rows.length + 1} costs
            </label>
            <input
              type="number"
              min={1}
              value={step}
              disabled={!canEdit}
              onChange={(e) => setStep(Number(e.target.value))}
              className={`${inp} max-w-[180px]`}
            />
          </div>
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => setRows((r) => [...r, (r[r.length - 1] ?? 0) + step])}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add a level
          </button>
          {rows.length > 1 && (
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => setRows((r) => r.slice(0, -1))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50"
            >
              Remove the last
            </button>
          )}
          <button
            type="button"
            disabled={!canEdit || busy || !curveValid}
            onClick={saveCurve}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save curve
          </button>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-slate-600 border-t border-slate-800">
          Raising a threshold never demotes anyone — a stored level only ever
          climbs, because taking back a level somebody was already told they had
          is a broken promise rather than a correction. Lowering one does not
          promote anyone by itself either: run{" "}
          <code className="text-slate-400">scripts/backfill-levels.ts</code> to
          raise everyone the new curve has moved up.
        </p>
      </section>

      {/* ── Achievements ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Achievements</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              What unlocks, at what number, and what it pays.
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() =>
              setList((l) => [
                {
                  id: `new-${Date.now()}`,
                  name: "",
                  description: "",
                  type: "TASKS_COMPLETED",
                  threshold: 10,
                  pointsReward: 0,
                  xpReward: 0,
                  isActive: true,
                },
                ...l,
              ])
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>

        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">
            No achievements yet. Add one and it starts unlocking for users who
            already meet it.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {list.map((a) => (
              <div key={a.id} className="p-4 grid gap-3 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Name
                  </label>
                  <input
                    value={a.name}
                    disabled={!canEdit}
                    onChange={(e) => patch(a.id, { name: e.target.value })}
                    className={inp}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Unlocks on
                  </label>
                  <select
                    value={a.type}
                    disabled={!canEdit}
                    onChange={(e) => patch(a.id, { type: e.target.value })}
                    className={inp}
                  >
                    {TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Reaching
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={a.threshold}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(a.id, { threshold: Number(e.target.value) })
                    }
                    className={inp}
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Points
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={a.pointsReward}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(a.id, { pointsReward: Number(e.target.value) })
                    }
                    className={inp}
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    XP
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={a.xpReward}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(a.id, { xpReward: Number(e.target.value) })
                    }
                    className={inp}
                  />
                </div>
                <div className="lg:col-span-2 flex items-end gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 mr-auto">
                    <input
                      type="checkbox"
                      checked={a.isActive}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(a.id, { isActive: e.target.checked })
                      }
                    />
                    On
                  </label>
                  <button
                    type="button"
                    disabled={!canEdit || busy || !a.name.trim()}
                    onClick={() => saveAchievement(a)}
                    title={!a.name.trim() ? "Needs a name" : "Save"}
                    className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => removeAchievement(a)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="lg:col-span-12">
                  <input
                    value={a.description ?? ""}
                    disabled={!canEdit}
                    placeholder="What the user is told when it unlocks"
                    onChange={(e) =>
                      patch(a.id, { description: e.target.value })
                    }
                    className={inp}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Where XP comes from ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white">What raises a level</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every way XP is awarded. This is a reference, not a control — each
            figure is set where the last column says, and a table that looked
            editable but was not would be worse than no table.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="text-left px-4 py-2">The user does this</th>
                <th className="text-left px-4 py-2">How much</th>
                <th className="text-left px-4 py-2">Change it where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {XP_SOURCES.map((s) => (
                <tr key={s.where + s.label} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">
                    {s.label}
                    <span className="block text-[11px] text-slate-600 font-mono">
                      {s.where}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400">{s.amount}</td>
                  <td className="px-4 py-2 text-slate-400">{s.configurable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
