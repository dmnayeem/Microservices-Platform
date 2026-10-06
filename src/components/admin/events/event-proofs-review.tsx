"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, ImageIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog, promptDialog } from "@/lib/confirm";
import { mediaSrc } from "@/lib/media-url";

interface ProofRow {
  userId: string;
  eventId: string;
  proofUrl: string | null;
  proofStatus: string | null;
  proofNote: string | null;
  updatedAt: string;
  user: { name: string | null; email: string; username: string | null };
  event: { title: string; rewardPoints: number; rewardXp: number; endAt: string };
}

/**
 * The review queue for "upload a proof" events. A submitted proof pays
 * nothing until an admin approves it here; approve pays the event's reward
 * once (same ledger path as a normal claim), reject sends the reason to the
 * user, who may then upload a new proof.
 */
export function EventProofsReview({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<ProofRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/events/proofs?status=PENDING", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setRows(r.ok ? (d.proofs ?? []) : []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: ProofRow, action: "approve" | "reject") => {
    let note: string | null = null;
    if (action === "approve") {
      const ok = await confirmDialog({
        title: "Approve this proof?",
        description: `Pays ${row.event.rewardPoints} points${row.event.rewardXp ? ` and ${row.event.rewardXp} XP` : ""} to ${row.user.email}.`,
        confirmLabel: "Approve and pay",
      });
      if (!ok) return;
    } else {
      note = await promptDialog({
        title: "Why is this proof not accepted?",
        description: "The user sees this and can upload a new proof.",
        required: true,
        tone: "danger",
        confirmLabel: "Reject",
      });
      if (!note?.trim()) return;
    }
    const key = `${row.eventId}:${row.userId}`;
    setBusy(key);
    try {
      const r = await fetch("/api/admin/events/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: row.eventId, userId: row.userId, action, note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not review the proof");
      toast.success(action === "approve" ? "Approved — reward paid" : "Proof rejected");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not review the proof");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white inline-flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-amber-400" /> Proofs to review
        </h2>
        <span className="text-xs text-slate-400">
          {rows == null ? "Loading…" : `${rows.length} waiting`}
        </span>
      </div>
      {rows == null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No event proofs waiting for review.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const key = `${r.eventId}:${r.userId}`;
            return (
              <div key={key} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                {r.proofUrl ? (
                  <a href={mediaSrc(r.proofUrl)} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaSrc(r.proofUrl)} alt="Proof" className="w-20 h-20 object-cover rounded-md border border-slate-700" />
                  </a>
                ) : null}
                <div className="flex-1 min-w-[180px] text-sm">
                  <p className="font-semibold text-white">{r.event.title}</p>
                  <p className="text-slate-400 break-all">
                    {r.user.name ?? r.user.username ?? "—"} ({r.user.email})
                  </p>
                  <p className="text-xs text-slate-500">
                    Reward +{r.event.rewardPoints} pts{r.event.rewardXp ? ` / +${r.event.rewardXp} XP` : ""} · sent{" "}
                    {new Date(r.updatedAt).toLocaleString()}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === key}
                      onClick={() => review(r, "approve")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === key}
                      onClick={() => review(r, "reject")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
