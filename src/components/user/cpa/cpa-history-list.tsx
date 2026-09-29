"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { pts } from "@/lib/utils";
import { EmptyState, FilterChips, ListSkeleton } from "@/components/user/primitives";
import type { FilterChip } from "@/components/user/primitives";
import { CpaStatusChip, OfferLogo, fmtDate, type CpaMine } from "./cpa-shared";

type Row = CpaMine & {
  offer: { id: string; title: string; network: string; logoUrl: string | null };
};
type Totals = Record<string, { count: number; points: number }>;

const FILTERS = ["ALL", "PENDING", "HELD", "APPROVED", "REJECTED", "REVERSED"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = {
  ALL: "All",
  PENDING: "Pending",
  HELD: "Releasing",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
};

export function CpaHistoryList() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Totals>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (p: number) => {
      const qs = new URLSearchParams({ page: String(p) });
      if (filter !== "ALL") qs.set("status", filter);
      try {
        const res = await fetch(`/api/cpa/my?${qs}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? "Couldn't load your offers");
        setRows((prev) => (p === 1 ? d.conversions : [...(prev ?? []), ...d.conversions]));
        setTotals(d.totals ?? {});
        setTotal(d.total ?? 0);
        setPage(p);
      } catch (e) {
        if (p === 1) setRows([]);
        toast.error("Couldn't load your offers", {
          description: e instanceof Error ? e.message : "Try again",
        });
      }
    },
    [filter]
  );

  useEffect(() => {
    setRows(null);
    load(1);
  }, [load]);

  const allCount = Object.values(totals).reduce((a, t) => a + t.count, 0);
  const earned = totals.APPROVED?.points ?? 0;
  const waiting = (totals.PENDING?.points ?? 0) + (totals.HELD?.points ?? 0);

  const options: FilterChip<Filter>[] = FILTERS.filter(
    (f) => f === "ALL" || f === filter || (totals[f]?.count ?? 0) > 0
  ).map((f) => ({
    value: f,
    label: FILTER_LABEL[f],
    count: f === "ALL" ? allCount : totals[f]?.count ?? 0,
  }));

  return (
    <div className="space-y-4">
      {allCount > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="app-tile min-w-0">
            <p className="t-label-sm text-(--app-ink-3)">Earned</p>
            <p className="t-figure-sm t-in truncate">{pts(earned)} pts</p>
          </div>
          <div className="app-tile min-w-0">
            <p className="t-label-sm text-(--app-ink-3)">Waiting</p>
            <p className="t-figure-sm t-warn truncate">{pts(waiting)} pts</p>
          </div>
        </div>
      )}

      {allCount > 0 && <FilterChips options={options} value={filter} onChange={setFilter} />}

      {rows === null ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={History}
            title={filter === "ALL" ? "No offers yet" : "Nothing here"}
            description={
              filter === "ALL"
                ? "Offers you start and send proof for show up here with their status."
                : "No offers with this status."
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/cpa/${r.offer.id}`} className="app-card app-press app-lift flex min-w-0 gap-3">
                <OfferLogo src={r.offer.logoUrl} alt={r.offer.title} size={44} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="t-card-title truncate text-white">{r.offer.title}</p>
                    <span
                      className={
                        "shrink-0 whitespace-nowrap text-sm font-bold tabular-nums " +
                        (r.status === "APPROVED"
                          ? "t-in"
                          : r.status === "REJECTED" || r.status === "REVERSED"
                            ? "text-(--app-ink-3) line-through"
                            : "text-white")
                      }
                    >
                      +{pts(r.points)} pts
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <CpaStatusChip status={r.status} heldUntil={r.heldUntil} />
                    <span className="t-meta truncate text-(--app-ink-3)">
                      {r.offer.network} · {fmtDate(r.createdAt)}
                    </span>
                  </div>
                  {(r.status === "REJECTED" || r.status === "REVERSED") && r.rejectionReason && (
                    <p className="t-meta t-out wrap-break-word">Reason: {r.rejectionReason}</p>
                  )}
                  {r.status === "APPROVED" && r.creditedAt && (
                    <p className="t-meta text-(--app-ink-3)">Credited {fmtDate(r.creditedAt)}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows && rows.length < total && (
        <button
          type="button"
          disabled={more}
          onClick={async () => {
            setMore(true);
            await load(page + 1);
            setMore(false);
          }}
          className="app-press mx-auto flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-(--app-line) bg-(--app-surface) px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {more && <Loader2 className="h-4 w-4 animate-spin" />}
          Load more
        </button>
      )}
    </div>
  );
}
