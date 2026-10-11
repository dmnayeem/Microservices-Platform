"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Medal } from "lucide-react";
import { toast } from "@/lib/toast";
import type { AmbassadorConfig } from "@/lib/ambassadors";

interface AppRow {
  userId: string;
  message: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  user: { name: string | null; email: string; level: number; kycStatus: string } | null;
  thisMonth: number | null;
  projected: number | null;
}
interface Payout {
  id: string;
  userId: string;
  month: string;
  qualified: number;
  points: number;
}

const inp = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60";

export function AdminAmbassadorsView({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<{ config: AmbassadorConfig; month: string; applications: AppRow[]; payouts: Payout[] } | null>(null);
  const [cfg, setCfg] = useState<AmbassadorConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [payMonth, setPayMonth] = useState(() => {
    const d = new Date();
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1));
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/ambassadors", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setData(d);
    setCfg(d.config);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!data || !cfg) return <Loader2 className="h-6 w-6 animate-spin text-slate-400" />;
  const set = (patch: Partial<AmbassadorConfig>) => setCfg({ ...cfg, ...patch });
  const num = (k: keyof AmbassadorConfig) => ({
    type: "number" as const,
    min: 0,
    value: String(cfg[k] as number),
    disabled: !canManage,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) || 0 } as Partial<AmbassadorConfig>),
    className: inp,
  });

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ambassadors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save");
      toast.success("Ambassador settings saved");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (userId: string, status: string) => {
    const note = status === "APPROVED" ? "" : prompt("Note to the member (optional)") ?? "";
    const r = await fetch("/api/admin/ambassadors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, status, adminNote: note }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    void load();
  };

  const pay = async () => {
    if (!confirm(`Pay the ambassador bonus for ${payMonth}? Each ambassador is paid once per month.`)) return;
    const r = await fetch("/api/admin/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: payMonth }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't pay");
    toast.success(`${payMonth}: ${d.paid} paid (${d.points} pts), ${d.skipped} already paid / skipped`);
    void load();
  };

  const label = "block text-xs font-medium text-slate-400 mb-1";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Medal className="h-6 w-6 text-amber-400" /> Ambassadors
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Members apply; you approve. Approved ambassadors get a separate monthly bonus for each new member they bring
          in who becomes active (does the set number of tasks). The 3-level referral commission is not touched — this
          is paid on its own: each month at the start of the month after next, so late joiners have time to qualify (or any finished month with &ldquo;Pay month&rdquo;). A referral counts only if it isn&apos;t on the ambassador&apos;s device or browser, and visit tasks don&apos;t count.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <label className="inline-flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={cfg.enabled} disabled={!canManage} onChange={(e) => set({ enabled: e.target.checked })} /> Program open
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={label}>Level to apply</label><input {...num("minLevelToApply")} /></div>
          <div><label className={label}>Active referrals to apply</label><input {...num("minReferralsToApply")} /></div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={cfg.requireKyc} disabled={!canManage} onChange={(e) => set({ requireKyc: e.target.checked })} /> KYC needed to apply
            </label>
          </div>
          <div><label className={label}>A new member counts after … approved tasks</label><input {...num("qualifyTasks")} /></div>
          <div><label className={label}>Points per counted member</label><input {...num("pointsPerReferral")} /></div>
          <div><label className={label}>Monthly target (members, 0 = none)</label><input {...num("monthlyTarget")} /></div>
          <div><label className={label}>Bonus at the target (points)</label><input {...num("targetBonus")} /></div>
          <div><label className={label}>Monthly cap per ambassador (0 = none)</label><input {...num("monthlyCap")} /></div>
        </div>
        {canManage && (
          <button type="button" onClick={save} disabled={saving} className={`${btn} bg-red-600 text-white`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Applications & ambassadors</h2>
          {canManage && (
            <div className="flex items-center gap-2">
              <input className={`${inp} !w-32`} value={payMonth} onChange={(e) => setPayMonth(e.target.value)} placeholder="YYYY-MM" />
              <button type="button" onClick={pay} className={`${btn} bg-amber-600 text-white`}>Pay month</button>
            </div>
          )}
        </div>
        {data.applications.length === 0 ? (
          <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No applications yet.</p>
        ) : (
          data.applications.map((a) => (
            <div key={a.userId} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{a.user?.name ?? a.user?.email ?? a.userId}</span>
                <span className="text-xs text-slate-500">L{a.user?.level ?? 0} · KYC {a.user?.kycStatus ?? "?"}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${a.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" : a.status === "PENDING" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{a.status}</span>
                {a.thisMonth != null && (
                  <span className="text-xs text-sky-300">{data.month}: {a.thisMonth} active new · {a.projected} pts so far</span>
                )}
                {canManage && (
                  <span className="ml-auto flex gap-2">
                    {a.status !== "APPROVED" && <button type="button" onClick={() => decide(a.userId, "APPROVED")} className={`${btn} !py-1 bg-emerald-600/80 text-white`}>Approve</button>}
                    {a.status === "PENDING" && <button type="button" onClick={() => decide(a.userId, "REJECTED")} className={`${btn} !py-1 border border-red-500/40 text-red-300`}>Reject</button>}
                    {a.status === "APPROVED" && <button type="button" onClick={() => decide(a.userId, "REMOVED")} className={`${btn} !py-1 border border-slate-700 text-slate-300`}>Remove</button>}
                  </span>
                )}
              </div>
              {a.message && <p className="mt-1 text-xs text-slate-400">{a.message}</p>}
            </div>
          ))
        )}
      </div>

      {data.payouts.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Recent payouts</h2>
          {data.payouts.map((p) => {
            const who = data.applications.find((a) => a.userId === p.userId)?.user;
            return (
              <p key={p.id} className="flex justify-between text-xs text-slate-300">
                <span>{p.month} · {who?.name ?? who?.email ?? p.userId} · {p.qualified} active new</span>
                <b>{p.points} pts</b>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
