"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Plus, Trash2, Coins } from "lucide-react";
import { toast } from "@/lib/toast";
import type { Currency } from "@/lib/currencies";

/**
 * Admin editor for local currencies + USD rates (e.g. $1 = ৳125), shown on the
 * deposit page based on the user's country. Saved as the `currency_rates`
 * SystemSetting via /api/admin/settings (category `financial`).
 */
export function CurrenciesForm({
  initial,
  canEdit,
}: {
  initial: Currency[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Currency[]>(initial);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Currency>) =>
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const add = () =>
    setRows((p) => [
      ...p,
      { code: "", symbol: "", usdRate: 1, countries: [] },
    ]);

  const save = async () => {
    setBusy(true);
    try {
      const clean = rows
        .map((r) => ({
          code: r.code.trim().toUpperCase(),
          symbol: r.symbol.trim(),
          usdRate: Number(r.usdRate) || 0,
          countries: r.countries
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean),
        }))
        .filter((r) => r.code && r.symbol && r.usdRate > 0);
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "financial",
          settings: { currency_rates: clean },
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setRows(clean);
      toast.success("Currencies saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
        <Coins className="w-3.5 h-3.5 text-amber-400" />
        Set popular currencies + their USD rate. A user sees the currency whose{" "}
        <b>countries</b> include their profile country (e.g. BD → BDT). Example:
        $1 = ৳125.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3"
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code">
                <input
                  value={r.code}
                  onChange={(e) => update(i, { code: e.target.value })}
                  disabled={!canEdit}
                  placeholder="BDT"
                  className={inp}
                />
              </Field>
              <Field label="Symbol">
                <input
                  value={r.symbol}
                  onChange={(e) => update(i, { symbol: e.target.value })}
                  disabled={!canEdit}
                  placeholder="৳"
                  className={inp}
                />
              </Field>
              <Field label="$1 =">
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={r.usdRate}
                  onChange={(e) =>
                    update(i, { usdRate: parseFloat(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  placeholder="125"
                  className={inp}
                />
              </Field>
            </div>
            <Field label="Countries (ISO2, comma-separated)">
              <input
                value={r.countries.join(", ")}
                onChange={(e) =>
                  update(i, {
                    countries: e.target.value
                      .split(/[,\s]+/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                disabled={!canEdit}
                placeholder="BD, BEN"
                className={inp}
              />
            </Field>
            {canEdit && (
              <button
                onClick={() => remove(i)}
                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            onClick={add}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add currency
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}{" "}
            Save currencies
          </button>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
