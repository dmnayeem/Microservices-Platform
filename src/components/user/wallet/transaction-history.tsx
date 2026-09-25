"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionRow } from "@/components/user/primitives/transaction-row";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { History } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { SOURCE_META, SOURCE_ORDER, type SourceKey } from "@/lib/tx-sources";
import { DateField } from "@/components/ui/date-field";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";

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

export function TransactionHistory({
  /**
   * "money" shows only movements of money; "earning" only the work log;
   * absent shows everything. The wallet tab keeps the old all-in-one view;
   * the Transactions page defaults to money.
   */
  defaultKind,
  /** Render the Money / Earnings / All switch. */
  showKindToggle = false,
}: {
  defaultKind?: "money" | "earning";
  showKindToggle?: boolean;
} = {}) {
  const [range, setRange] = useState<RangePreset>("month");
  const [day, setDay] = useState<string>("");
  const [kind, setKind] = useState<"money" | "earning" | "all">(
    defaultKind ?? "all"
  );
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
    else if (kind !== "all") qs.set("kind", kind);
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
  }, [range, day, source, kind, page]);

  useEffect(() => {
    // Deferred a tick so load()'s setLoading is not synchronous in the effect
    // body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(load);
  }, [load]);

  // Changing a filter goes back to page 1 — done in the setters below, not in
  // an effect.
  //
  // As an effect it fired AFTER the render that changed the filter, so the
  // component rendered once with the new filter and the old page number,
  // triggered a fetch for that combination, then re-rendered and fetched again.
  // Two renders and two requests for one click, and a visible flicker between
  // them. Setting both together makes it one of each.
  const changeRange = (v: RangePreset) => {
    setRange(v);
    setPage(1);
  };
  const changeDay = (v: string) => {
    setDay(v);
    setPage(1);
  };
  const changeSource = (v: SourceKey | "all") => {
    setSource(v);
    setPage(1);
  };

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
          onChange={(e) => changeRange(e.target.value as RangePreset)}
          className="px-3 py-1.5 rounded-lg bg-(--app-surface) border border-(--app-line) text-sm text-(--app-ink) focus:outline-none focus:border-(--app-accent-edge)"
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
        </select>
        {range === "date" && (
          <DateField
            type="date"
            value={day}
            onChange={(v) => changeDay(v)}
            className="px-3 py-1.5 rounded-lg bg-(--app-surface) border border-(--app-line) text-sm text-(--app-ink) focus:outline-none focus:border-(--app-accent-edge)"
          />
        )}
      </div>

      {showKindToggle && (
        <div className="inline-flex overflow-hidden rounded-lg border border-(--app-line)">
          {(
            [
              ["money", "Money"],
              ["earning", "Earnings"],
              ["all", "Everything"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                // A source chip is more specific than the kind and would
                // otherwise pin the list to one source while the switch
                // appeared to do nothing.
                setSource("all");
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold transition-colors",
                kind === k
                  ? "bg-(--app-cta)/15 text-(--app-accent-ink)"
                  : "text-(--app-ink-3) hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Source filter chips */}
      <ScrollFadeRow innerClassName="flex gap-1.5 pb-1" ariaLabel="Transaction source filter">
        <button
          onClick={() => changeSource("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-semibold shrink-0 border transition-colors",
            source === "all"
              ? "bg-(--app-cta) text-(--app-on-cta) border-(--app-accent-edge)"
              : "bg-(--app-surface) text-(--app-ink-3) border-(--app-line) hover:text-white"
          )}
        >
          All
        </button>
        {SOURCE_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => changeSource(s)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0 border transition-colors",
              source === s
                ? "bg-(--app-cta) text-(--app-on-cta) border-(--app-accent-edge)"
                : "bg-(--app-surface) text-(--app-ink-3) border-(--app-line) hover:text-white"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", SOURCE_META[s].swatch)} />
            {SOURCE_META[s].label}
          </button>
        ))}
      </ScrollFadeRow>

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
                    <div className="flex items-center gap-1.5 min-w-0 text-(--app-ink-2)">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", meta.swatch)} />
                      <span className="truncate">{meta.label}</span>
                    </div>
                    <span className="tabular-nums text-(--app-ink-3) shrink-0">
                      {v.points > 0 && `${v.points.toLocaleString()} pts`}
                      {v.points > 0 && v.amount > 0.005 && " · "}
                      {v.amount > 0.005 && `${usd(v.amount)}`}
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
          <Loader2 className="w-6 h-6 animate-spin text-(--app-accent-ink)" />
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-(--app-surface) border border-(--app-line) text-xs text-(--app-ink) disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs text-(--app-ink-3) tabular-nums">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-(--app-surface) border border-(--app-line) text-xs text-(--app-ink) disabled:opacity-40"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
