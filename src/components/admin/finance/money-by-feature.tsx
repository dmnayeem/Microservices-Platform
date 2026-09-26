import Link from "next/link";
import { format } from "date-fns";
import { ArrowDownToLine, ArrowUpRight, Layers } from "lucide-react";
import { usd } from "@/lib/utils";
import type { CashFlow, FeatureMoney } from "@/lib/finance/by-feature";

const STATUS_TONE: Record<string, string> = {
  APPROVED: "text-emerald-400",
  COMPLETED: "text-emerald-400",
  PENDING: "text-amber-400",
  PROCESSING: "text-sky-400",
  REJECTED: "text-red-400",
};

/** Each feature: money in, money paid out to users, and net. */
export function MoneyByFeature({
  rows,
  unassignedOutUsd,
  rangeLabel,
}: {
  rows: FeatureMoney[];
  unassignedOutUsd: number;
  rangeLabel: string;
}) {
  const inTotal = rows.reduce((a, r) => a + r.inUsd, 0);
  const outTotal = rows.reduce((a, r) => a + r.outUsd, 0) + unassignedOutUsd;
  const shown = rows.filter((r) => r.inUsd > 0.000_5 || r.outUsd > 0.000_5);
  const idle = rows.filter((r) => !(r.inUsd > 0.000_5 || r.outUsd > 0.000_5));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" /> Money by feature
        </p>
        <p className="text-[11px] text-slate-500">{rangeLabel} · points valued at the current rate</p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 text-left">Feature</th>
              <th className="pb-2 text-right">Money in</th>
              <th className="pb-2 text-right">Paid to users</th>
              <th className="pb-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-slate-800 align-top">
                <td className="py-2 pr-3">
                  {r.href ? (
                    <Link href={r.href} className="text-white hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="text-white">{r.label}</span>
                  )}
                  <span className="block text-[11px] text-slate-500">{r.note}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-emerald-400">{r.inUsd > 0 ? usd(r.inUsd) : "—"}</td>
                <td className="py-2 text-right tabular-nums text-rose-300">{r.outUsd > 0 ? usd(r.outUsd) : "—"}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${r.netUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {r.netUsd < 0 ? "−" : ""}
                  {usd(Math.abs(r.netUsd))}
                </td>
              </tr>
            ))}
            {unassignedOutUsd > 0.000_5 && (
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-400">Other payouts</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right tabular-nums text-rose-300">{usd(unassignedOutUsd)}</td>
                <td className="py-2 text-right tabular-nums text-rose-300">−{usd(unassignedOutUsd)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-slate-700 font-semibold">
              <td className="py-2 text-white">Total</td>
              <td className="py-2 text-right tabular-nums text-emerald-400">{usd(inTotal)}</td>
              <td className="py-2 text-right tabular-nums text-rose-300">{usd(outTotal)}</td>
              <td className={`py-2 text-right tabular-nums ${inTotal - outTotal >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {inTotal - outTotal < 0 ? "−" : ""}
                {usd(Math.abs(inTotal - outTotal))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {idle.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          No money in or out in this period: {idle.map((r) => r.label).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** A short list of recent deposits or withdrawals. */
function CashList({ items, href }: { items: CashFlow["recentDeposits"]; href: (id: string) => string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">None in this period.</p>;
  return (
    <ul className="divide-y divide-slate-800">
      {items.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <span className="min-w-0">
            <Link href={href(d.id)} className="block truncate text-slate-200 hover:underline">
              {d.user}
            </Link>
            <span className="block text-[11px] text-slate-500">
              {format(d.createdAt, "d MMM, HH:mm")} · {d.method.replace(/_/g, " ").toLowerCase()} ·{" "}
              <span className={STATUS_TONE[d.status] ?? "text-slate-400"}>{d.status.toLowerCase()}</span>
            </span>
          </span>
          <span className="shrink-0 tabular-nums font-semibold text-white">{usd(d.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Deposits and withdrawals — real cash, with who and when. */
export function CashInOut({ cash, rangeLabel }: { cash: CashFlow; rangeLabel: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-emerald-400" /> Deposits
          </p>
          <Link href="/admin/deposits" className="text-xs text-blue-400 hover:underline">
            Manage →
          </Link>
        </div>
        <p className="mb-2 text-xs text-slate-400">
          {rangeLabel}: <b className="text-white">{usd(cash.deposits.usd)}</b> approved from {cash.deposits.count}{" "}
          deposit{cash.deposits.count === 1 ? "" : "s"}
          {cash.pendingDeposits.count > 0 && (
            <>
              {" "}· <span className="text-amber-300">{cash.pendingDeposits.count} waiting ({usd(cash.pendingDeposits.usd)})</span>
            </>
          )}
          . Deposited money belongs to the user until they spend it — it is not income.
        </p>
        <CashList items={cash.recentDeposits} href={() => "/admin/deposits"} />
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-rose-400" /> Withdrawals
          </p>
          <Link href="/admin/withdrawals" className="text-xs text-blue-400 hover:underline">
            Manage →
          </Link>
        </div>
        <p className="mb-2 text-xs text-slate-400">
          {rangeLabel}: <b className="text-white">{usd(cash.withdrawalsPaid.usd)}</b> paid out in {cash.withdrawalsPaid.count}{" "}
          payment{cash.withdrawalsPaid.count === 1 ? "" : "s"}
          {cash.withdrawalsPending.count > 0 && (
            <>
              {" "}· <span className="text-amber-300">{cash.withdrawalsPending.count} to pay ({usd(cash.withdrawalsPending.usd)})</span>
            </>
          )}
          .
        </p>
        <CashList items={cash.recentWithdrawals} href={(id) => `/admin/withdrawals/${id}`} />
      </div>
    </div>
  );
}
