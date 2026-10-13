import Link from "next/link";
import { Download, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { usd } from "@/lib/utils";
import { StatCard } from "@/components/admin/stat-card";
import { SeriesChart, DonutChart } from "@/components/admin/charts";
import type { RevenueBreakdown } from "@/lib/finance/revenue";
import type { CostCategory } from "@/lib/finance/series";
import {
  GRANULARITIES,
  WITHDRAWAL_STATUS_META,
  type Flows,
  type Granularity,
  type WithdrawalSummary,
} from "@/lib/finance/flows";

/**
 * Cash flow: money in, money out, the running position, and where both went.
 *
 * Server component — every figure is computed in the page from the finance
 * libs, so nothing here can drift from the Overview.
 */

const PALETTE = [
  "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#06b6d4",
  "#a855f7", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#64748b",
];

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function ShareTable({
  rows,
  total,
  head,
  empty,
}: {
  rows: Array<{ key: string; label: string; usd: number; count: number; color: string; hint?: string }>;
  total: number;
  head: string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-slate-500 py-6 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
            <th className="text-left pb-2">{head}</th>
            <th className="text-right pb-2">Amount</th>
            <th className="text-right pb-2">Count</th>
            <th className="text-right pb-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-800">
              <td className="py-2 text-white">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  {r.label}
                </span>
                {r.hint && <span className="block text-[10px] text-slate-500">{r.hint}</span>}
              </td>
              <td className="py-2 text-right tabular-nums font-semibold text-slate-200">{usd(r.usd)}</td>
              <td className="py-2 text-right tabular-nums text-slate-400">{r.count.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-slate-400">{pct(r.usd, total)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-700">
            <td className="py-2 font-bold text-white">Total</td>
            <td className="py-2 text-right tabular-nums font-bold text-white">{usd(total)}</td>
            <td className="py-2 text-right tabular-nums text-slate-400">
              {rows.reduce((n, r) => n + r.count, 0).toLocaleString()}
            </td>
            <td className="py-2 text-right tabular-nums text-slate-400">{total > 0 ? "100%" : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function FlowsTab({
  flows,
  revenue,
  costs,
  companyExpenses,
  withdrawals,
  rangeLabel,
  granularityHref,
  csvHref,
}: {
  flows: Flows;
  revenue: RevenueBreakdown;
  costs: { categories: CostCategory[]; totalUsd: number };
  companyExpenses: {
    categories: Array<{ categoryId: string; name: string; color: string | null; usd: number; count: number }>;
    totalUsd: number;
  };
  withdrawals: WithdrawalSummary;
  rangeLabel: string;
  granularityHref: (g: Granularity) => string;
  csvHref: string;
}) {
  const revenueGap = flows.inflowUsd - revenue.totalUsd;
  const costGap = flows.outflowUsd - costs.totalUsd;
  const incomeRows = revenue.streams
    .filter((s) => s.usd !== 0)
    .sort((a, b) => b.usd - a.usd)
    .map((s, i) => ({
      key: s.key,
      label: s.label,
      usd: s.usd,
      count: s.count,
      color: PALETTE[i % PALETTE.length],
      hint: s.group === "third_party" ? "third-party" : undefined,
    }));
  const costRows = costs.categories
    .filter((c) => c.usd !== 0 || c.count > 0)
    .map((c, i) => ({ key: c.key, label: c.label, usd: c.usd, count: c.count, color: PALETTE[i % PALETTE.length] }));
  const expenseRows = companyExpenses.categories.map((c, i) => ({
    key: c.categoryId,
    label: c.name,
    usd: c.usd,
    count: c.count,
    color: c.color || PALETTE[i % PALETTE.length],
  }));
  const paid = withdrawals.byStatus.find((s) => s.status === "COMPLETED");

  return (
    <div className="space-y-4">
      {/* ── 1. Totals ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Inflow"
          value={usd(flows.inflowUsd)}
          subtext={`${rangeLabel} · platform revenue (own + third-party)`}
          icon={TrendingUp}
          tone="green"
        />
        <StatCard
          title="Outflow"
          value={usd(flows.outflowUsd)}
          subtext="paid to members + wallet payroll"
          icon={TrendingDown}
          tone="red"
        />
        <StatCard
          title="Net"
          value={usd(flows.netUsd)}
          subtext={flows.netUsd >= 0 ? "inflow minus outflow" : "outflow exceeds inflow"}
          icon={Scale}
          tone={flows.netUsd >= 0 ? "green" : "amber"}
        />
        <StatCard
          title="Withdrawals paid"
          value={usd(paid?.netUsd ?? 0)}
          subtext={`${paid?.count ?? 0} paid · requested in range`}
          icon={Wallet}
          tone="purple"
          href="/admin/withdrawals"
        />
      </div>

      {(Math.abs(revenueGap) > 0.01 || Math.abs(costGap) > 0.01) && (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200/90">
          The periods below do not add up exactly to the headline figures for this range
          {Math.abs(revenueGap) > 0.01 && <> — revenue differs by {usd(revenueGap)}</>}
          {Math.abs(costGap) > 0.01 && <> — payouts differ by {usd(costGap)}</>}. Usually a
          row dated after today (a month-end adjustment) or outside the bucketed days.
        </p>
      )}

      {/* ── Trend ─────────────────────────────────────────────────────── */}
      <Panel title="Inflow vs outflow" sub="UTC days · weeks start Monday">
        <div className="flex gap-1 mb-3">
          {GRANULARITIES.map((g) => (
            <Link
              key={g.id}
              href={granularityHref(g.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                flows.granularity === g.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {g.label}
            </Link>
          ))}
        </div>
        <SeriesChart
          data={flows.periods.map((p) => ({
            label: p.label,
            inflow: Math.round(p.inflowUsd * 100) / 100,
            outflow: Math.round(p.outflowUsd * 100) / 100,
            net: Math.round(p.netUsd * 100) / 100,
          }))}
          xKey="label"
          kind="bar"
          money
          height={260}
          series={[
            { key: "inflow", label: "Inflow", color: "#10b981" },
            { key: "outflow", label: "Outflow", color: "#ef4444" },
            { key: "net", label: "Net", color: "#0ea5e9" },
          ]}
          emptyLabel="No money moved in this range."
        />
      </Panel>

      {/* ── 2. Where it came from / where it went ─────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Panel title="Income by source" sub={rangeLabel}>
          <DonutChart
            money
            height={200}
            data={incomeRows.filter((r) => r.usd > 0).map((r) => ({ name: r.label, value: r.usd, color: r.color }))}
            emptyLabel="No revenue in this range."
          />
          <ShareTable rows={incomeRows} total={revenue.totalUsd} head="Stream" empty="No revenue in this range." />
        </Panel>
        <Panel title="Payouts by category" sub={`${rangeLabel} · by where the points came from`}>
          <DonutChart
            money
            height={200}
            data={costRows.filter((r) => r.usd > 0).map((r) => ({ name: r.label, value: r.usd, color: r.color }))}
            emptyLabel="Nothing paid out in this range."
          />
          <ShareTable rows={costRows} total={costs.totalUsd} head="Category" empty="Nothing paid out in this range." />
          <p className="text-[10px] text-slate-500 mt-2">
            Members are paid for completed work and the rewards listed here. Admin
            penalties (points taken back) are netted against the category they came from.
          </p>
        </Panel>
      </div>

      <Panel title="Company expenses by category" sub={`${rangeLabel} · paid, by payment date, net of tax`}>
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <DonutChart
            money
            height={200}
            data={expenseRows.filter((r) => r.usd > 0).map((r) => ({ name: r.label, value: r.usd, color: r.color }))}
            emptyLabel="No company expense paid in this range."
          />
          <div>
            <ShareTable
              rows={expenseRows}
              total={companyExpenses.totalUsd}
              head="Category"
              empty="No company expense paid in this range."
            />
            <p className="text-[10px] text-slate-500 mt-2">
              The company&apos;s own bills, from{" "}
              <Link href="/admin/finance/company" className="underline">Company books</Link>. Not part
              of the outflow above, which is money paid to members. Net after these:{" "}
              <b className="text-slate-300">{usd(flows.netUsd - companyExpenses.totalUsd)}</b>.
            </p>
          </div>
        </div>
      </Panel>

      {/* ── 3. Withdrawals ────────────────────────────────────────────── */}
      <Panel title="Withdrawals" sub={`${rangeLabel} · by request date`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {withdrawals.byStatus.map((s) => {
            const meta = WITHDRAWAL_STATUS_META[s.status];
            return (
              <div key={s.status} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: meta?.color }}>
                  {meta?.label ?? s.status}
                </p>
                <p className="text-lg font-extrabold tabular-nums text-white">{usd(s.amountUsd)}</p>
                <p className="text-[10px] text-slate-500">
                  {s.count} · {meta?.hint}
                </p>
              </div>
            );
          })}
        </div>
        {withdrawals.byMethod.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No withdrawal requested in this range.</p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Method</th>
                  <th className="text-right pb-2">Requests</th>
                  <th className="text-right pb-2">Requested</th>
                  <th className="text-right pb-2">Share</th>
                  <th className="text-right pb-2">Paid (sent)</th>
                  <th className="text-right pb-2">Open (pending + processing)</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.byMethod.map((m) => (
                  <tr key={m.method} className="border-t border-slate-800">
                    <td className="py-2 text-white">{m.method}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{m.count}</td>
                    <td className="py-2 text-right tabular-nums text-slate-200">{usd(m.amountUsd)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{pct(m.amountUsd, withdrawals.totalAmountUsd)}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-400">
                      {usd(m.paidNetUsd)} <span className="text-slate-500">({m.paidCount})</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-400">
                      {usd(m.openUsd)} <span className="text-slate-500">({m.openCount})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-2">
          &quot;Requested&quot; is what left the member&apos;s wallet; &quot;Paid&quot; and
          &quot;Open&quot; are after the withdrawal fee. Rejected and cancelled requests were refunded.
        </p>
      </Panel>

      {/* ── 5. Reconciliation ─────────────────────────────────────────── */}
      <Panel title="Reconciliation by period" sub={rangeLabel}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <p className="text-[11px] text-slate-400 max-w-3xl">
            <b className="text-slate-200">Balance = operating position</b>: all platform revenue
            minus everything credited to members and wallet payroll, since records began.
            It is an accrual figure — a payout counts when it is credited, not when it is
            withdrawn — and it leaves out Company-book expenses. It is <b>not</b> a bank
            balance and not the amount owed to members (see Users → Balances).
          </p>
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
        </div>
        <div className="overflow-x-auto scrollbar-thin max-h-[480px]">
          <table className="w-full text-xs min-w-[560px]">
            <thead className="sticky top-0 bg-slate-900">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left pb-2">Period</th>
                <th className="text-right pb-2">Opening</th>
                <th className="text-right pb-2">Inflow</th>
                <th className="text-right pb-2">Outflow</th>
                <th className="text-right pb-2">Net</th>
                <th className="text-right pb-2">Closing</th>
              </tr>
            </thead>
            <tbody>
              {flows.periods.map((p) => (
                <tr key={p.key} className="border-t border-slate-800">
                  <td className="py-1.5 text-slate-300 whitespace-nowrap">{p.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">{usd(p.openingUsd)}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-400">{p.inflowUsd ? usd(p.inflowUsd) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-red-400">{p.outflowUsd ? usd(p.outflowUsd) : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${p.netUsd >= 0 ? "text-slate-200" : "text-amber-400"}`}>
                    {usd(p.netUsd)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-white">{usd(p.closingUsd)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700">
                <td className="py-2 font-bold text-white">Range</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{usd(flows.openingUsd)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-emerald-400">{usd(flows.inflowUsd)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-red-400">{usd(flows.outflowUsd)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-white">{usd(flows.netUsd)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-white">{usd(flows.closingUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
