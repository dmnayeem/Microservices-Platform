"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionRow } from "@/components/user/primitives/transaction-row";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_META, SOURCE_ORDER, type SourceKey } from "@/lib/tx-sources";

interface HistoryTx {
  id: string;
  type: string;
  status: string;
  points: number;
  amount: number;
  description: string | null;
  source: SourceKey;
  isCredit: boolean;
  createdAt: string;
}

type RangePreset = "month" | "year" | "30d" | "all" | "date";

const RANGE_LABELS: Record<RangePreset, string> = {
  month: "This month",
  year: "This year",
  "30d": "Last 30 days",
  all: "All time",
  date: "Specific date",
};

/** Compute from/to ISO strings for the selected preset. */
function rangeToParams(preset: RangePreset, day: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === "all") return {};
  if (preset === "date") return day ? { from: day, to: day } : {};
  if (preset === "month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: f.toISOString() };
  }
  if (preset === "year") {
    const f = new Date(now.getFullYear(), 0, 1);
    return { from: f.toISOString() };
  }
  // 30d
  return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
}

export function TransactionHistory() {
  const [range, setRange] = useState<RangePreset>("month");
  const [day, setDay] = useState<string>("");
  const [source, setSource] = useState<SourceKey | "all">("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryTx[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingEarnings, setPendingEarnings] = useState(0);
  const [bySource, setBySource] = useState<Record<string, { points: number; amount: number }>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const { from, to } = rangeToParams(range, day);
    const qs = new URLSearchParams({ page: String(page), limit: "20" });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (source !== "all") qs.set("source", source);
    fetch(`/api/transactions?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.transactions ?? []);
        setTotalPages(d.pagination?.totalPages ?? 1);
        setPendingEarnings(d.summary?.pendingEarnings ?? 0);
        setBySource(d.summary?.bySource ?? {});
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [range, day, source, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [range, day, source]);

  return (
    <div className="space-y-3">
      {/* Pending earnings banner — points from tasks awaiting review (coming, not lost). */}
      {pendingEarnings > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200 min-w-0">
            <span className="font-bold tabular-nums">{pendingEarnings.toLocaleString()} pts</span>{" "}
            pending review — credited once approved.
          </p>
        </div>
      )}

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangePreset)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
        </select>
        {range === "date" && (
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        )}
      </div>

      {/* Source filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setSource("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-semibold shrink-0 border transition-colors",
            source === "all"
              ? "bg-indigo-500 text-white border-indigo-500"
              : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white"
          )}
        >
          All
        </button>
        {SOURCE_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0 border transition-colors",
              source === s
                ? "bg-indigo-500 text-white border-indigo-500"
                : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", SOURCE_META[s].swatch)} />
            {SOURCE_META[s].label}
          </button>
        ))}
      </div>

      {/* Income by source over the selected range */}
      {(() => {
        const rows = Object.entries(bySource)
          .filter(([, v]) => v.points > 0 || v.amount > 0.005)
          .sort((a, b) => b[1].points + b[1].amount * 1000 - (a[1].points + a[1].amount * 1000));
        if (rows.length === 0) return null;
        return (
          <div className="glass rounded-xl p-3">
            <p className="text-xs font-bold text-white mb-2">By source</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
              {rows.map(([key, v]) => {
                const meta = SOURCE_META[key as SourceKey] ?? SOURCE_META.other;
                return (
                  <div key={key} className="flex items-center justify-between gap-2 text-xs min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 text-gray-300">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", meta.swatch)} />
                      <span className="truncate">{meta.label}</span>
                    </div>
                    <span className="tabular-nums text-gray-400 shrink-0">
                      {v.points > 0 && `${v.points.toLocaleString()} pts`}
                      {v.points > 0 && v.amount > 0.005 && " · "}
                      {v.amount > 0.005 && `$${v.amount.toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={History} title="No transactions" description="Nothing matches these filters." />
      ) : (
        <div>
          {items.map((tx) => {
            const usePoints = tx.points !== 0;
            const magnitude = usePoints ? Math.abs(tx.points) : Math.abs(tx.amount);
            const signed = tx.isCredit ? magnitude : -magnitude;
            return (
              <TransactionRow
                key={tx.id}
                source={tx.source}
                description={tx.description ?? tx.type.replace(/_/g, " ")}
                amount={signed}
                unit={usePoints ? "pts" : "USD"}
                status={tx.status as "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED"}
                date={tx.createdAt}
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs text-gray-500 tabular-nums">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-white disabled:opacity-40"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
