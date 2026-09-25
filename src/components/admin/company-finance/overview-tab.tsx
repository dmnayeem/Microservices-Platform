"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, Clock, Landmark, Scale, Printer } from "lucide-react";
import { toast } from "@/lib/toast";
import { SeriesChart, DonutChart } from "@/components/admin/charts";
import { periodLabel, shiftPeriod } from "@/lib/company-finance/constants";
import { api, cardCls, inputCls, Loading, thisMonth, usdFmt, type Meta } from "./ui";

type PnL = {
  from: string;
  to: string;
  revenue: { key: string; label: string; usd: number; measured: boolean }[];
  revenueUsd: number;
  otherIncomeUsd: number;
  expenses: { categoryId: string; name: string; color: string | null; usd: number; count: number }[];
  expensesUsd: number;
  walletPayrollUsd: number;
  pendingUsd: number;
  netUsd: number;
  byMonth: { period: string; incomeUsd: number; expenseUsd: number; netUsd: number }[];
};

/**
 * Profit and loss: what the platform earned, what the company spent to run it,
 * and what is left. Tax is on neither side — it is not the company's money —
 * and lives on the Tax tab.
 */
export function OverviewTab({ meta }: { meta: Meta }) {
  const [to, setTo] = useState(thisMonth());
  const [from, setFrom] = useState(shiftPeriod(thisMonth(), -5));
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [tax, setTax] = useState<{ outstandingUsd: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        api<{ pnl: PnL | null }>(`/api/admin/company-finance/reports?type=pnl&from=${from}&to=${to}`),
        api<{ register: { totals: { outstandingUsd: number } } }>(`/api/admin/company-finance/reports?type=tax&from=${from}&to=${to}`),
      ]);
      setPnl(p.pnl);
      setTax(t.register.totals);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the figures");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const presets = [
    { label: "This month", f: thisMonth(), t: thisMonth() },
    { label: "Last 3 months", f: shiftPeriod(thisMonth(), -2), t: thisMonth() },
    { label: "Last 6 months", f: shiftPeriod(thisMonth(), -5), t: thisMonth() },
    { label: "Last 12 months", f: shiftPeriod(thisMonth(), -11), t: thisMonth() },
  ];

  return (
    <div className="space-y-5">
      <div className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setFrom(p.f);
              setTo(p.t);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              from === p.f && to === p.t ? "border-emerald-500 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input type="month" className={`${inputCls} w-40`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-500">→</span>
          <input type="month" className={`${inputCls} w-40`} value={to} onChange={(e) => setTo(e.target.value)} />
          <a
            href={`/admin/finance/company/print/pnl?from=${from}&to=${to}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Print
          </a>
        </div>
      </div>

      {loading && !pnl ? (
        <Loading />
      ) : !pnl ? (
        <p className="text-sm text-slate-500">Pick a valid range.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Big icon={TrendingUp} label="Platform revenue" value={usdFmt(pnl.revenueUsd)} tone="text-emerald-300" note={pnl.otherIncomeUsd ? `+ ${usdFmt(pnl.otherIncomeUsd)} other income` : "from the 5 revenue streams"} />
            <Big icon={TrendingDown} label="Company costs" value={usdFmt(pnl.expensesUsd + pnl.walletPayrollUsd)} tone="text-rose-300" note={pnl.walletPayrollUsd ? `incl. ${usdFmt(pnl.walletPayrollUsd)} wallet payroll` : "paid entries, net of tax"} />
            <Big icon={Scale} label={pnl.netUsd >= 0 ? "Profit" : "Loss"} value={usdFmt(pnl.netUsd)} tone={pnl.netUsd >= 0 ? "text-emerald-300" : "text-rose-300"} note={`${periodLabel(pnl.from)} – ${periodLabel(pnl.to)}`} />
            <Big icon={Clock} label="Bills owed, not paid" value={usdFmt(pnl.pendingUsd)} tone="text-amber-300" note="pending entries — not yet in costs" />
          </div>

          {tax && Math.abs(tax.outstandingUsd) > 0.005 && (
            <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm text-sky-200">
              <Landmark className="h-4 w-4 shrink-0" />
              {tax.outstandingUsd > 0
                ? `${usdFmt(tax.outstandingUsd)} of tax collected in this period has not been paid to the authority yet — it is not profit.`
                : `${usdFmt(-tax.outstandingUsd)} more tax was paid to the authority than was collected in this period.`}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <div className={`${cardCls} p-4 lg:col-span-3`}>
              <p className="mb-1 text-sm font-semibold text-white">Company books, month by month</p>
              <p className="mb-3 text-[11px] text-slate-500">
                Other income vs. company costs from the entries. Platform revenue is shown as the total above.
              </p>
              <SeriesChart
                data={pnl.byMonth.map((m) => ({ date: periodLabel(m.period), income: m.incomeUsd, cost: m.expenseUsd }))}
                series={[
                  { key: "cost", label: "Costs", color: "#f43f5e", money: true },
                  { key: "income", label: "Other income", color: "#10b981", money: true },
                ]}
                kind="bar"
                money
                height={240}
                emptyLabel="No paid entries in this range yet."
              />
            </div>
            <div className={`${cardCls} p-4 lg:col-span-2`}>
              <p className="mb-3 text-sm font-semibold text-white">Where the money went</p>
              <DonutChart
                data={pnl.expenses.map((e) => ({ name: e.name, value: e.usd, color: e.color ?? "#64748b" }))}
                money
                height={240}
                emptyLabel="No paid costs in this range yet."
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table
              title="Revenue"
              rows={[
                ...pnl.revenue.map((r) => ({ label: r.label, value: r.usd, dim: !r.measured })),
                ...(pnl.otherIncomeUsd ? [{ label: "Other income (entries)", value: pnl.otherIncomeUsd, dim: false }] : []),
              ]}
              total={pnl.revenueUsd + pnl.otherIncomeUsd}
            />
            <Table
              title="Costs"
              rows={[
                ...pnl.expenses.map((e) => ({ label: `${e.name} (${e.count})`, value: e.usd, dim: false })),
                ...(pnl.walletPayrollUsd ? [{ label: "Staff paid to wallet (payroll)", value: pnl.walletPayrollUsd, dim: false }] : []),
              ]}
              total={pnl.expensesUsd + pnl.walletPayrollUsd}
            />
          </div>
          {!meta.can.hrView && (
            <p className="text-[11px] text-slate-500">Salaries appear here only as a total. Individual pay is on the Salaries tab, for those who may see it.</p>
          )}
        </>
      )}
    </div>
  );
}

function Big({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={`mt-1.5 text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}

function Table({ title, rows, total }: { title: string; rows: { label: string; value: number; dim: boolean }[]; total: number }) {
  return (
    <div className={`${cardCls} p-4`}>
      <p className="mb-2 text-sm font-semibold text-white">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing in this range.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className={`flex justify-between gap-3 text-sm ${r.dim ? "text-slate-600" : "text-slate-300"}`}>
              <span className="truncate">{r.label}</span>
              <span className="tabular-nums">{r.dim ? "no activity" : usdFmt(r.value)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-slate-800 pt-2 text-sm font-semibold text-white">
            <span>Total</span>
            <span className="tabular-nums">{usdFmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
