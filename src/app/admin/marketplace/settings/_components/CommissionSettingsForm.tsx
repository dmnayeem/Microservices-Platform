"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Percent, Info } from "lucide-react";
import { toast } from "@/lib/toast";
import type { CommissionRatesConfig } from "@/lib/marketplace-commission";

interface Props {
  initial: CommissionRatesConfig;
  assetTypes: Array<{ slug: string; label: string }>;
  canEdit: boolean;
}

export function CommissionSettingsForm({ initial, assetTypes, canEdit }: Props) {
  const router = useRouter();
  const [defaultBps, setDefaultBps] = useState<string>(String(initial.default));
  const [byAssetType, setByAssetType] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const a of assetTypes) {
      const v = initial.byAssetType?.[a.slug];
      out[a.slug] = v !== undefined ? String(v) : "";
    }
    return out;
  });
  const [busy, setBusy] = useState(false);

  const setOverride = (slug: string, v: string) => {
    setByAssetType((prev) => ({ ...prev, [slug]: v }));
  };

  const save = async () => {
    const defNum = parseInt(defaultBps, 10);
    if (!Number.isFinite(defNum) || defNum < 0 || defNum > 10000) {
      toast.error("Default rate must be 0–10000 bps");
      return;
    }
    const byAt: Record<string, number> = {};
    for (const a of assetTypes) {
      const raw = byAssetType[a.slug];
      if (raw === "" || raw === undefined) continue;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        toast.error(`Invalid rate for ${a.label}`);
        return;
      }
      byAt[a.slug.toUpperCase()] = n;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketplace/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: defNum, byAssetType: byAt }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Commission settings saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-indigo-300 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-100/90 leading-relaxed">
          Rates are in <strong>basis points</strong> (1 bps = 0.01%). 500 bps =
          5%. Range 0–10000.
        </p>
      </div>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Default rate</h2>
        <p className="text-xs text-slate-400">
          Applied when neither the listing nor its asset type has an override.
        </p>
        <BpsInput
          value={defaultBps}
          onChange={setDefaultBps}
          disabled={!canEdit}
          allowEmpty={false}
        />
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">
          Per asset-type overrides
        </h2>
        <p className="text-xs text-slate-400">
          Leave blank to fall back to the default rate. Useful for charging
          higher commission on high-value categories (SaaS, FBA) or lower on
          commodity ones (domains, digital products).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {assetTypes.map((a) => (
            <div
              key={a.slug}
              className="rounded-lg border border-slate-700 bg-slate-950 p-3"
            >
              <p className="text-sm font-bold text-white">{a.label}</p>
              <p className="text-[10px] text-slate-500 font-mono uppercase mb-2">
                {a.slug}
              </p>
              <BpsInput
                value={byAssetType[a.slug] ?? ""}
                onChange={(v) => setOverride(a.slug, v)}
                disabled={!canEdit}
                allowEmpty
              />
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save commission settings
          </button>
        </div>
      )}
    </div>
  );
}

function BpsInput({
  value,
  onChange,
  disabled,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const n = parseInt(value, 10);
  const pct =
    value !== "" && Number.isFinite(n)
      ? `${(n / 100).toFixed(2)}%`
      : allowEmpty
      ? "uses default"
      : "—";
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          max={10000}
          step={10}
          disabled={disabled}
          placeholder={allowEmpty ? "(default)" : "500"}
          className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 tabular-nums"
        />
        <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
      </div>
      <span className="text-xs text-slate-400 font-mono whitespace-nowrap tabular-nums w-24 text-right">
        {pct}
      </span>
    </div>
  );
}
