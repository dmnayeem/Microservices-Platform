"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { PriorityBadge, fmtDate } from "./ui";

interface Pending {
  assignments: Array<{ taskId: string; code: string; title: string; priority: string; dueAt: string | null; role: string; assignedBy: string }>;
  requests: Array<{ id: string; kind: string; message: string; from: string; taskId: string; code: string; title: string }>;
}

const POLL_MS = 90_000;
const HIDE_KEY = "work.pending.later";

/**
 * Team Work's persistent pop-up in the admin panel: a new assignment stays on
 * screen until it is accepted (or opened), and an update request until it is
 * answered. It is read from the assignments themselves, so it never
 * duplicates, comes back after logging in again, and a cancelled task drops
 * off on its own. "Later" only hides a card for this browser session — the
 * task stays in My Tasks and the bell.
 *
 * Polls every 90s while the tab is visible (staff only — the endpoint is 403
 * for everyone else, and then this stays silent).
 */
export function WorkAssignmentHost() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<Pending | null>(null);
  const [later, setLater] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const off = useRef(false);

  const load = useCallback(async () => {
    if (off.current || document.visibilityState === "hidden") return;
    try {
      const r = await fetch("/api/admin/work/pending", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        off.current = true;
        return;
      }
      if (r.ok) setData(await r.json());
    } catch {
      /* next tick */
    }
  }, []);

  useEffect(() => {
    try {
      setLater(JSON.parse(sessionStorage.getItem(HIDE_KEY) ?? "[]"));
    } catch {
      /* private mode */
    }
    const first = setTimeout(() => void load(), 1500);
    const id = setInterval(() => void load(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // Opening the task page itself refreshes the list (accepting there clears it).
  useEffect(() => {
    if (pathname?.startsWith("/admin/work/tasks/")) {
      const t = setTimeout(() => void load(), 2500);
      return () => clearTimeout(t);
    }
  }, [pathname, load]);

  const hide = (key: string) => {
    const next = [...later, key];
    setLater(next);
    try {
      sessionStorage.setItem(HIDE_KEY, JSON.stringify(next));
    } catch {
      /* fine */
    }
  };

  const accept = async (taskId: string) => {
    setBusy(taskId);
    try {
      const r = await fetch(`/api/admin/work/tasks/${taskId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData((d) => (d ? { ...d, assignments: d.assignments.filter((a) => a.taskId !== taskId) } : d));
      router.push(`/admin/work/tasks/${taskId}`);
    } catch (e) {
      toast.error("Couldn't accept the task", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;
  const tasks = data.assignments.filter((a) => !later.includes(`t:${a.taskId}`));
  const reqs = data.requests.filter((r) => !later.includes(`r:${r.id}`) && !(pathname === `/admin/work/tasks/${r.taskId}`));
  if (!tasks.length && !reqs.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96" aria-live="polite">
      {tasks.slice(0, 3).map((a) => (
        <div key={a.taskId} role="alertdialog" aria-label={`New task ${a.code}`} className="pointer-events-auto rounded-xl border border-blue-500/50 bg-slate-900 p-3 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-300"><ClipboardList className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-300">New task assigned · action required</p>
              <p className="truncate text-[11px] text-slate-400">{a.code} · from {a.assignedBy}</p>
            </div>
            <PriorityBadge priority={a.priority} />
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{a.title}</p>
          {a.dueAt && <p className="mt-0.5 text-xs text-slate-400">Due {fmtDate(a.dueAt, true)}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => void accept(a.taskId)} disabled={busy === a.taskId} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy === a.taskId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Accept &amp; Start
            </button>
            <button onClick={() => router.push(`/admin/work/tasks/${a.taskId}`)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Open</button>
            <button onClick={() => hide(`t:${a.taskId}`)} className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-white" title="Hide until next session — the task stays in My Tasks">Later</button>
          </div>
        </div>
      ))}
      {tasks.length > 3 && (
        <button onClick={() => router.push("/admin/work?tab=tasks")} className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 shadow-xl">
          +{tasks.length - 3} more new tasks waiting
        </button>
      )}
      {reqs.slice(0, 2).map((r) => (
        <div key={r.id} role="alertdialog" aria-label={`Update requested on ${r.code}`} className="pointer-events-auto rounded-xl border border-amber-500/50 bg-slate-900 p-3 shadow-2xl shadow-black/40">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-300"><BellRing className="h-4 w-4" />{r.kind === "REMINDER" ? "Reminder" : "Update requested"} · {r.code}</p>
          <p className="mt-1 text-sm font-semibold text-white">{r.title}</p>
          <p className="mt-1 line-clamp-3 text-xs text-slate-300"><b>{r.from}:</b> {r.message}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push(`/admin/work/tasks/${r.taskId}#report`)} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500">Submit an update</button>
            <button onClick={() => hide(`r:${r.id}`)} className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-white">Later</button>
          </div>
        </div>
      ))}
    </div>
  );
}
