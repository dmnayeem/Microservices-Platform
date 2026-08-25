"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { usd, pts, cn } from "@/lib/utils";
import { SOURCE_META, SOURCE_ORDER, type SourceKey } from "@/lib/tx-sources";
import { ModalShell } from "@/components/admin/ads/modal-shell";

/**
 * Every ledger row, searchable.
 *
 * The finance page could show totals by type and nothing else — there was no
 * way to see the rows behind a figure, look up one user's history, or answer
 * "what was this $47?". Colours come from `SOURCE_META`, the same map the user
 * wallet renders from, so a source looks identical on both sides.
 */

const TYPES = [
  "EARNING", "WITHDRAWAL", "BONUS", "REFERRAL", "PURCHASE", "REFUND",
  "PENALTY", "GIFT", "LOTTERY_WIN", "CHECKIN", "COURSE_PURCHASE",
  "COURSE_TUTOR_EARNING", "COURSE_REFUND", "DEPOSIT", "AFFILIATE_COMMISSION",
  "ADMIN_FEE", "AD_CREDIT_PURCHASE", "POINTS_CONVERSION",
];

const DIRECTION_TONE: Record<string, string> = {
  revenue: "text-emerald-400",
  cost: "text-red-400",
  internal: "text-slate-400",
};

interface LedgerRow {
  id: string;
  type: string;
  status: string;
  source: SourceKey;
  direction: "revenue" | "cost" | "internal";
  amountUsd: number;
  magnitudeUsd: number;
  points: number;
  description: string | null;
  reference: string | null;
  metadata: unknown;
  createdAt: string;
  user: { id: string; email: string; name: string | null; isStaff: boolean } | null;
}

export function LedgerTab({ days }: { days: number | null }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [exact, setExact] = useState(true);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [open, setOpen] = useState<LedgerRow | null>(null);

  const params = useCallback(
    (extra: Record<string, string> = {}) => {
      const sp = new URLSearchParams({
        source,
        type,
        status,
        q: applied,
        page: String(page),
        ...(days ? { days: String(days) } : {}),
        ...extra,
      });
      return sp.toString();
    },
    [source, type, status, applied, page, days]
  );

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/finance/ledger?${params()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setExact(d.totalIsExact !== false);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [params]);

  const reset = (fn: () => void) => {
    setLoading(true);
    setPage(0);
    fn();
  };

  const selectCls =
    "px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs";

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-52">
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Search
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") reset(() => setApplied(q.trim()));
              }}
              placeholder="Email, name, description or reference"
              className="w-full pl-8 pr-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) => reset(() => setSource(e.target.value))}
            className={selectCls}
          >
            <option value="all">All sources</option>
            {SOURCE_ORDER.map((s) => (
              <option key={s} value={s}>
                {SOURCE_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => reset(() => setType(e.target.value))}
            className={selectCls}
          >
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => reset(() => setStatus(e.target.value))}
            className={selectCls}
          >
            {["all", "COMPLETED", "PENDING", "FAILED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/api/admin/finance/ledger?${params({ format: "csv" })}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </a>
      </div>

      <p className="text-[11px] text-slate-500">
        {exact ? total.toLocaleString() : `${rows.length}+`} row
        {total === 1 ? "" : "s"}
        {!exact && " matching this source on the pages scanned"} · times are UTC
      </p>

      {loading ? (
        <p className="text-xs text-slate-500 py-10 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-10 text-center">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left p-2.5">When</th>
                <th className="text-left p-2.5">User</th>
                <th className="text-left p-2.5">Source</th>
                <th className="text-left p-2.5">Description</th>
                <th className="text-right p-2.5">Points</th>
                <th className="text-right p-2.5">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                >
                  <td className="p-2.5 text-slate-400 whitespace-nowrap">
                    {r.createdAt.slice(0, 10)}
                    <span className="text-slate-600"> {r.createdAt.slice(11, 16)}</span>
                  </td>
                  <td className="p-2.5 max-w-40 truncate">
                    <span className="text-slate-300">
                      {r.user?.name || r.user?.email || "—"}
                    </span>
                    {r.user?.isStaff && (
                      <span className="ml-1 px-1 py-0.5 rounded bg-slate-700 text-slate-300 text-[9px] font-bold">
                        STAFF
                      </span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                        SOURCE_META[r.source]?.tone ?? "bg-slate-500/10 text-slate-400"
                      )}
                    >
                      {SOURCE_META[r.source]?.label ?? r.source}
                    </span>
                    {r.status !== "COMPLETED" && (
                      <span className="ml-1 text-[10px] text-amber-400">{r.status}</span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-400 max-w-64 truncate">
                    {r.description ?? "—"}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-slate-400">
                    {r.points ? pts(r.points) : "—"}
                  </td>
                  <td
                    className={cn(
                      "p-2.5 text-right tabular-nums font-semibold",
                      DIRECTION_TONE[r.direction]
                    )}
                  >
                    {r.magnitudeUsd ? usd(r.magnitudeUsd) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setLoading(true);
              setPage((p) => Math.max(0, p - 1));
            }}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-[11px] text-slate-500">Page {page + 1}</span>
          <button
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
            disabled={rows.length < 50}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {open && (
        <ModalShell title={open.description ?? open.type} onClose={() => setOpen(null)}>
          <div className="space-y-2 text-xs">
            {[
              ["When (UTC)", open.createdAt.slice(0, 19).replace("T", " ")],
              ["User", open.user ? `${open.user.name ?? "—"} · ${open.user.email}` : "—"],
              ["Source", SOURCE_META[open.source]?.label ?? open.source],
              ["Type", open.type],
              ["Status", open.status],
              // The classification the whole console rests on, shown so a
              // surprising total can be traced to a row and understood.
              ["Counts as", open.direction],
              ["Amount (stored)", `${open.amountUsd}`],
              ["Amount (magnitude)", usd(open.magnitudeUsd)],
              ["Points", open.points ? pts(open.points) : "0"],
              ["Reference", open.reference ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 text-right break-all">{v}</span>
              </div>
            ))}
            {open.metadata != null && (
              <div className="pt-2">
                <p className="text-slate-500 mb-1">Metadata</p>
                <pre className="p-2 rounded-lg bg-black/40 text-[10px] text-slate-300 overflow-x-auto">
                  {JSON.stringify(open.metadata, null, 2)}
                </pre>
              </div>
            )}
            <p className="text-[10px] text-slate-600 pt-2">
              &quot;Counts as&quot; is how this row is treated in the totals —
              the stored sign is not consistent across sources, so direction is
              decided by rule rather than by whether the amount is negative.
            </p>
          </div>
        </ModalShell>
      )}

      {loading && rows.length > 0 && (
        <div className="flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
        </div>
      )}
    </div>
  );
}
