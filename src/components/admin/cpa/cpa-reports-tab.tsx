"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, MousePointerClick, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts, usd } from "@/lib/utils";
import { CountryFlag } from "@/components/admin/ui/country-flag";
import { StatusChip, card, errorOf, fmtWhen, inp } from "./cpa-shared";

interface ReportRow {
  offerId: string;
  title: string;
  network: string;
  status: string;
  clicks: number;
  uniqueUsers: number;
  pending: number;
  held: number;
  approved: number;
  rejected: number;
  reversed: number;
  conversionRate: number;
  pointsPaid: number;
  revenueUsd: number | null;
  costUsd: number | null;
  profitUsd: number | null;
}
type Totals = Omit<ReportRow, "offerId" | "title" | "network" | "status" | "conversionRate">;

interface ClickRow {
  clickId: string;
  offer: { id: string; title: string; network: string };
  userId: string;
  username: string | null;
  country: string | null;
  district: string | null;
  ip: string | null;
  createdAt: string;
  conversionStatus: string | null;
  convertedHere: boolean;
}

export function CpaReportsTab({ initialOfferId }: { initialOfferId?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ rows: ReportRow[]; totals: Totals; seesMoney: boolean } | null>(null);
  const [drill, setDrill] = useState<{ id: string; title: string } | null>(
    initialOfferId ? { id: initialOfferId, title: "" } : null
  );

  useEffect(() => {
    let alive = true;
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    fetch(`/api/admin/cpa/reports?${sp}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await errorOf(r));
        return r.json();
      })
      .then((j: { rows: ReportRow[]; totals: Totals; seesMoney: boolean }) => {
        if (alive) setData(j);
      })
      .catch((e: unknown) => {
        if (alive) toast.error("Couldn't load report", { description: e instanceof Error ? e.message : undefined });
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  const money = !!data?.seesMoney;
  const drillTitle = drill && (drill.title || data?.rows.find((r) => r.offerId === drill.id)?.title || "Offer");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-400 mb-1">From</label>
          <input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">To</label>
          <input type="date" className={inp} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm">
            All time
          </button>
        )}
        <p className="text-[11px] text-slate-500 w-full">
          Clicks count by click time, conversions by submission time. Conversion % = (approved + held) ÷ unique clickers.
          {money && " Cost values paid points at today's points rate."}
        </p>
      </div>

      {data === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : data.rows.length === 0 ? (
        <div className={`${card} p-10 text-center text-sm text-slate-400`}>No offers yet.</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm min-w-225">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Pending</th>
                <th className="px-3 py-2 text-right">Held</th>
                <th className="px-3 py-2 text-right">Approved</th>
                <th className="px-3 py-2 text-right">Rejected</th>
                <th className="px-3 py-2 text-right">Conv %</th>
                <th className="px-3 py-2 text-right">Points paid</th>
                {money && (
                  <>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Profit</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.offerId}
                  onClick={() => setDrill({ id: r.offerId, title: r.title })}
                  className={cn(
                    "border-b border-slate-800/60 cursor-pointer hover:bg-slate-800/40",
                    drill?.id === r.offerId && "bg-blue-500/10"
                  )}
                >
                  <td className="px-3 py-2">
                    <p className="font-semibold text-white">{r.title}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">{r.network} <StatusChip status={r.status} /></p>
                  </td>
                  <Num v={r.clicks} />
                  <Num v={r.uniqueUsers} />
                  <Num v={r.pending} tone="text-blue-300" />
                  <Num v={r.held} tone="text-violet-300" />
                  <Num v={r.approved} tone="text-emerald-300" />
                  <Num v={r.rejected + r.reversed} tone="text-red-300" title={r.reversed ? `${r.reversed} reversed` : undefined} />
                  <td className="px-3 py-2 text-right text-slate-200">{r.conversionRate}%</td>
                  <Num v={r.pointsPaid} />
                  {money && (
                    <>
                      <td className="px-3 py-2 text-right text-slate-200">{usd(r.revenueUsd)}</td>
                      <td className="px-3 py-2 text-right text-slate-200">{usd(r.costUsd)}</td>
                      <td className={cn("px-3 py-2 text-right font-semibold", (r.profitUsd ?? 0) < 0 ? "text-red-400" : "text-emerald-300")}>{usd(r.profitUsd)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-slate-200 font-semibold">
                <td className="px-3 py-2">Total</td>
                <Num v={data.totals.clicks} />
                <Num v={data.totals.uniqueUsers} />
                <Num v={data.totals.pending} />
                <Num v={data.totals.held} />
                <Num v={data.totals.approved} />
                <Num v={data.totals.rejected + data.totals.reversed} />
                <td className="px-3 py-2" />
                <Num v={data.totals.pointsPaid} />
                {money && (
                  <>
                    <td className="px-3 py-2 text-right">{usd(data.totals.revenueUsd)}</td>
                    <td className="px-3 py-2 text-right">{usd(data.totals.costUsd)}</td>
                    <td className={cn("px-3 py-2 text-right", (data.totals.profitUsd ?? 0) < 0 ? "text-red-400" : "text-emerald-300")}>{usd(data.totals.profitUsd)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {drill && (
        <ClickList
          key={`${drill.id}|${from}|${to}`}
          offerId={drill.id}
          title={drillTitle ?? ""}
          from={from}
          to={to}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function Num({ v, tone, title }: { v: number; tone?: string; title?: string }) {
  return (
    <td className={cn("px-3 py-2 text-right tabular-nums", tone ?? "text-slate-200")} title={title}>
      {pts(v)}
    </td>
  );
}

function ClickList({
  offerId,
  title,
  from,
  to,
  onClose,
}: {
  offerId: string;
  title: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ClickRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const seq = useRef(0);
  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => {
      setQd(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = () => {
    const sp = new URLSearchParams({ offerId });
    if (qd) sp.set("q", qd);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return sp;
  };

  useEffect(() => {
    const mine = ++seq.current;
    const sp = new URLSearchParams({ offerId, page: String(page), pageSize: String(pageSize) });
    if (qd) sp.set("q", qd);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    fetch(`/api/admin/cpa/clicks?${sp}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await errorOf(r));
        return r.json();
      })
      .then((j: { clicks: ClickRow[]; total: number }) => {
        if (mine !== seq.current) return;
        setRows(j.clicks);
        setTotal(j.total);
      })
      .catch((e: unknown) => toast.error("Couldn't load clicks", { description: e instanceof Error ? e.message : undefined }));
  }, [offerId, page, qd, from, to]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const csvHref = `/api/admin/cpa/clicks?${params()}&format=csv`;

  return (
    <div className={`${card} p-3 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <MousePointerClick className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-white flex-1 min-w-0 truncate">
          Clicks — {title} <span className="text-slate-500 font-normal">({pts(total)})</span>
        </h3>
        <a href={csvHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold">
          <Download className="w-3.5 h-3.5" /> CSV
        </a>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800" aria-label="Close clicks">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className={`${inp} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username, email or exact click id" />
      </div>

      {rows === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No clicks.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-160">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="px-2 py-1.5">User</th>
                <th className="px-2 py-1.5">Time</th>
                <th className="px-2 py-1.5">Location</th>
                <th className="px-2 py-1.5">Click ID</th>
                <th className="px-2 py-1.5">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.clickId} className="border-b border-slate-800/60">
                  <td className="px-2 py-1.5">
                    <a href={`/admin/users/${c.userId}`} className="text-white hover:underline">{c.username || c.userId}</a>
                  </td>
                  <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{fmtWhen(c.createdAt)}</td>
                  <td className="px-2 py-1.5 text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <CountryFlag code={c.country} />
                      {c.country ?? "—"}
                      {c.district ? ` · ${c.district}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-slate-400 break-all">{c.clickId}</td>
                  <td className="px-2 py-1.5">
                    {c.conversionStatus ? (
                      <span className="inline-flex items-center gap-1">
                        <StatusChip status={c.conversionStatus} />
                        {!c.convertedHere && <span className="text-[10px] text-slate-500">(other click)</span>}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
          Page {page} of {pages}
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
