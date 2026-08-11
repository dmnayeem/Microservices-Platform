"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Percent, Scale } from "lucide-react";
import { toast } from "@/lib/toast";
import type { MediationConfig } from "@/lib/marketplace-mediation";

export function MediationFeeForm({
  initial,
  canEdit,
}: {
  initial: MediationConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [feeBps, setFeeBps] = useState(String(initial.feeBps));
  const [busy, setBusy] = useState(false);
  const n = parseInt(feeBps, 10);
  const pct = Number.isFinite(n) ? `${(n / 100).toFixed(2)}%` : "—";

  const save = async () => {
    const bps = parseInt(feeBps, 10);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10000) {
      toast.error("Fee must be 0–10000 bps");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketplace/mediation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, feeBps: bps }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Mediation fee saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
      <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
        <Scale className="w-4 h-4 text-amber-400" />
        Admin mediation fee
      </h2>
      <p className="text-xs text-slate-400">
        Charged (on top, paid by the buyer) when a deal is admin-mediated — either
        chosen up front or when a deal is escalated to an admin. Goes to the platform.
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canEdit}
        />
        Allow admin-mediated deals
      </label>

      <div className="flex items-center gap-3 max-w-sm">
        <div className="relative flex-1">
          <input
            type="number"
            value={feeBps}
            onChange={(e) => setFeeBps(e.target.value)}
            min={0}
            max={10000}
            step={10}
            disabled={!canEdit || !enabled}
            className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 tabular-nums disabled:opacity-50"
          />
          <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        </div>
        <span className="text-xs text-slate-400 font-mono tabular-nums w-20 text-right">{pct}</span>
      </div>

      {canEdit && (
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save mediation fee
          </button>
        </div>
      )}
    </section>
  );
}
