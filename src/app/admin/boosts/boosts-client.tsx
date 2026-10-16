"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pause, Play, Square, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog, promptDialog } from "@/lib/confirm";
import { mediaSrc } from "@/lib/media-url";
import { BOOST_EVENT_KINDS, type BoostEventKind } from "@/lib/boost/pricing";
import { cn } from "@/lib/utils";

export interface BoostRow {
  id: string;
  status: string;
  paidWith: string;
  budgetPoints: number;
  spentPoints: number;
  refundedPoints: number;
  durationDays: number;
  audience: string[];
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  rejectReason: string | null;
  counts: Record<BoostEventKind, number>;
  post: { id: string; content: string; image: string | null; isHidden: boolean } | null;
  owner: { id: string; name: string; username: string | null; avatar: string | null };
}

const KIND_SHORT: Record<BoostEventKind, string> = {
  IMPRESSION: "Impressions",
  VIEW: "Views",
  CLICK: "Clicks",
  LIKE: "Likes",
  COMMENT: "Comments",
  SHARE: "Shares",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  PAUSED: "bg-sky-500/15 text-sky-300",
  COMPLETED: "bg-slate-500/20 text-slate-300",
  REJECTED: "bg-red-500/15 text-red-300",
  CANCELLED: "bg-slate-500/20 text-slate-400",
};

const btn =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed";
const fmt = (n: number) => n.toLocaleString();
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const payLabel = (p: string) => (p === "AD_FUND" ? "Ad Fund" : "Ad Points");

type Action = "approve" | "reject" | "pause" | "resume" | "cancel";

function useBoostAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, action: Action) => {
    let reason: string | undefined;
    if (action === "reject") {
      const r = await promptDialog({
        title: "Reject this boost?",
        description: "The member sees this reason. The whole budget goes back to them.",
        placeholder: "e.g. The post breaks the community rules on misleading claims.",
        multiline: true,
        required: true,
        tone: "danger",
        confirmLabel: "Reject",
      });
      if (r === null) return;
      reason = r.trim();
      if (reason.length < 3) return toast.error("Write a reason the member can understand.");
    }
    if (action === "cancel") {
      const ok = await confirmDialog({
        title: "Stop this boost?",
        description: "It stops at once and cannot be restarted. The unspent budget goes back to the member.",
        tone: "danger",
        confirmLabel: "Stop boost",
      });
      if (!ok) return;
    }
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/admin/boosts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't update the boost");
      const back = d.refunded > 0 ? ` · ${fmt(d.refunded)} Ad Points returned` : "";
      toast.success(
        {
          approve: "Approved — the boost is live",
          reject: `Rejected${back}`,
          pause: "Paused",
          resume: "Resumed",
          cancel: `Stopped${back}`,
        }[action]
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the boost");
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function PostPreview({ row }: { row: BoostRow }) {
  if (!row.post) return <p className="text-sm italic text-slate-500">The post was deleted.</p>;
  return (
    <div className="flex gap-3">
      {row.post.image && (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail through the media proxy
        <img src={mediaSrc(row.post.image)} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0">
        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-slate-200">
          {row.post.content || <span className="italic text-slate-500">(no text)</span>}
        </p>
        <Link href={`/post/${row.post.id}`} target="_blank" className="mt-1 inline-block text-xs text-sky-400 hover:underline">
          Open the post
        </Link>
        {row.post.isHidden && <span className="ml-2 text-xs font-semibold text-red-300">Hidden by moderation</span>}
      </div>
    </div>
  );
}

function Owner({ row }: { row: BoostRow }) {
  return (
    <Link href={`/admin/users/${row.owner.id}`} className="text-sm font-semibold text-white hover:underline">
      {row.owner.name}
      {row.owner.username && <span className="ml-1 font-normal text-slate-400">@{row.owner.username}</span>}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_TONE[status] ?? "bg-slate-700 text-slate-300")}>
      {status}
    </span>
  );
}

export function BoostReviewList({ rows, total }: { rows: BoostRow[]; total: number }) {
  const { busy, run } = useBoostAction();
  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">Nothing waiting for review.</p>;
  }
  return (
    <div className="space-y-3">
      {total > rows.length && (
        <p className="text-xs text-slate-500">Showing the oldest {rows.length} of {fmt(total)} — the rest appear as these are decided.</p>
      )}
      {rows.map((r) => (
        <div key={r.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Owner row={r} />
            <span className="text-xs text-slate-500">Submitted {when(r.createdAt)}</span>
          </div>
          <PostPreview row={r} />
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Budget</dt>
              <dd className="font-semibold text-white">{fmt(r.budgetPoints)} Ad Points</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Duration</dt>
              <dd className="font-semibold text-white">{r.durationDays} day{r.durationDays === 1 ? "" : "s"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Paid from</dt>
              <dd className="font-semibold text-white">{payLabel(r.paidWith)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Audience</dt>
              <dd className="text-slate-200">{r.audience.join(" · ")}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy || !r.post}
              onClick={() => run(r.id, "approve")}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
            >
              {busy === `${r.id}:approve` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run(r.id, "reject")}
              className={`${btn} border border-red-500/40 text-red-300 hover:bg-red-500/10`}
            >
              {busy === `${r.id}:reject` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoostAllList({
  rows,
  status,
  statuses,
  counts,
  page,
  hasMore,
}: {
  rows: BoostRow[];
  status: string;
  statuses: string[];
  counts: Record<string, number>;
  page: number;
  hasMore: boolean;
}) {
  const { busy, run } = useBoostAction();
  const href = (s: string, p = 1) => `/admin/boosts?tab=all${s !== "ALL" ? `&status=${s}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <div className="space-y-3">
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
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()} ({fmt(counts[s] ?? 0)})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No boosts here.</p>
      ) : (
        rows.map((r) => {
          const left = Math.max(0, r.budgetPoints - r.spentPoints - r.refundedPoints);
          const pct = r.budgetPoints > 0 ? Math.min(100, Math.round((r.spentPoints / r.budgetPoints) * 100)) : 0;
          return (
            <div key={r.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={r.status} />
                  <Owner row={r} />
                </div>
                <span className="text-xs text-slate-500">
                  {r.startsAt ? `${when(r.startsAt)} → ${when(r.endsAt)}` : `Submitted ${when(r.createdAt)}`}
                </span>
              </div>
              <PostPreview row={r} />
              <div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Spent <b className="text-white">{fmt(r.spentPoints)}</b> of {fmt(r.budgetPoints)} Ad Points ({payLabel(r.paidWith)})
                  </span>
                  <span>
                    {r.refundedPoints > 0 ? <>Returned <b className="text-white">{fmt(r.refundedPoints)}</b></> : <>Left <b className="text-white">{fmt(left)}</b></>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {BOOST_EVENT_KINDS.map((k) => (
                  <div key={k} className="rounded-lg bg-slate-950/50 px-2 py-1.5 text-center">
                    <p className="text-sm font-bold text-white">{fmt(r.counts[k])}</p>
                    <p className="text-[11px] text-slate-500">{KIND_SHORT[k]}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Audience: {r.audience.join(" · ")}</p>
              {r.rejectReason && <p className="text-xs text-red-300">Reason: {r.rejectReason}</p>}
              {(r.status === "ACTIVE" || r.status === "PAUSED" || r.status === "PENDING") && (
                <div className="flex flex-wrap gap-2">
                  {r.status === "ACTIVE" && (
                    <button type="button" disabled={!!busy} onClick={() => run(r.id, "pause")} className={`${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`}>
                      {busy === `${r.id}:pause` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
                    </button>
                  )}
                  {r.status === "PAUSED" && (
                    <button type="button" disabled={!!busy} onClick={() => run(r.id, "resume")} className={`${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`}>
                      {busy === `${r.id}:resume` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Resume
                    </button>
                  )}
                  <button type="button" disabled={!!busy} onClick={() => run(r.id, "cancel")} className={`${btn} border border-red-500/40 text-red-300 hover:bg-red-500/10`}>
                    {busy === `${r.id}:cancel` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Stop and refund
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between">
          {page > 1 ? <Link href={href(status, page - 1)} className="text-sm text-sky-400 hover:underline">← Newer</Link> : <span />}
          {hasMore && <Link href={href(status, page + 1)} className="text-sm text-sky-400 hover:underline">Older →</Link>}
        </div>
      )}
    </div>
  );
}
