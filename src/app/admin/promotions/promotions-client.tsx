"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { promptDialog } from "@/lib/confirm";
import { mediaSrc } from "@/lib/media-url";
import { cn } from "@/lib/utils";

export interface PromotionRow {
  id: string;
  kind: "Course" | "Listing";
  itemTitle: string;
  itemLink: string | null;
  itemImage: string | null;
  itemStatus: string | null;
  itemLive: boolean;
  packageLabel: string;
  days: number;
  paid: string | null;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  owner: { id: string; name: string; username: string | null };
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  APPROVED: "bg-emerald-500/15 text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-300",
  CANCELLED: "bg-slate-500/20 text-slate-400",
};

const btn =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function usePromotionAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, action: "approve" | "reject") => {
    let reason: string | undefined;
    if (action === "reject") {
      const r = await promptDialog({
        title: "Reject this promotion?",
        description: "The member sees this reason. Their payment goes back to them in full.",
        placeholder: "e.g. The cover image breaks the marketplace rules.",
        multiline: true,
        required: true,
        tone: "danger",
        confirmLabel: "Reject and refund",
      });
      if (r === null) return;
      reason = r.trim();
      if (reason.length < 3) return toast.error("Write a reason the member can understand.");
    }
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/admin/promotions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't update the promotion");
      toast.success(action === "approve" ? "Approved — the item is featured" : "Rejected — the member was refunded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the promotion");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_TONE[status] ?? "bg-slate-700 text-slate-300")}>
      {status}
    </span>
  );
}

function Item({ row }: { row: PromotionRow }) {
  return (
    <div className="flex gap-3">
      {row.itemImage && (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail through the media proxy
        <img src={mediaSrc(row.itemImage)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.kind} promotion</p>
        <p className="break-words text-sm font-semibold text-white">{row.itemTitle}</p>
        {row.itemLink ? (
          <Link href={row.itemLink} target="_blank" className="text-xs text-sky-400 hover:underline">
            Open the {row.kind.toLowerCase()}
          </Link>
        ) : (
          <span className="text-xs italic text-slate-500">The {row.kind.toLowerCase()} was deleted.</span>
        )}
        {!row.itemLive && row.status === "PENDING" && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {row.itemStatus ? `Now ${row.itemStatus.toLowerCase().replace(/_/g, " ")}` : "Deleted"} — it can&apos;t be
            featured; approving cancels and refunds it.
          </p>
        )}
      </div>
    </div>
  );
}

function Owner({ row }: { row: PromotionRow }) {
  return (
    <Link href={`/admin/users/${row.owner.id}`} className="text-sm font-semibold text-white hover:underline">
      {row.owner.name}
      {row.owner.username && <span className="ml-1 font-normal text-slate-400">@{row.owner.username}</span>}
    </Link>
  );
}

export function PromotionList({
  mode,
  rows,
  total,
  status = "ALL",
  statuses = [],
  counts = {},
  page = 1,
  hasMore = false,
}: {
  mode: "review" | "all";
  rows: PromotionRow[];
  total: number;
  status?: string;
  statuses?: string[];
  counts?: Record<string, number>;
  page?: number;
  hasMore?: boolean;
}) {
  const { busy, run } = usePromotionAction();
  const href = (s: string, p = 1) =>
    `/admin/promotions?tab=all${s !== "ALL" ? `&status=${s}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="space-y-3">
      {mode === "all" && (
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <Link
              key={s}
              href={href(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                s === status ? "border-blue-500 bg-blue-500/15 text-white" : "border-slate-700 text-slate-400 hover:text-white"
              )}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()} ({(counts[s] ?? 0).toLocaleString()})
            </Link>
          ))}
        </div>
      )}
      {mode === "review" && total > rows.length && (
        <p className="text-xs text-slate-500">
          Showing the oldest {rows.length} of {total.toLocaleString()} — the rest appear as these are decided.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">
          {mode === "review" ? "Nothing waiting for review." : "No promotions here."}
        </p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {mode === "all" && <StatusPill status={r.status} />}
                <Owner row={r} />
              </div>
              <span className="text-xs text-slate-500">Paid {when(r.createdAt)}</span>
            </div>
            <Item row={r} />
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Package</dt>
                <dd className="font-semibold text-white">{r.packageLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Featured for</dt>
                <dd className="font-semibold text-white">
                  {r.days} day{r.days === 1 ? "" : "s"} from approval
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Paid</dt>
                <dd className="font-semibold text-white">{r.paid ?? "—"}</dd>
              </div>
            </dl>
            {r.status === "APPROVED" && (
              <p className="text-xs text-slate-400">
                Featured {when(r.startsAt)} → {when(r.endsAt)}
              </p>
            )}
            {r.rejectReason && (
              <p className="text-xs text-red-300">
                {r.status === "CANCELLED" ? "Cancelled" : "Reason"}: {r.rejectReason}
              </p>
            )}
            {r.status === "PENDING" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run(r.id, "approve")}
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
                >
                  {busy === `${r.id}:approve` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
                  Approve
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run(r.id, "reject")}
                  className={`${btn} border border-red-500/40 text-red-300 hover:bg-red-500/10`}
                >
                  {busy === `${r.id}:reject` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}{" "}
                  Reject and refund
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {mode === "all" && (page > 1 || hasMore) && (
        <div className="flex justify-between">
          {page > 1 ? (
            <Link href={href(status, page - 1)} className="text-sm text-sky-400 hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={href(status, page + 1)} className="text-sm text-sky-400 hover:underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
