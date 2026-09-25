"use client";

import { Plus, X } from "lucide-react";
import { CONVEYANCE_MODES } from "@/lib/company-finance/constants";
import { inputCls, money, type Currency } from "./ui";

export type LineDraft = {
  date: string;
  description: string;
  from: string;
  to: string;
  mode: string;
  qty: string;
  amount: string;
};

export const emptyLine = (): LineDraft => ({ date: "", description: "", from: "", to: "", mode: "", qty: "", amount: "" });

export function lineTotal(lines: LineDraft[]): number {
  return Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
}

/**
 * Itemised lines on a bill. A conveyance bill asks for each trip — date, from,
 * to, purpose, mode — because that is the form a Bangladeshi office signs; any
 * other bill asks for item, quantity and amount. The server recomputes the
 * total from these lines and stores THAT as the amount.
 */
export function LineItemsEditor({
  lines,
  onChange,
  conveyance,
  currency,
  currencies,
}: {
  lines: LineDraft[];
  onChange: (l: LineDraft[]) => void;
  conveyance: boolean;
  currency: string;
  currencies: Currency[];
}) {
  const set = (i: number, k: keyof LineDraft, v: string) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const cell = `${inputCls} px-2 py-1.5 text-xs`;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              {conveyance ? (
                <>
                  <th className="w-32 pb-1 pr-1">Date</th>
                  <th className="pb-1 pr-1">From</th>
                  <th className="pb-1 pr-1">To</th>
                  <th className="pb-1 pr-1">Purpose</th>
                  <th className="w-28 pb-1 pr-1">Mode</th>
                </>
              ) : (
                <>
                  <th className="pb-1 pr-1">Item</th>
                  <th className="w-20 pb-1 pr-1">Qty</th>
                </>
              )}
              <th className="w-28 pb-1 pr-1">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                {conveyance ? (
                  <>
                    <td className="pb-1 pr-1"><input type="date" className={cell} value={l.date} onChange={(e) => set(i, "date", e.target.value)} /></td>
                    <td className="pb-1 pr-1"><input className={cell} value={l.from} placeholder="Office" onChange={(e) => set(i, "from", e.target.value)} /></td>
                    <td className="pb-1 pr-1"><input className={cell} value={l.to} placeholder="Bank" onChange={(e) => set(i, "to", e.target.value)} /></td>
                    <td className="pb-1 pr-1"><input className={cell} value={l.description} placeholder="Cheque deposit" onChange={(e) => set(i, "description", e.target.value)} /></td>
                    <td className="pb-1 pr-1">
                      <input list="conv-modes" className={cell} value={l.mode} onChange={(e) => set(i, "mode", e.target.value)} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="pb-1 pr-1"><input className={cell} value={l.description} placeholder="A4 paper, 2 reams" onChange={(e) => set(i, "description", e.target.value)} /></td>
                    <td className="pb-1 pr-1"><input type="number" min={0} className={cell} value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} /></td>
                  </>
                )}
                <td className="pb-1 pr-1"><input type="number" min={0} step="0.01" className={cell} value={l.amount} onChange={(e) => set(i, "amount", e.target.value)} /></td>
                <td className="pb-1">
                  <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="rounded p-1 text-slate-500 hover:text-rose-400" aria-label="Remove line">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="conv-modes">
          {CONVEYANCE_MODES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange([...lines, emptyLine()])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {conveyance ? "Add trip" : "Add item"}
        </button>
        <p className="text-sm text-slate-300">
          Total <span className="font-bold text-white">{money(lineTotal(lines), currency, currencies)}</span>
        </p>
      </div>
    </div>
  );
}
