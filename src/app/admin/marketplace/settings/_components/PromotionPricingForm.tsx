"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Megaphone, Save } from "lucide-react";
import type { PromoPackage } from "@/lib/promotion";

export function PromotionPricingForm({
  initial,
  canEdit,
}: {
  initial: PromoPackage[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<PromoPackage[]>(initial);
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<PromoPackage>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/marketplace/promotion-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages: rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setRows(d.packages ?? rows);
      toast.success("Promotion pricing saved");
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-indigo-400" />
          Promotion pricing
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          What sellers/tutors pay to feature a listing or course. Applies to both.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((p, i) => (
          <div
            key={p.id}
            className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end rounded-lg border border-slate-800 bg-slate-950 p-3"
          >
            <label className="text-xs text-slate-400 col-span-2 md:col-span-1">
              Label
              <input
                value={p.label}
                disabled={!canEdit}
                onChange={(e) => update(i, { label: e.target.value })}
                className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm"
              />
            </label>
            <label className="text-xs text-slate-400">
              Days
              <input
                type="number"
                min={1}
                value={p.days}
                disabled={!canEdit}
                onChange={(e) => update(i, { days: parseInt(e.target.value, 10) || 1 })}
                className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm tabular-nums"
              />
            </label>
            <label className="text-xs text-slate-400">
              Price ($)
              <input
                type="number"
                min={0}
                step={0.01}
                value={p.priceCash}
                disabled={!canEdit}
                onChange={(e) => update(i, { priceCash: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm tabular-nums"
              />
            </label>
            <label className="text-xs text-slate-400">
              Price (points)
              <input
                type="number"
                min={0}
                value={p.pricePoints}
                disabled={!canEdit}
                onChange={(e) => update(i, { pricePoints: parseInt(e.target.value, 10) || 0 })}
                className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm tabular-nums"
              />
            </label>
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save pricing
        </button>
      )}
    </div>
  );
}
