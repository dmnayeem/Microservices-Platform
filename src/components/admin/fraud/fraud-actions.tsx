"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, RotateCcw, UserCheck } from "lucide-react";
import { toast } from "@/lib/toast";

async function post(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/admin/fraud", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(j.error ?? "Could not save");
    return false;
  }
  return true;
}

/** Approve (reactivate, risk → 50%) or decline one suspension appeal. */
export function AppealDecision({ appealId, canManage }: { appealId: string; canManage: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "APPROVED" | "REJECTED">(null);
  if (!canManage) return null;
  const decide = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(decision);
    if (await post({ action: "appeal", appealId, decision, note: note.trim() || undefined })) {
      toast.success(decision === "APPROVED" ? "Account reactivated — risk set to 50%" : "Appeal declined");
      router.refresh();
    }
    setBusy(null);
  };
  return (
    <div className="mt-3 space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="Note to the user (sent by email, optional)"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder-slate-500"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => decide("APPROVED")}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "APPROVED" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Reactivate
        </button>
        <button
          onClick={() => decide("REJECTED")}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
        >
          {busy === "REJECTED" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Decline
        </button>
      </div>
    </div>
  );
}

/** Reset a user's risk to 0% (a false alarm). */
export function ResetRisk({ userId, canManage }: { userId: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!canManage) return null;
  return (
    <button
      onClick={async () => {
        if (!confirm("Reset this user's fraud risk to 0%?")) return;
        setBusy(true);
        if (await post({ action: "set_risk", userId, risk: 0, note: "Reset from the Fraud Monitor" })) {
          toast.success("Risk reset to 0%");
          router.refresh();
        }
        setBusy(false);
      }}
      disabled={busy}
      title="Reset risk to 0%"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
      Reset
    </button>
  );
}

/** Mark fraud events reviewed so they leave the open-alerts count. */
export function ResolveEvents({
  eventIds,
  label = "Reviewed",
  canManage,
}: {
  eventIds: string[];
  label?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!canManage || eventIds.length === 0) return null;
  return (
    <button
      onClick={async () => {
        setBusy(true);
        if (await post({ action: "resolve_events", eventIds, status: "DISMISSED" })) router.refresh();
        setBusy(false);
      }}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/**
 * Allow one member to use a device other accounts also use (a family on one
 * phone): they can sign in there and start tasks past the per-device limit.
 * Clicking again takes the permission back.
 */
export function AllowDeviceShare({
  userId,
  allowed,
  canManage,
}: {
  userId: string;
  allowed: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!canManage) {
    return allowed ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">Allowed</span> : null;
  }
  return (
    <button
      onClick={async () => {
        if (allowed && !confirm("Stop allowing this account to share a device?")) return;
        setBusy(true);
        if (await post({ action: "device_share", userId, allow: !allowed })) {
          toast.success(allowed ? "Permission removed" : "Allowed to use multiple accounts on this device");
          router.refresh();
        }
        setBusy(false);
      }}
      disabled={busy}
      title={allowed ? "Allowed to share a device. Click to remove the permission" : "Allow this account to share a device"}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
        allowed
          ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          : "border border-slate-700 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : allowed ? <Check className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
      {allowed ? "Allowed" : "Allow"}
    </button>
  );
}
