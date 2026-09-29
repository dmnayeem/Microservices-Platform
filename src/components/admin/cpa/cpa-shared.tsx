"use client";

import { cn } from "@/lib/utils";

/** Mirrors CPA_STATUSES / CPA_CONVERSION_STATUSES in src/lib/cpa/eligibility.ts (server-only module). */
export const OFFER_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const CONVERSION_STATUSES = ["PENDING", "HELD", "APPROVED", "REJECTED", "REVERSED"] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const inp =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60";
export const lbl = "block text-xs text-slate-400 mb-1";
export const card = "rounded-xl border border-slate-800 bg-slate-900/60";

const TONE: Record<string, string> = {
  DRAFT: "bg-slate-700/60 text-slate-300 border-slate-600",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PAUSED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ARCHIVED: "bg-slate-800 text-slate-500 border-slate-700",
  PENDING: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  HELD: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
  REVERSED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export function StatusChip({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        TONE[status] ?? TONE.DRAFT,
        className
      )}
    >
      {status}
    </span>
  );
}

/** Read `{error}` from a failed JSON response. */
export async function errorOf(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  return j?.error || `Request failed (${res.status})`;
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A light offer row used by filters (review / reports). */
export interface CpaOfferLite {
  id: string;
  title: string;
  network: string;
}
