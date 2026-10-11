"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";

interface Row {
  id: string;
  title: string;
  description: string | null;
  biddingEndsAt: string;
  displayHours: number;
  minBid: number;
  bidStep: number;
  status: string;
  winnerBid: number | null;
  bids: number;
  topBid: number | null;
}

const inp = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60";
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function AdminSpotlightView({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState(() => ({
    title: "Feed Spotlight — 24 hours",
    description: "Your post at the top of the feed for a day.",
    biddingEndsAt: local(new Date(Date.now() + 3 * 86_400_000)),
    displayHours: "24",
    minBid: "200",
    bidStep: "20",
  }));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/spotlight", { cache: "no-store" }).catch(() => null);
    setRows(r?.ok ? (await r.json()).auctions ?? [] : []);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, biddingEndsAt: new Date(f.biddingEndsAt).toISOString() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't create");
      toast.success("Spotlight opened for bids");
      setForm(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create");
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: string, action: "close" | "cancel") => {
    if (!confirm(action === "close" ? "Close now? The current top bid wins." : "Cancel? The held bid is returned.")) return;
    const r = await fetch(`/api/admin/spotlight/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    toast.success(action === "close" ? `Closed — ${d.result}` : "Cancelled and refunded");
    void load();
  };

  const label = "block text-xs font-medium text-slate-400 mb-1";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
            <Sparkles className="h-6 w-6 text-amber-400" /> Spotlight
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            An open auction in points for a featured place in the feed. The highest bid when bidding ends wins; its post
            is promoted for the hours you set. Only the top bid is held — an outbid member gets their points back at
            once. Winners&apos; points are spent (a points sink). Closed automatically every 10 minutes after the end.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setForm((x) => !x)} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
            <Plus className="h-4 w-4" /> New Spotlight
          </button>
        )}
      </div>

      {form && (
        <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Title</label><input className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={label}>Description</label><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div><label className={label}>Bidding ends</label><input type="datetime-local" className={inp} value={f.biddingEndsAt} onChange={(e) => setF({ ...f, biddingEndsAt: e.target.value })} /></div>
          <div><label className={label}>Featured for (hours)</label><input type="number" min={1} max={168} className={inp} value={f.displayHours} onChange={(e) => setF({ ...f, displayHours: e.target.value })} /></div>
          <div><label className={label}>Starting bid (points)</label><input type="number" min={1} className={inp} value={f.minBid} onChange={(e) => setF({ ...f, minBid: e.target.value })} /></div>
          <div><label className={label}>Minimum raise (points)</label><input type="number" min={1} className={inp} value={f.bidStep} onChange={(e) => setF({ ...f, bidStep: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <button type="button" onClick={create} disabled={saving} className={`${btn} bg-red-600 text-white`}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Open for bids
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No Spotlight auctions yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div>
                <p className="font-semibold text-white">{a.title}</p>
                <p className="text-xs text-slate-400">
                  {a.status} · {a.bids} bidders · top {a.topBid ?? "—"} pts · ends {new Date(a.biddingEndsAt).toLocaleString()} · featured {a.displayHours}h
                </p>
              </div>
              {canManage && a.status === "OPEN" && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => act(a.id, "close")} className={`${btn} border border-slate-700 text-slate-200`}>Close now</button>
                  <button type="button" onClick={() => act(a.id, "cancel")} className={`${btn} border border-red-500/40 text-red-300`}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
