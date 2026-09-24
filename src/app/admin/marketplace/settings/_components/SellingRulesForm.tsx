"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Layers, Clock, Info, Receipt } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";
import type {
  PayoutHoldConfig,
  MarketplaceTaxConfig,
} from "@/lib/marketplace-selling";

interface Props {
  licenseTiersEnabled: boolean;
  payoutHold: PayoutHoldConfig;
  tax: MarketplaceTaxConfig;
  heldNow: { count: number; amount: number };
  canEdit: boolean;
}

export function SellingRulesForm({
  licenseTiersEnabled,
  payoutHold,
  tax,
  heldNow,
  canEdit,
}: Props) {
  const router = useRouter();
  const [tiers, setTiers] = useState(licenseTiersEnabled);
  const [holdOn, setHoldOn] = useState(payoutHold.enabled);
  const [days, setDays] = useState(String(payoutHold.days));
  const [taxOn, setTaxOn] = useState(tax.enabled);
  const [taxPct, setTaxPct] = useState(String(tax.pct));
  const [taxLabel, setTaxLabel] = useState(tax.label);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const d = parseInt(days, 10);
    const pct = Number(taxPct);
    if (taxOn && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast.error("Tax rate must be between 0 and 100");
      return;
    }
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
          tax: {
            enabled: taxOn,
            pct: Number.isFinite(pct) ? pct : tax.pct,
            label: taxLabel.trim() || "VAT",
          },
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
          All three are off by default. With them off the marketplace behaves
          exactly as it did before they existed.
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

      {/* Tax on the commission */}
      <div className="border-t border-slate-800 pt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={taxOn}
            disabled={!canEdit}
            onChange={(e) => setTaxOn(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white font-medium inline-flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Tax on your commission
            </span>
            <span className="block text-slate-400 mt-0.5">
              Charged on the commission you earn, not on the goods — the sale itself
              is the seller’s own tax affair. Added on top of the price, so a $10 sale
              at 20% commission and 15% tax costs the buyer $10.30, the seller still
              receives $8, and $0.30 is yours to remit.
            </span>
            <span className="block text-slate-500 text-xs mt-1">
              Separate from the deposit VAT and the advertiser invoice tax on purpose:
              changing one of those should not silently change what every marketplace
              buyer pays.
            </span>
          </span>
        </label>

        {taxOn && (
          <div className="pl-7 flex flex-wrap items-center gap-2">
            <input
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
              disabled={!canEdit}
              placeholder="VAT"
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
            />
            <span className="text-sm text-slate-400">at</span>
            <input
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              disabled={!canEdit}
              inputMode="decimal"
              className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
            />
            <span className="text-sm text-slate-400">% of the commission</span>
          </div>
        )}

        <p className="pl-7 text-xs text-slate-500">
          Collected tax is reported separately in Finance and is never counted as
          revenue — it is money you hold for someone else.
        </p>
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
