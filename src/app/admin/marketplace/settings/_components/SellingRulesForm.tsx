"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Layers, Clock, Info } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";
import type { PayoutHoldConfig } from "@/lib/marketplace-selling";

interface Props {
  licenseTiersEnabled: boolean;
  payoutHold: PayoutHoldConfig;
  heldNow: { count: number; amount: number };
  canEdit: boolean;
}

export function SellingRulesForm({
  licenseTiersEnabled,
  payoutHold,
  heldNow,
  canEdit,
}: Props) {
  const router = useRouter();
  const [tiers, setTiers] = useState(licenseTiersEnabled);
  const [holdOn, setHoldOn] = useState(payoutHold.enabled);
  const [days, setDays] = useState(String(payoutHold.days));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const d = parseInt(days, 10);
    if (holdOn && (!Number.isFinite(d) || d < 1 || d > 90)) {
      toast.error("Hold must be between 1 and 90 days");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketplace/selling-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseTiersEnabled: tiers,
          payoutHold: { enabled: holdOn, days: Number.isFinite(d) ? d : payoutHold.days },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      toast.success("Selling rules saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
      <div>
        <h2 className="text-white font-semibold">Selling rules</h2>
        <p className="text-slate-400 text-sm">
          Both are off by default. With them off the marketplace behaves exactly as it
          did before they existed.
        </p>
      </div>

      {/* Licence tiers */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={tiers}
          disabled={!canEdit}
          onChange={(e) => setTiers(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          <span className="text-white font-medium inline-flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            Licence tiers
          </span>
          <span className="block text-slate-400 mt-0.5">
            Lets a seller offer the same file at more than one price — a standard
            licence for one project, an extended one for products that get resold. The
            listing still advertises the cheapest tier.
          </span>
          <span className="block text-slate-500 text-xs mt-1">
            Switching this off later leaves existing tiers stored but unused: those
            listings fall back to their single price rather than becoming unbuyable.
          </span>
        </span>
      </label>

      {/* Payout hold */}
      <div className="border-t border-slate-800 pt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={holdOn}
            disabled={!canEdit}
            onChange={(e) => setHoldOn(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white font-medium inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              Hold seller payouts
            </span>
            <span className="block text-slate-400 mt-0.5">
              A seller is paid the moment a buyer clicks Buy today, so refunding means
              clawing money out of a balance they may already have withdrawn — whatever
              is missing is the platform&apos;s loss. Holding the money first means a
              refund inside the window reverses it instead.
            </span>
          </span>
        </label>

        {holdOn && (
          <div className="pl-7 flex items-center gap-2">
            <label className="text-sm text-slate-400">Hold for</label>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={!canEdit}
              inputMode="numeric"
              className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
            />
            <span className="text-sm text-slate-400">days after the sale</span>
          </div>
        )}

        {heldNow.count > 0 && (
          <p className="pl-7 text-xs text-amber-300/90 inline-flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            {usd(heldNow.amount)} across {heldNow.count} sale
            {heldNow.count === 1 ? "" : "s"} is waiting to be released. Switching the
            hold off does not release it early — the scheduler still pays each one when
            its own window ends.
          </p>
        )}
      </div>

      {canEdit && (
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-lg text-white text-sm font-medium"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save selling rules
        </button>
      )}
    </div>
  );
}
