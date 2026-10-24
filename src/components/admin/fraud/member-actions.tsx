"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, PauseCircle, Send, ShieldAlert, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog, promptDialog } from "@/lib/confirm";
import { REASK_MINUTES, WARNING_TEXT_MAX, suggestWarning } from "@/lib/user-warnings";

/**
 * Warn / Suspend / Ban for one member, on the Fraud Monitor.
 *
 * Warn → a pop-up the member gets the next time they open the platform, which
 * stays until they reply. Suspend → fraud route (fraud.manage; the member can
 * appeal). Ban → the users ban route, so it keeps its own users.ban gate.
 */
export function MemberActions({
  userId,
  name,
  status,
  eventType,
  fraudEventId,
  warnCount = 0,
  canManage,
  canBan,
}: {
  userId: string;
  name: string;
  status: string;
  eventType?: string | null;
  fraudEventId?: string;
  warnCount?: number;
  canManage: boolean;
  canBan: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "warn" | "suspend" | "ban">(null);
  const draft = suggestWarning(eventType);
  const [issue, setIssue] = useState(draft.issue);
  const [consequence, setConsequence] = useState(draft.consequence);

  if (!canManage) return null;
  // Usable account (an unverified sign-up included) — not already shut out.
  const active = status !== "SUSPENDED" && status !== "BANNED";

  const warn = async () => {
    setBusy("warn");
    const res = await fetch("/api/admin/fraud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "warn", userId, issue, consequence, fraudEventId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toast.error(j.error ?? "Could not send the warning");
      return;
    }
    toast.success(`Warning #${j.total} sent to ${name}`, {
      description: "It pops up the next time they open the platform.",
    });
    setOpen(false);
    router.refresh();
  };

  const suspend = async () => {
    const reason = await promptDialog({
      title: `Suspend ${name}?`,
      description: "They can't sign in until an admin reactivates them. They see this reason and can appeal.",
      placeholder: "Reason shown to the member",
      required: true,
      tone: "warning",
      confirmLabel: "Suspend",
    });
    if (!reason?.trim()) return;
    setBusy("suspend");
    const res = await fetch("/api/admin/fraud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suspend", userId, reason: reason.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toast.error(j.error ?? "Could not suspend");
      return;
    }
    toast.success(`${name} suspended`);
    router.refresh();
  };

  const ban = async () => {
    const reason = await promptDialog({
      title: `Ban ${name} permanently?`,
      description: "A ban is permanent: the account can no longer be used.",
      placeholder: "Reason (kept on the account)",
      required: true,
      tone: "danger",
      confirmLabel: "Ban",
    });
    if (!reason?.trim()) return;
    if (!(await confirmDialog({ title: `Ban ${name}?`, tone: "danger", confirmLabel: "Yes, ban" }))) return;
    setBusy("ban");
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toast.error(j.error ?? "Could not ban");
      return;
    }
    toast.success(`${name} banned`);
    router.refresh();
  };

  const btn =
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!!busy || status === "BANNED"}
          className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Warn{warnCount > 0 ? ` (${warnCount})` : ""}
        </button>
        {active && (
          <button
            type="button"
            onClick={suspend}
            disabled={!!busy}
            className={`${btn} border-orange-500/40 text-orange-300 hover:bg-orange-500/10`}
          >
            {busy === "suspend" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
            Suspend
          </button>
        )}
        {canBan && status !== "BANNED" && (
          <button
            type="button"
            onClick={ban}
            disabled={!!busy}
            className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}
          >
            {busy === "ban" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Ban
          </button>
        )}
        {!active && (
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase text-red-300 bg-red-500/10">
            {status.toLowerCase()}
          </span>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Warn {name}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Pops up the next time they open the platform and stays until they reply. Closed without a reply,
                  it comes back every {REASK_MINUTES} minutes.
                  {warnCount > 0 && ` They have been warned ${warnCount} time${warnCount === 1 ? "" : "s"} before.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-300">What they are doing</span>
              <textarea
                value={issue}
                onChange={(e) => setIssue(e.target.value.slice(0, WARNING_TEXT_MAX))}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-300">What will happen if it continues</span>
              <textarea
                value={consequence}
                onChange={(e) => setConsequence(e.target.value.slice(0, WARNING_TEXT_MAX))}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={warn}
                disabled={busy === "warn" || issue.trim().length < 5 || consequence.trim().length < 5}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy === "warn" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send warning
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
