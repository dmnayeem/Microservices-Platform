"use client";

import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/work/model";

/** Small shared pieces for the Team Work screens. */

export async function workFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
  return j as T;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-700/50 text-slate-300",
  ASSIGNED: "bg-sky-500/15 text-sky-300",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300",
  BLOCKED: "bg-red-500/15 text-red-300",
  IN_REVIEW: "bg-violet-500/15 text-violet-300",
  CHANGES_REQUESTED: "bg-amber-500/15 text-amber-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-300",
  CANCELLED: "bg-slate-700/50 text-slate-400",
  ARCHIVED: "bg-slate-800 text-slate-500",
  NOT_STARTED: "bg-slate-700/50 text-slate-300",
  AT_RISK: "bg-orange-500/15 text-orange-300",
  ACTIVE: "bg-blue-500/15 text-blue-300",
  ON_HOLD: "bg-amber-500/15 text-amber-300",
  SUBMITTED: "bg-violet-500/15 text-violet-300",
  APPROVED: "bg-emerald-500/15 text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-300",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_TONE[status] ?? "bg-slate-700/50 text-slate-300", className)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  LOW: "text-slate-400 border-slate-700",
  NORMAL: "text-sky-300 border-sky-500/30",
  HIGH: "text-orange-300 border-orange-500/40",
  URGENT: "text-red-300 border-red-500/50 bg-red-500/10",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", PRIORITY_TONE[priority] ?? PRIORITY_TONE.NORMAL)}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

export function OverdueBadge() {
  return <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">Overdue</span>;
}

export function ProgressBar({ percent, pending = 0, className }: { percent: number; pending?: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const pend = Math.max(0, Math.min(100 - p, pending));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-800", className)} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex h-full">
        <div className="h-full bg-emerald-500" style={{ width: `${p}%` }} />
        {pend > 0 && <div className="h-full bg-violet-500/50" style={{ width: `${pend}%` }} title="Reported, waiting for review" />}
      </div>
    </div>
  );
}

export function fmtDate(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function fmtAgo(d: string | Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const card = "rounded-xl border border-slate-800 bg-slate-900 p-4";
export const input = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-60";
export const label = "block text-xs font-medium text-slate-400 mb-1";
export const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
export const btnGhost = `${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`;
export const btnDanger = `${btn} border border-red-500/40 text-red-300 hover:bg-red-500/10`;

/** A small loader-free empty/note box. */
export function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">{children}</p>;
}
