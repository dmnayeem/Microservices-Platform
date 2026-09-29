"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts, usd } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { CountryFlag } from "@/components/admin/ui/country-flag";
import {
  CONVERSION_STATUSES,
  StatusChip,
  card,
  errorOf,
  fmtWhen,
  inp,
  type CpaOfferLite,
} from "./cpa-shared";

interface ConversionRow {
  id: string;
  status: string;
  offer: { id: string; title: string; network: string; logoUrl: string | null; holdHours: number };
  user: { id: string; username: string | null; name: string | null; email: string | null; avatar: string | null; country: string | null };
  points: number;
  payoutUsd: number | null;
  proofImages: string[];
  proofText: string | null;
  postbackVerified: boolean;
  txid: string | null;
  clickId: string | null;
  click: { id: string; country: string | null; district: string | null; ip: string | null; createdAt: string } | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  heldUntil: string | null;
  creditedAt: string | null;
  reversedAt: string | null;
  createdAt: string;
}

const QUICK_REASONS = [
  "Proof doesn't show the offer was completed",
  "Screenshot is unclear or cropped",
  "Duplicate or reused screenshot",
  "Network did not confirm the conversion",
  "Used a VPN / wrong country",
  "Account details don't match",
];

type ReasonAction = { kind: "reject" | "reverse"; ids: string[] };

export function CpaReviewTab({
  canManage,
  initialOfferId,
}: {
  canManage: boolean;
  initialOfferId?: string;
}) {
  const [status, setStatus] = useState<string>("PENDING");
  const [offerId, setOfferId] = useState(initialOfferId ?? "");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [seesMoney, setSeesMoney] = useState(false);
  const [offers, setOffers] = useState<CpaOfferLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch("/api/admin/cpa/offers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((j: { offers: CpaOfferLite[] }) => setOffers(j.offers.map((o) => ({ id: o.id, title: o.title, network: o.network }))))
      .catch(() => {});
  }, []);

  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) sp.set("status", status);
    if (offerId) sp.set("offerId", offerId);
    if (qDebounced) sp.set("q", qDebounced);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    try {
      const res = await fetch(`/api/admin/cpa/conversions?${sp}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await errorOf(res));
      const j = (await res.json()) as {
        conversions: ConversionRow[];
        counts: Record<string, number>;
        total: number;
        seesMoney: boolean;
      };
      if (mine !== seq.current) return; // a newer filter's response wins
      setRows(j.conversions);
      setCounts(j.counts);
      setTotal(j.total);
      setSeesMoney(j.seesMoney);
      setSelected(new Set());
    } catch (e) {
      toast.error("Couldn't load conversions", { description: e instanceof Error ? e.message : undefined });
      setRows((r) => r ?? []);
    }
  }, [page, status, offerId, qDebounced, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const allCount = Object.values(counts).reduce((s, n) => s + n, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectable = (r: ConversionRow) => r.status === "PENDING" || r.status === "HELD";
  const selRows = (rows ?? []).filter((r) => selected.has(r.id));
  const allSelectable = (rows ?? []).filter(selectable);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const act = async (ids: string[], action: "approve" | "reject" | "reverse", reason?: string) => {
    setBusy(ids.length === 1 ? ids[0] : "bulk");
    try {
      if (ids.length === 1) {
        const res = await fetch(`/api/admin/cpa/conversions/${ids[0]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: reason ?? null }),
        });
        if (!res.ok) throw new Error(await errorOf(res));
        const j = (await res.json()) as { status?: string };
        toast.success(
          action === "approve"
            ? j.status === "HELD"
              ? "Approved — points on hold"
              : "Approved — points paid"
            : action === "reject"
              ? "Rejected"
              : "Reversed — points taken back"
        );
      } else {
        const res = await fetch("/api/admin/cpa/conversions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action, reason: reason ?? null }),
        });
        if (!res.ok) throw new Error(await errorOf(res));
        const j = (await res.json()) as { done: number; failed: number; results: { ok: boolean; error?: string }[] };
        const firstErr = j.results.find((r) => !r.ok)?.error;
        if (j.failed) toast.warning(`${j.done} done, ${j.failed} failed`, { description: firstErr });
        else toast.success(`${j.done} ${action === "approve" ? "approved" : "rejected"}`);
      }
      await load();
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const tabs = [...CONVERSION_STATUSES, ""] as const;

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((s) => (
          <button
            key={s || "ALL"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
              status === s
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            )}
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}{" "}
            <span className="opacity-70">{pts(s ? (counts[s] ?? 0) : allCount)}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inp} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="User: username, email, name" />
        </div>
        <select className={inp} value={offerId} onChange={(e) => {
          setOfferId(e.target.value);
          setPage(1);
        }}>
          <option value="">All offers</option>
          {offers.map((o) => (
            <option key={o.id} value={o.id}>{o.title} ({o.network})</option>
          ))}
        </select>
        <input type="date" className={inp} value={from} onChange={(e) => {
          setFrom(e.target.value);
          setPage(1);
        }} aria-label="From" />
        <input type="date" className={inp} value={to} onChange={(e) => {
          setTo(e.target.value);
          setPage(1);
        }} aria-label="To" />
      </div>

      {/* Bulk bar */}
      {canManage && allSelectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              checked={selRows.length > 0 && selRows.length === allSelectable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(allSelectable.map((r) => r.id)) : new Set())}
            />
            {selRows.length ? `${selRows.length} selected` : "Select all on page"}
          </label>
          {selRows.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <button
                disabled={busy === "bulk" || !selRows.some((r) => r.status === "PENDING")}
                onClick={() => act(selRows.filter((r) => r.status === "PENDING").map((r) => r.id), "approve")}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                title="Approves the pending ones among the selection"
              >
                {busy === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
              </button>
              <button
                disabled={busy === "bulk"}
                onClick={() => setReasonFor({ kind: "reject", ids: selRows.map((r) => r.id) })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rows */}
      {rows === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : rows.length === 0 ? (
        <div className={`${card} p-10 text-center text-sm text-slate-400`}>Nothing here.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const who = r.user.username || r.user.name || r.user.email || r.user.id;
            const loc = r.click?.country || r.user.country;
            return (
              <div key={r.id} className={cn(card, "p-3", selected.has(r.id) && "border-blue-500/50")}>
                <div className="flex items-start gap-3">
                  {canManage && selectable(r) && (
                    <input type="checkbox" className="mt-2 h-4 w-4 accent-blue-500 shrink-0" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" />
                  )}
                  <div className="relative w-9 h-9 shrink-0 rounded-full overflow-hidden bg-slate-800 grid place-items-center">
                    {r.user.avatar ? (
                      <SmartImage src={r.user.avatar} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a href={`/admin/users/${r.user.id}`} className="font-semibold text-white hover:underline truncate">{who}</a>
                      <StatusChip status={r.status} />
                      {r.postbackVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <ShieldCheck className="w-3 h-3" /> Postback verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {loc && <CountryFlag code={loc} showName />}
                      {r.click?.district && <span>· {r.click.district}</span>}
                      <span>· {r.offer.title} ({r.offer.network})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Submitted {fmtWhen(r.createdAt)} · <span className="text-emerald-300 font-semibold">{pts(r.points)} pts</span>
                      {seesMoney && r.payoutUsd != null && <> · payout {usd(r.payoutUsd)}</>}
                    </p>
                    {r.clickId && (
                      <p className="text-[11px] text-slate-500 font-mono break-all">
                        click {r.clickId}
                        {r.click?.ip ? ` · ${r.click.ip}` : ""}
                        {r.txid ? ` · txid ${r.txid}` : ""}
                      </p>
                    )}
                    {r.status === "HELD" && r.heldUntil && (
                      <p className="text-xs text-violet-300">On hold until {fmtWhen(r.heldUntil)}</p>
                    )}
                    {r.rejectionReason && (r.status === "REJECTED" || r.status === "REVERSED") && (
                      <p className="text-xs text-red-300">Reason: {r.rejectionReason}</p>
                    )}
                    {r.proofText && (
                      <p className="text-sm text-slate-200 whitespace-pre-wrap break-words rounded-lg bg-slate-950 border border-slate-800 p-2">{r.proofText}</p>
                    )}
                    {r.proofImages.length > 0 && <ImageZoomGallery images={r.proofImages} size={72} />}
                  </div>
                </div>

                {canManage && r.status !== "REJECTED" && r.status !== "REVERSED" && (
                  <div className="flex flex-wrap justify-end gap-2 mt-2">
                    {r.status === "PENDING" && (
                      <button
                        disabled={busy === r.id}
                        onClick={() => act([r.id], "approve")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Approve{r.offer.holdHours > 0 ? ` (${r.offer.holdHours}h hold)` : ""}
                      </button>
                    )}
                    {(r.status === "PENDING" || r.status === "HELD") && (
                      <button
                        disabled={busy === r.id}
                        onClick={() => setReasonFor({ kind: "reject", ids: [r.id] })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 text-xs font-semibold"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                    {r.status === "APPROVED" && (
                      <button
                        disabled={busy === r.id}
                        onClick={() => setReasonFor({ kind: "reverse", ids: [r.id] })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 text-orange-400 text-xs font-semibold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reverse
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-slate-400">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-2 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
          Page {page} of {pages}
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {reasonFor && (
        <ReasonModal
          action={reasonFor}
          onClose={() => setReasonFor(null)}
          onSubmit={async (reason) => {
            const a = reasonFor;
            setReasonFor(null);
            await act(a.ids, a.kind, reason);
          }}
        />
      )}
    </div>
  );
}

function ReasonModal({
  action,
  onClose,
  onSubmit,
}: {
  action: ReasonAction;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const reverse = action.kind === "reverse";
  const n = action.ids.length;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white">
          {reverse ? "Reverse this conversion" : n > 1 ? `Reject ${n} conversions` : "Reject this conversion"}
        </h3>
        <p className="text-xs text-slate-400">
          {reverse
            ? "The paid points are taken back from the user's balance. The reason is recorded."
            : "The user is notified with this reason."}
        </p>
        {!reverse && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-2.5 py-1 text-[11px]", reason === r ? "border-red-500 bg-red-500/15 text-red-200" : "border-slate-700 bg-slate-800 text-slate-300 hover:text-white")}>
                {r}
              </button>
            ))}
          </div>
        )}
        <textarea autoFocus rows={3} className={`${inp} resize-y`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={1000} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold">Cancel</button>
          <button
            disabled={!reason.trim()}
            onClick={() => onSubmit(reason.trim())}
            className={cn("px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50", reverse ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700")}
          >
            {reverse ? "Reverse" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
