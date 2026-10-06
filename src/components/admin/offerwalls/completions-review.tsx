"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, RefreshCw, Clock } from "lucide-react";
import { toast } from "@/lib/toast";
import { promptDialog, confirmDialog } from "@/lib/confirm";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { usd } from "@/lib/utils";

interface Row {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string; username: string | null; status: string } | null;
  offerTitle: string;
  completionMode: string;
  points: number;
  payoutUsd: number | null;
  proofImages: string[];
  txid: string | null;
  heldUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Offerwall review queue: PENDING completions. PROOF offers land here when the
 * user submits a screenshot; postback credits land here when held (hold window
 * or a non-ACTIVE account). Approve pays via the shared hold-release path.
 */
export function OfferwallCompletionsReview({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/offerwall/completions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRows(data.completions);
    } catch (err) {
      toast.error("Couldn't load the review queue", {
        description: err instanceof Error ? err.message : String(err),
      });
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (r: Row, action: "APPROVE" | "REJECT") => {
    let note: string | null = null;
    if (action === "REJECT") {
      note = await promptDialog({
        title: "Reject this completion?",
        description: "The user sees this reason. Nothing is paid.",
        tone: "danger",
        multiline: true,
        required: true,
        confirmLabel: "Reject",
      });
      if (!note) return;
    } else {
      const ok = await confirmDialog({
        title: `Pay ${r.points} pts?`,
        description: `"${r.offerTitle}" for ${r.user?.name ?? r.user?.email ?? r.userId}.`,
        tone: "success",
        confirmLabel: "Approve & pay",
      });
      if (!ok) return;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/admin/offerwall/completions/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(action === "APPROVE" ? `Paid ${r.points} pts` : "Rejected");
      setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          {rows.length} completion{rows.length === 1 ? "" : "s"} waiting for review.
        </p>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      {rows.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
          Nothing to review.
        </div>
      )}
      {rows.map((r) => {
        const held = r.heldUntil && new Date(r.heldUntil).getTime() > Date.now();
        return (
          <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-white font-medium break-words">{r.offerTitle}</p>
                <p className="text-xs text-slate-400 break-all">
                  {r.user?.name ?? "—"} · {r.user?.email ?? r.userId}
                  {r.user && r.user.status !== "ACTIVE" && (
                    <span className="ml-2 text-red-400">({r.user.status})</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {r.completionMode} · {r.points} pts
                  {r.payoutUsd != null && ` · network ${usd(r.payoutUsd)}`}
                  {r.txid && ` · tx ${r.txid}`} · {new Date(r.updatedAt).toLocaleString()}
                </p>
                {r.heldUntil && (
                  <p className="text-xs text-amber-400 mt-1 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {held ? `On hold until ${new Date(r.heldUntil).toLocaleString()}` : "Hold elapsed — releases on the next cron run"}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => void act(r, "APPROVE")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => void act(r, "REJECT")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}
            </div>
            {r.proofImages.length > 0 ? (
              <ImageZoomGallery images={r.proofImages} size={72} />
            ) : (
              r.completionMode === "PROOF" && <p className="text-xs text-slate-500">No screenshot attached.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
