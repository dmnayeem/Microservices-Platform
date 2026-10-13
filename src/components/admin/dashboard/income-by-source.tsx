import Link from "next/link";
import { PieChart, CalendarRange } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { DonutChart, SeriesChart } from "@/components/admin/charts";

/**
 * Income by source — where revenue came from and where points went, for one
 * date window. Finance only; the page does not render it otherwise.
 *
 * Every figure here is computed by the finance console's own functions
 * (getRevenueBreakdown, getLedgerTotals, getDailySeries, getPointsBreakdown)
 * with the same window rules, so it equals /admin/finance for the same range.
 * This component only lays the numbers out — it does no money arithmetic
 * beyond percentages of a total it is handed.
 */

export const DASHBOARD_RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
] as const;

export interface IncomeRange {
  id: string;
  label: string;
  /** YYYY-MM-DD, only for the custom range (pre-fills the form). */
  from?: string;
  to?: string;
}

export interface IncomeStreamRow {
  key: string;
  label: string;
  usd: number;
  count: number;
  group: "platform" | "third_party";
}

export interface PointsSourceRow {
  key: string;
  label: string;
  points: number;
  rows: number;
  users: number;
}

export interface IncomeBySourceProps {
  range: IncomeRange;
  revenueUsd: number;
  platformUsd: number;
  thirdPartyUsd: number;
  paidToUsersUsd: number;
  payrollUsd: number;
  netUsd: number;
  streams: IncomeStreamRow[];
  points: { total: number; rows: number; pointsPerUsd: number; bySource: PointsSourceRow[] } | null;
  series: Array<{ date: string; revenue: number; thirdParty: number; cost: number }>;
  /** False when a finance read failed — the section says so instead of showing zeros. */
  ok: boolean;
}

const PALETTE = [
  "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#06b6d4",
  "#a855f7", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#64748b",
];

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

function RangeFilter({ range }: { range: IncomeRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
        {DASHBOARD_RANGES.map((r) => (
          <Link
            key={r.id}
            href={`/admin?range=${r.id}#income`}
            scroll={false}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold",
              range.id === r.id ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>
      {/* A plain GET form: works without client JS and keeps the page a server component. */}
      <form method="get" action="/admin#income" className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="range" value="custom" />
        <input
          type="date"
          name="from"
          defaultValue={range.from}
          required
          aria-label="From"
          className="h-8 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200"
        />
        <span className="text-xs text-slate-500">to</span>
        <input
          type="date"
          name="to"
          defaultValue={range.to}
          aria-label="To"
          className="h-8 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200"
        />
        <button
          type="submit"
          className={cn(
            "h-8 rounded-md px-3 text-xs font-semibold inline-flex items-center gap-1",
            range.id === "custom" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
          )}
        >
          <CalendarRange className="w-3.5 h-3.5" /> Custom
        </button>
      </form>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums truncate", tone ?? "text-white")}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
    </div>
  );
}

export function IncomeBySource(p: IncomeBySourceProps) {
  const streams = p.streams.filter((s) => s.usd !== 0 || s.count > 0).sort((a, b) => b.usd - a.usd);
  const ptsRows = p.points?.bySource ?? [];
  const ptsTotal = p.points?.total ?? 0;

  return (
    <section id="income" className="card p-4 space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-400" />
            Income by source · {p.range.label}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Same figures as{" "}
            <Link href="/admin/finance" className="underline hover:text-slate-300">
              Finance
            </Link>{" "}
            for this window. Days are UTC. Test users excluded.
          </p>
        </div>
        <RangeFilter range={p.range} />
      </div>

      {!p.ok && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Some finance figures could not be loaded just now — the numbers below may be incomplete. Reload to retry.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Figure
          label="Revenue"
          value={usd(p.revenueUsd)}
          sub={`own ${usd(p.platformUsd)} · third-party ${usd(p.thirdPartyUsd)}`}
          tone="text-emerald-400"
        />
        <Figure label="Paid to users" value={usd(p.paidToUsersUsd)} sub="tasks, bonuses, referrals" tone="text-red-400" />
        <Figure label="Payroll" value={usd(p.payrollUsd)} sub="staff wages" />
        <Figure
          label="Net"
          value={usd(p.netUsd)}
          sub="revenue − payouts − payroll"
          tone={p.netUsd >= 0 ? "text-emerald-400" : "text-amber-400"}
        />
        <Figure
          label="Points out"
          value={ptsTotal.toLocaleString()}
          sub={
            p.points
              ? `${p.points.rows.toLocaleString()} credits · ≈ ${usd(ptsTotal / (p.points.pointsPerUsd || 1))}`
              : "unavailable"
          }
          tone="text-sky-400"
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-300 mb-2">Money in vs paid out (daily)</h3>
        <SeriesChart
          data={p.series as unknown as Array<Record<string, string | number>>}
          xKey="date"
          kind="bar"
          money
          height={220}
          series={[
            { key: "revenue", label: "Revenue", color: "#10b981" },
            { key: "thirdParty", label: "Third-party income", color: "#a3e635" },
            { key: "cost", label: "Paid to users", color: "#ef4444" },
          ]}
          emptyLabel="No settled money movement in this window."
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Revenue by stream */}
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Revenue by stream</h3>
          <DonutChart
            money
            height={200}
            data={streams
              .filter((s) => s.usd > 0)
              .map((s, i) => ({ name: s.label, value: s.usd, color: PALETTE[i % PALETTE.length] }))}
            emptyLabel="No revenue recorded in this window."
          />
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1.5 pr-2 font-medium">Source</th>
                  <th className="py-1.5 px-2 font-medium text-right">Amount</th>
                  <th className="py-1.5 px-2 font-medium text-right">Count</th>
                  <th className="py-1.5 pl-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {streams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-slate-500">
                      No revenue in this window.
                    </td>
                  </tr>
                ) : (
                  streams.map((s) => (
                    <tr key={s.key}>
                      <td className="py-1.5 pr-2 text-slate-200">
                        {s.label}
                        {s.group === "third_party" && <span className="ml-1 text-[10px] text-lime-400">3rd-party</span>}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-white">{usd(s.usd)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">{s.count.toLocaleString()}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-slate-400">{pct(s.usd, p.revenueUsd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Points out by source */}
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Points paid out by source</h3>
          <DonutChart
            height={200}
            data={ptsRows.map((s, i) => ({ name: s.label, value: s.points, color: PALETTE[i % PALETTE.length] }))}
            emptyLabel="No points paid out in this window."
          />
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1.5 pr-2 font-medium">Source</th>
                  <th className="py-1.5 px-2 font-medium text-right">Points</th>
                  <th className="py-1.5 px-2 font-medium text-right">Credits</th>
                  <th className="py-1.5 px-2 font-medium text-right">Users</th>
                  <th className="py-1.5 pl-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {ptsRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-slate-500">
                      No points paid out in this window.
                    </td>
                  </tr>
                ) : (
                  ptsRows.map((s) => (
                    <tr key={s.key}>
                      <td className="py-1.5 pr-2 text-slate-200">{s.label}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-white">{s.points.toLocaleString()}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">{s.rows.toLocaleString()}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">{s.users.toLocaleString()}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-slate-400">{pct(s.points, ptsTotal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Full per-user split on{" "}
            <Link href="/admin/finance?tab=points" className="underline hover:text-slate-300">
              Finance → Points
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
