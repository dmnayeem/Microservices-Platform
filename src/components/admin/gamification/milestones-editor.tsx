"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { REWARD_MAX_POINTS, type MilestoneRewardOverrides } from "@/lib/reward-config";

export interface MilestoneRow {
  id: string;
  title: string;
  description: string;
  category: string;
  /** The built-in reward — what "reset" goes back to. */
  defaultPoints: number;
  points: number;
  enabled: boolean;
  /** Claims recorded so far, so an admin sees who a change affects. */
  claims: number;
}

const inp =
  "w-28 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white text-right tabular-nums focus:outline-none focus:border-emerald-500 disabled:opacity-50";

export function MilestonesEditor({
  rows: initialRows,
  referralDeferToLadder: initialDefer,
  ladderActive,
  canEdit,
}: {
  rows: MilestoneRow[];
  referralDeferToLadder: boolean;
  /** Is the referral milestone ladder (Referrals → Bonuses) paying right now? */
  ladderActive: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [defer, setDefer] = useState(initialDefer);
  const [busy, setBusy] = useState(false);

  const invalid = rows.filter(
    (r) =>
      !Number.isInteger(r.points) || r.points < 0 || r.points > REWARD_MAX_POINTS
  );

  const update = (id: string, patch: Partial<MilestoneRow>) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    if (invalid.length) return;
    setBusy(true);
    try {
      // Only what differs from the built-in value is stored, so a milestone
      // nobody touched keeps following the code default.
      const rewards: MilestoneRewardOverrides = {};
      for (const r of rows) {
        const o: { points?: number; enabled?: boolean } = {};
        if (r.points !== r.defaultPoints) o.points = r.points;
        if (!r.enabled) o.enabled = false;
        if (Object.keys(o).length) rewards[r.id] = o;
      }
      const res = await fetch("/api/admin/gamification/rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "milestones",
          value: { rewards, referralDeferToLadder: defer },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Milestones saved", {
        description: "New figures apply to the next claim. Rewards already paid are not changed.",
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        One-time rewards a user claims on <span className="text-slate-200">/milestones</span>{" "}
        once they reach the target. Each can be claimed once per user. Switching one
        off hides it from users who have not claimed it and stops new claims.
      </div>

      {/* Referral overlap */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Referral milestones overlap the referral ladder
        </p>
        <p className="text-xs leading-relaxed text-slate-400">
          &ldquo;First Referral&rdquo;, &ldquo;Influencer&rdquo; and &ldquo;Network King&rdquo; below
          pay for the number of people a user referred. The referral milestone ladder
          (Referrals → Bonuses &amp; milestones) also pays for referral counts, under a
          different ledger entry — with both on, one referrer is paid by both. The ladder
          is currently{" "}
          <strong className={ladderActive ? "text-amber-300" : "text-slate-300"}>
            {ladderActive ? "ON" : "off"}
          </strong>
          .
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={defer}
            disabled={!canEdit}
            onChange={(e) => setDefer(e.target.checked)}
          />
          <span>
            Switch the three referral milestones off while the referral ladder is on
            <span className="block text-xs text-slate-500">
              Off (today&apos;s behaviour): both pay. Already-claimed rewards are never
              taken back.
            </span>
          </span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Milestone</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Points</th>
              <th className="px-4 py-2 text-right">Claimed</th>
              <th className="px-4 py-2 text-center">On</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = invalid.includes(r);
              return (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-200">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.description} · <code>{r.id}</code>
                    </p>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.category}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={REWARD_MAX_POINTS}
                        step={1}
                        value={Number.isFinite(r.points) ? r.points : ""}
                        disabled={!canEdit}
                        onChange={(e) => update(r.id, { points: Number(e.target.value) })}
                        className={`${inp} ${bad ? "border-red-500" : ""}`}
                      />
                      {r.points !== r.defaultPoints && canEdit && (
                        <button
                          type="button"
                          title={`Back to ${r.defaultPoints.toLocaleString()}`}
                          onClick={() => update(r.id, { points: r.defaultPoints })}
                          className="text-slate-500 hover:text-white"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {r.points !== r.defaultPoints && (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        built-in {r.defaultPoints.toLocaleString()}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                    {r.claims.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      disabled={!canEdit}
                      onChange={(e) => update(r.id, { enabled: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invalid.length > 0 && (
        <p className="text-xs text-red-400">
          Points must be a whole number from 0 to {REWARD_MAX_POINTS.toLocaleString()}.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={save}
          disabled={busy || invalid.length > 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save milestones
        </button>
      )}
    </div>
  );
}
