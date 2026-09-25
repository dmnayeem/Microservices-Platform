"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Pause,
  Play,
  X,
  RotateCcw,
  Zap,
  Mail,
  Bell,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

type Broadcast = {
  id: string;
  title: string;
  message: string;
  type: string;
  channels: { inApp?: boolean; push?: boolean; email?: boolean } | null;
  targetKind: string;
  status: string;
  scheduledFor: string | null;
  audienceReady: boolean;
  totalRecipients: number;
  inAppSent: number;
  pushSent: number;
  emailSent: number;
  emailFailed: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null } | null;
};

type Budget = {
  cap: number;
  usedToday: number;
  remainingToday: number | null;
  perMinute: number;
};

const TONE: Record<string, string> = {
  SENDING: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  SCHEDULED: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  PAUSED: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  CANCELLED: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export function BroadcastsClient() {
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/broadcasts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setRows(json.broadcasts ?? []);
      setBudget(json.emailBudget ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load broadcasts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A live send changes every few seconds; without this the screen would be a
  // snapshot that looks stuck.
  useEffect(() => {
    const live = rows.some((r) => r.status === "SENDING");
    if (!live) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [rows, load]);

  const act = async (id: string, action: string, label: string) => {
    setBusy(id + action);
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success(label);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (b: Broadcast) => {
    const ok = await confirmDialog({
      title: `Delete the record of "${b.title}"?`,
      description: "The messages already delivered stay with the users who received them — only this record goes.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(b.id + "delete");
    try {
      const res = await fetch(`/api/admin/broadcasts/${b.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Record deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {budget && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
          <p className="text-sm text-white font-medium">Email budget today</p>
          {budget.cap === 0 ? (
            <p className="text-xs text-slate-400 mt-1">
              No daily cap set. {budget.usedToday.toLocaleString()} sent today.
              Your provider still has its own limit — going past it gets the sending
              domain throttled, which takes password-reset mail down with it.
            </p>
          ) : (
            <>
              <div className="mt-2 h-2 rounded-full bg-gray-900 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{
                    width: `${Math.min(100, (budget.usedToday / budget.cap) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {budget.usedToday.toLocaleString()} of {budget.cap.toLocaleString()} used
                {" · "}
                {(budget.remainingToday ?? 0).toLocaleString()} left today
                {" · "}
                {budget.perMinute === 0 ? "unpaced" : `${budget.perMinute}/min`}
              </p>
            </>
          )}
          <p className="text-[11px] text-slate-500 mt-1">
            Change both under Settings → Email. In-app notifications and push are not
            capped — they cost nothing and hit nobody&apos;s limit.
          </p>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-slate-400">Nothing has been sent yet.</p>
      )}

      {rows.map((b) => {
        const ch = b.channels ?? {};
        const pct =
          b.totalRecipients > 0
            ? Math.min(100, Math.round((b.inAppSent / b.totalRecipients) * 100))
            : 0;
        return (
          <div key={b.id} className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      TONE[b.status] ?? TONE.CANCELLED
                    }`}
                  >
                    {b.status}
                  </span>
                  <span className="text-sm font-semibold text-white truncate">{b.title}</span>
                  <span className="text-[11px] text-slate-500">
                    {b.targetKind.toLowerCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{b.message}</p>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  {ch.inApp !== false && (
                    <span className="inline-flex items-center gap-1">
                      <Bell className="w-3 h-3" />
                      {b.inAppSent.toLocaleString()}
                      {b.totalRecipients > 0 && ` / ${b.totalRecipients.toLocaleString()}`}
                    </span>
                  )}
                  {ch.push && (
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      {b.pushSent.toLocaleString()}
                    </span>
                  )}
                  {ch.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {b.emailSent.toLocaleString()} sent
                      {b.emailFailed > 0 && (
                        <span className="text-rose-400"> · {b.emailFailed} failed</span>
                      )}
                    </span>
                  )}
                  {!b.audienceReady && b.status === "SENDING" && (
                    <span className="text-amber-300">still counting recipients…</span>
                  )}
                  {b.scheduledFor && b.status === "SCHEDULED" && (
                    <span className="text-sky-300">
                      for {new Date(b.scheduledFor).toLocaleString()}
                    </span>
                  )}
                </div>

                {b.status === "SENDING" && b.totalRecipients > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}

                {b.lastError && (
                  <p className="mt-1 text-[11px] text-rose-400">{b.lastError}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {b.status === "SENDING" && (
                  <>
                    <Btn
                      onClick={() => act(b.id, "run", "Pushed along")}
                      busy={busy === b.id + "run"}
                      icon={<Zap className="w-3.5 h-3.5" />}
                      label="Send now"
                    />
                    <Btn
                      onClick={() => act(b.id, "pause", "Paused")}
                      busy={busy === b.id + "pause"}
                      icon={<Pause className="w-3.5 h-3.5" />}
                      label="Pause"
                    />
                  </>
                )}
                {b.status === "PAUSED" && (
                  <Btn
                    onClick={() => act(b.id, "resume", "Resumed")}
                    busy={busy === b.id + "resume"}
                    icon={<Play className="w-3.5 h-3.5" />}
                    label="Resume"
                  />
                )}
                {(b.status === "SENDING" || b.status === "PAUSED" || b.status === "SCHEDULED") && (
                  <Btn
                    onClick={() => act(b.id, "cancel", "Cancelled")}
                    busy={busy === b.id + "cancel"}
                    icon={<X className="w-3.5 h-3.5" />}
                    label="Cancel"
                  />
                )}
                {b.emailFailed > 0 && (
                  <Btn
                    onClick={() => act(b.id, "retry-failed", "Retrying the failures")}
                    busy={busy === b.id + "retry-failed"}
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                    label={`Retry ${b.emailFailed}`}
                  />
                )}
                {b.status !== "SENDING" && (
                  <Btn
                    onClick={() => remove(b)}
                    busy={busy === b.id + "delete"}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    label="Delete"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Btn({
  onClick,
  busy,
  icon,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-gray-600 hover:text-white disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
