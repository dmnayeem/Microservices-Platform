"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Loader2, Megaphone, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn, pts, usd } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import type { MemberBoost } from "@/lib/boost-view";
import { refreshMyBoosts } from "./use-post-boost";

const STATUS: Record<string, { label: string; chip: string }> = {
  PENDING: { label: "Pending review", chip: "app-chip-warn" },
  ACTIVE: { label: "Running", chip: "app-chip-in" },
  PAUSED: { label: "Paused", chip: "app-chip-info" },
  REJECTED: { label: "Rejected", chip: "app-chip-out" },
  COMPLETED: { label: "Finished", chip: "" },
  CANCELLED: { label: "Cancelled", chip: "" },
};
const OPEN = new Set(["PENDING", "ACTIVE", "PAUSED"]);

const COUNTS: { key: keyof MemberBoost["counts"]; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "views", label: "Views" },
  { key: "clicks", label: "Clicks" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
];

const day = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "—");

export function MyBoostsView({ focusId }: { focusId: string | null }) {
  const [boosts, setBoosts] = useState<MemberBoost[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/boosts", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setError(true);
      return;
    }
    const d = (await r.json()) as { boosts: MemberBoost[] };
    setError(false);
    setBoosts(d.boosts);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const replace = (b: MemberBoost) => setBoosts((list) => list?.map((x) => (x.id === b.id ? b : x)) ?? list);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-title text-white inline-flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-(--app-accent-ink)" /> My boosts
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Every post you have boosted, what it cost and what it got. To boost a post, open it in the feed and tap
          Boost under it.
        </p>
      </div>

      {error && !boosts ? (
        <div className="app-card text-center text-sm text-(--app-ink-3)">
          Could not load your boosts.{" "}
          <button onClick={() => void load()} className="font-bold text-(--app-accent-ink) underline">
            Try again
          </button>
        </div>
      ) : !boosts ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-(--app-accent-ink)" />
      ) : boosts.length === 0 ? (
        <div className="app-card text-center text-sm text-(--app-ink-3)">
          You have not boosted a post yet.{" "}
          <Link href="/social" className="font-bold text-(--app-accent-ink) underline">
            Go to the feed
          </Link>
        </div>
      ) : (
        boosts.map((b) => <BoostCard key={b.id} b={b} focused={b.id === focusId} onChanged={replace} />)
      )}
    </div>
  );
}

function BoostCard({ b, focused, onChanged }: { b: MemberBoost; focused: boolean; onChanged: (b: MemberBoost) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const st = STATUS[b.status] ?? { label: b.status, chip: "" };
  const paidLabel = b.paidWith === "AD_FUND" ? "Ad Fund" : "Ad Points";
  // An Ad Fund budget is held as USD at the rate it was created with.
  const asUsd = (n: number) => (b.paidWith === "AD_FUND" && b.rate > 0 ? ` (${usd(n / b.rate)})` : "");

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function cancel() {
    const ok = await confirmDialog({
      title: "Cancel this boost?",
      description: `It stops now. The ${pts(b.remainingPoints)} Ad Points not yet spent go back to your ${paidLabel}. What was already counted is not refunded.`,
      tone: "warning",
      confirmLabel: "Cancel boost",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/boosts/${b.id}/cancel`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (d.boost) onChanged(d.boost as MemberBoost);
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      const back = (d.boost as MemberBoost).refundedPoints;
      toast.success("Boost cancelled", {
        description: back > 0 ? `${pts(back)} Ad Points returned to your ${paidLabel}.` : undefined,
      });
      refreshMyBoosts();
    } catch (e) {
      toast.error("Could not cancel", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      ref={ref}
      className={cn("app-card space-y-3", focused && "ring-2 ring-(--app-accent-edge)")}
    >
      <div className="flex items-start gap-3">
        {b.post?.image && (
          // eslint-disable-next-line @next/next/no-img-element -- proxied media, tiny thumbnail
          <img
            src={mediaSrc(b.post.image)}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover bg-(--app-surface-2)"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("app-chip", st.chip)}>{st.label}</span>
            <span className="t-meta text-(--app-ink-3)">Created {day(b.createdAt)}</span>
          </div>
          {b.post ? (
            <Link
              href={`/post/${b.post.id}`}
              className="mt-1 block text-sm text-(--app-ink-2) line-clamp-2 hover:text-(--app-ink)"
            >
              {b.post.content || "(photo post)"}
            </Link>
          ) : (
            <p className="mt-1 text-sm italic text-(--app-ink-3)">This post was deleted.</p>
          )}
        </div>
      </div>

      {b.status === "REJECTED" && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-2.5 text-xs text-rose-100">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <b>Rejected</b>
            {b.rejectReason ? `: ${b.rejectReason}` : "."} The unspent budget was returned. Fix the post and boost it
            again from the feed (Edit &amp; resubmit under the post).
          </span>
        </p>
      )}

      {/* Money */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Budget", v: b.budgetPoints },
          { k: "Spent", v: b.spentPoints },
          { k: "Refunded", v: b.refundedPoints },
          { k: OPEN.has(b.status) ? "Still held" : "Left", v: b.remainingPoints },
        ].map((x) => (
          <div key={x.k} className="rounded-lg bg-(--app-surface-2)/60 p-2">
            <dt className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3)">{x.k}</dt>
            <dd className="text-sm font-bold text-(--app-ink) tabular-nums">
              {pts(x.v)} <span className="text-[11px] font-medium text-(--app-ink-3)">pts{asUsd(x.v)}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* What it got */}
      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {COUNTS.map((c) => (
          <div key={c.key} className="text-center">
            <dd className="text-base font-extrabold text-(--app-ink) tabular-nums">{b.counts[c.key].toLocaleString()}</dd>
            <dt className="text-[10px] uppercase tracking-wider text-(--app-ink-3)">{c.label}</dt>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--app-ink-3)">
        <span>Paid with {paidLabel}</span>
        <span>
          {b.durationDays} {b.durationDays === 1 ? "day" : "days"}
        </span>
        <span>Starts {b.startsAt ? day(b.startsAt) : "after review"}</span>
        <span>Ends {b.endsAt ? day(b.endsAt) : "—"}</span>
      </div>

      {OPEN.has(b.status) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--app-line) pt-3">
          <p className="text-[11px] text-(--app-ink-3)">
            Cancelling returns the {pts(b.remainingPoints)} Ad Points not yet spent to your {paidLabel}.
          </p>
          <button
            disabled={busy}
            onClick={cancel}
            className="app-press shrink-0 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-bold text-(--app-ink) hover:bg-(--app-surface-2) disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel boost"}
          </button>
        </div>
      )}
    </article>
  );
}
