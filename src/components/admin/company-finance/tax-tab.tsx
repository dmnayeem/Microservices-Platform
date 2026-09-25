"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Info, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { shiftPeriod } from "@/lib/company-finance/constants";
import { api, btnPrimary, cardCls, inputCls, Loading, thisMonth, usdFmt, type Meta } from "./ui";
import { EntryForm } from "./entries-tab";

type Line = { label: string; collectedUsd: number; paidOnExpensesUsd: number; remittedUsd: number; outstandingUsd: number };
type Register = {
  lines: Line[];
  totals: Omit<Line, "label">;
  sources: { key: string; label: string; usd: number; count: number; from: string; measured: boolean }[];
  notes: string[];
};

/**
 * VAT and every other tax, on their own.
 *
 * Four columns, because they answer four different questions and adding any
 * two of them together produces a number that means nothing:
 *   collected   — taken from customers, owed to the authority
 *   on expenses — paid inside vendor bills
 *   remitted    — actually handed to the authority
 *   outstanding — collected minus remitted: what is still owed
 */
export function TaxTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [to, setTo] = useState(thisMonth());
  const [from, setFrom] = useState(shiftPeriod(thisMonth(), -11));
  const [reg, setReg] = useState<Register | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      setReg((await api<{ register: Register }>(`/api/admin/company-finance/reports?type=tax&from=${from}&to=${to}`)).register);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the register");
    }
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    api<{ register: Register }>(`/api/admin/company-finance/reports?type=tax&from=${from}&to=${to}`)
      .then((r) => alive && setReg(r.register))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load the register"));
    return () => {
      alive = false;
    };
  }, [from, to]);

  const vatCat = meta.categories.find((c) => c.slug === "tax-vat");

  return (
    <div className="space-y-4">
      <div className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        <Landmark className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-300">Tax register</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input type="month" className={`${inputCls} w-40`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-500">→</span>
          <input type="month" className={`${inputCls} w-40`} value={to} onChange={(e) => setTo(e.target.value)} />
          {meta.can.create && (
            <button className={btnPrimary} onClick={() => setPaying(true)}>
              <Plus className="h-4 w-4" /> Record a tax payment
            </button>
          )}
        </div>
      </div>

      {!reg ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Box label="Collected" value={reg.totals.collectedUsd} note="owed to the authority" tone="text-white" />
            <Box label="Paid on expenses" value={reg.totals.paidOnExpensesUsd} note="inside vendor bills" tone="text-slate-300" />
            <Box label="Paid to the authority" value={reg.totals.remittedUsd} note="tax payments recorded" tone="text-emerald-300" />
            <Box
              label="Still owed"
              value={reg.totals.outstandingUsd}
              note={reg.totals.outstandingUsd > 0 ? "collected, not yet paid over" : "nothing outstanding"}
              tone={reg.totals.outstandingUsd > 0.005 ? "text-amber-300" : "text-emerald-300"}
            />
          </div>

          <div className={`${cardCls} overflow-x-auto`}>
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Tax</th>
                  <th className="px-3 py-2 text-right">Collected</th>
                  <th className="px-3 py-2 text-right">On expenses</th>
                  <th className="px-3 py-2 text-right">Paid to authority</th>
                  <th className="px-3 py-2 text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {reg.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No tax collected or paid in this range.</td>
                  </tr>
                ) : (
                  reg.lines.map((l) => (
                    <tr key={l.label} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2.5 font-medium text-white">{l.label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{usdFmt(l.collectedUsd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{usdFmt(l.paidOnExpensesUsd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{usdFmt(l.remittedUsd)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${l.outstandingUsd > 0.005 ? "text-amber-300" : "text-slate-400"}`}>
                        {usdFmt(l.outstandingUsd)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={`${cardCls} p-4`}>
            <p className="mb-2 text-sm font-semibold text-white">Where “collected” comes from</p>
            <div className="space-y-1.5">
              {reg.sources.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-300">
                    {s.label}
                    <span className="ml-2 font-mono text-[10px] text-slate-600">{s.from}</span>
                  </span>
                  <span className={s.measured ? "tabular-nums text-white" : "text-slate-600"}>
                    {s.measured ? `${usdFmt(s.usd)} · ${s.count}` : "no activity"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {reg.notes.length > 0 && (
            <div className="space-y-1.5">
              {reg.notes.map((n) => (
                <p key={n} className="flex gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  {n}
                </p>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Whether tax on expenses can be claimed back depends on your registration. It is reported, never netted off automatically.
          </p>
        </>
      )}

      {paying && (
        <EntryForm
          meta={meta}
          entry={null}
          preset={{ kind: "TAX_PAYMENT", categoryId: vatCat?.id }}
          onClose={() => setPaying(false)}
          onSaved={async () => {
            setPaying(false);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function Box({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{usdFmt(value)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}
