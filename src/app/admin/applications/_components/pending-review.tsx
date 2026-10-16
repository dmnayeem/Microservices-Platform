"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCircle2, ExternalLink, Loader2, X, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApplicationAnswers } from "@/components/shared/application-questions";
import type { AnswerView } from "@/lib/application-requirements";

export interface PendingItem {
  kind: "creator" | "tutor" | "ambassador";
  /** Application id (ambassador: the member's id — that API is keyed by member). */
  id: string;
  userId: string;
  program: string;
  programLabel: string;
  user: { name: string | null; email: string } | null;
  createdAt: string;
  message: string;
  detail: string | null;
  links: string[];
  answers: AnswerView[];
  checks: { label: string; met: boolean }[];
  /** Can this reviewer decide it (the program's own review permission)? */
  canDecide: boolean;
  /** BLUE_BADGE: approval gives the badge and needs users.grant_badge. */
  isBadge: boolean;
  canGrantBadge: boolean;
  reviewHref: string;
}

/** Every waiting application, reviewable right here through each program's own API. */
export function PendingReview({ items }: { items: PendingItem[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <h2 className="px-4 pt-4 text-sm font-bold text-white">Waiting for review ({items.length})</h2>
      <p className="px-4 text-xs text-slate-400">
        Approve or reject here — the same as on each program&apos;s review page, with the same permissions. The
        requirement checks are run against the applicant now.
      </p>
      <div className="p-3 space-y-2">
        {items.map((it) => (
          <PendingCard key={`${it.kind}-${it.id}`} item={it} />
        ))}
      </div>
    </section>
  );
}

function PendingCard({ item: it }: { item: PendingItem }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [lifetime, setLifetime] = useState(false);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const approveBlocked = !it.canDecide || (it.isBadge && !it.canGrantBadge);

  const decide = async (action: "approve" | "reject") => {
    const badgeDays = parseInt(days, 10);
    if (it.isBadge && action === "approve" && !lifetime && !(badgeDays >= 1 && badgeDays <= 3650)) {
      toast.error("Badge length: 1 to 3650 days, or tick Lifetime.");
      return;
    }
    const adminNote = note.trim() || undefined;
    let url: string;
    let body: Record<string, unknown>;
    if (it.kind === "creator") {
      url = `/api/admin/creators/applications/${it.id}`;
      body = {
        action,
        adminNote,
        ...(it.isBadge && action === "approve"
          ? lifetime
            ? { badgeLifetime: true }
            : { badgeDurationDays: badgeDays }
          : {}),
      };
    } else if (it.kind === "tutor") {
      url = `/api/admin/tutors/applications/${it.id}`;
      body = { action, adminNote: adminNote ?? null };
    } else {
      url = "/api/admin/ambassadors";
      body = { userId: it.userId, status: action === "approve" ? "APPROVED" : "REJECTED", adminNote: adminNote ?? "" };
    }
    setBusy(action);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success(action === "approve" ? "Approved" : "Rejected");
      router.refresh();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  const unmet = it.checks.filter((c) => !c.met).length;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">
            {it.user?.name ?? it.user?.email ?? "Unknown"}
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300">
              {it.programLabel}
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {it.user?.email} · {new Date(it.createdAt).toLocaleString()} ·{" "}
            <Link href={it.reviewHref} className="text-indigo-300 hover:underline">
              Review page
            </Link>
          </p>
          {it.message && <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap line-clamp-6">{it.message}</p>}
          {it.detail && (
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-slate-500">Detail:</span> {it.detail}
            </p>
          )}
          {it.links.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {it.links.map((l, i) => (
                <a
                  key={i}
                  href={l}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline break-all"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {l.replace(/^https?:\/\//, "").slice(0, 40)}
                </a>
              ))}
            </div>
          )}
          <ApplicationAnswers answers={it.answers} />
          <div className="mt-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Requirements {it.checks.length === 0 ? "— none set" : unmet ? `— ${unmet} not met` : "— all met"}
            </p>
            {it.checks.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {it.checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    {c.met ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 mt-px shrink-0 text-red-400" />
                    )}
                    <span className={c.met ? "text-slate-400" : "text-slate-200"}>{c.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {it.canDecide ? (
          <div className="flex flex-col gap-2 shrink-0 w-full lg:w-60">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Note to the applicant (optional)"
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
            {it.isBadge && it.canGrantBadge && (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={days}
                  disabled={lifetime}
                  onChange={(e) => setDays(e.target.value)}
                  aria-label="Badge length in days"
                  className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs disabled:opacity-50"
                />
                days
                <label className="ml-auto inline-flex items-center gap-1">
                  <input type="checkbox" checked={lifetime} onChange={(e) => setLifetime(e.target.checked)} />
                  Lifetime
                </label>
              </div>
            )}
            {it.isBadge && !it.canGrantBadge && (
              <p className="text-[11px] text-slate-500">Approving gives the badge — needs the grant-badge permission.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decide("approve")}
                disabled={busy !== null || approveBlocked}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {busy === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => decide("reject")}
                disabled={busy !== null}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 text-xs font-semibold disabled:opacity-50"
              >
                {busy === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Reject
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 lg:w-60">You can view this one; deciding needs that program&apos;s review permission.</p>
        )}
      </div>
    </div>
  );
}
