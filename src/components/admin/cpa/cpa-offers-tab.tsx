"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { pts, usd } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { ConfirmModal } from "@/components/admin/ui/confirm-modal";
import { CpaOfferForm, type CpaOfferRow } from "./cpa-offer-form";
import { OFFER_STATUSES, StatusChip, card, errorOf, inp } from "./cpa-shared";

export function CpaOffersTab({ canManage }: { canManage: boolean }) {
  const [offers, setOffers] = useState<CpaOfferRow[] | null>(null);
  const [pointsPerUsd, setPointsPerUsd] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CpaOfferRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<CpaOfferRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cpa/offers", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorOf(res));
      const j = (await res.json()) as { offers: CpaOfferRow[]; pointsPerUsd: number };
      setOffers(j.offers);
      setPointsPerUsd(j.pointsPerUsd);
    } catch (e) {
      toast.error("Couldn't load offers", { description: e instanceof Error ? e.message : undefined });
      setOffers((o) => o ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set((offers ?? []).map((o) => o.category).filter((c): c is string => !!c))].sort(),
    [offers]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (offers ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!needle ||
          o.title.toLowerCase().includes(needle) ||
          o.network.toLowerCase().includes(needle) ||
          (o.category ?? "").toLowerCase().includes(needle))
    );
  }, [offers, status, q]);

  const setOfferStatus = async (o: CpaOfferRow, next: string) => {
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/admin/cpa/offers/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      toast.success(`"${o.title}" is now ${next.toLowerCase()}`);
      await load();
    } catch (e) {
      toast.error("Update failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/admin/cpa/offers/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed", { description: await errorOf(res) });
      return;
    }
    const j = (await res.json()) as { archived?: boolean; conversions?: number };
    if (j.archived) {
      toast.info("Archived instead of deleted", {
        description: `${j.conversions} conversion(s) reference this offer, so it is kept for the records.`,
      });
    } else {
      toast.success("Offer deleted");
    }
    setDeleting(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inp} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, network, category" />
        </div>
        <select className={`${inp} sm:w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {canManage && (
          <button onClick={() => setEditing("new")} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold whitespace-nowrap">
            <Plus className="w-4 h-4" /> New offer
          </button>
        )}
      </div>

      {offers === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : shown.length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <Target className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{offers.length === 0 ? "No CPA offers yet." : "No offers match these filters."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((o) => {
            const c = o.conversionsByStatus ?? {};
            const pending = c.PENDING ?? 0;
            const losing = o.warnings?.find((w) => w.startsWith("Users get"));
            return (
              <div key={o.id} className={`${card} p-3`}>
                <div className="flex items-start gap-3">
                  <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-800 grid place-items-center">
                    {o.logoUrl ? (
                      <SmartImage src={o.logoUrl} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <Target className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold text-white truncate max-w-full">{o.title}</p>
                      {o.featured && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Featured" />}
                      <StatusChip status={o.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {o.network}
                      {o.category ? ` · ${o.category}` : ""} · {o.completionMode === "POSTBACK" ? "Postback" : "Proof"}
                      {o.holdHours > 0 ? ` · ${o.holdHours}h hold` : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
                      <span className="text-emerald-300 font-semibold">{pts(o.points)} pts</span>
                      <span className="text-slate-300">Payout {o.payoutUsd == null ? "—" : usd(o.payoutUsd)}</span>
                      <span className="text-slate-300">
                        Conversions {pts(o.conversionsCount)} / {o.totalCap == null ? "∞" : pts(o.totalCap)}
                      </span>
                      {pending > 0 && (
                        <Link href={`/admin/cpa?tab=review&offerId=${o.id}`} className="text-blue-300 hover:underline">
                          {pts(pending)} pending
                        </Link>
                      )}
                    </div>
                    {losing && (
                      <p className="mt-1.5 flex gap-1.5 text-xs text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {losing}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 mt-2">
                  <Link href={`/admin/cpa?tab=review&offerId=${o.id}`} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Review conversions">
                    <ClipboardCheck className="w-4 h-4" />
                  </Link>
                  <Link href={`/admin/cpa?tab=reports&offerId=${o.id}`} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Report & clicks">
                    <BarChart3 className="w-4 h-4" />
                  </Link>
                  {canManage && o.status !== "ARCHIVED" && (
                    <button
                      onClick={() => setOfferStatus(o, o.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                      disabled={busyId === o.id}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
                      title={o.status === "ACTIVE" ? "Pause" : "Activate"}
                    >
                      {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : o.status === "ACTIVE" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  )}
                  <button onClick={() => setEditing(o)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title={canManage ? "Edit" : "View"}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  {canManage && (
                    <button onClick={() => setDeleting(o)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CpaOfferForm
          offer={editing === "new" ? null : editing}
          canManage={canManage}
          pointsPerUsd={pointsPerUsd}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="An offer with any conversions is archived instead — conversions back real payments and are kept."
        confirmLabel="Delete"
      />
    </div>
  );
}
