"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Check, X, Loader2 } from "lucide-react";

/**
 * Approve / reject a creator application. A BLUE_BADGE approval also gives
 * the badge, so it asks how long it lasts and needs `users.grant_badge`
 * (`canGrantBadge`) — the API enforces both.
 */
export function CreatorDecisionButtons({
  id,
  isBadge = false,
  canGrantBadge = false,
}: {
  id: string;
  isBadge?: boolean;
  canGrantBadge?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [lifetime, setLifetime] = useState(false);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const decide = async (action: "approve" | "reject") => {
    const badgeDays = parseInt(days, 10);
    if (isBadge && action === "approve" && !lifetime && !(badgeDays >= 1 && badgeDays <= 3650)) {
      toast.error("Badge length: 1 to 3650 days, or tick Lifetime.");
      return;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/creators/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          adminNote: note.trim() || undefined,
          ...(isBadge && action === "approve"
            ? lifetime
              ? { badgeLifetime: true }
              : { badgeDurationDays: badgeDays }
            : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success(
        action === "approve" ? (isBadge ? "Approved & badge granted" : "Approved & access granted") : "Rejected"
      );
      router.refresh();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  const approveBlocked = isBadge && !canGrantBadge;

  return (
    <div className="flex flex-col gap-2 shrink-0 w-full sm:w-56">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      {isBadge && canGrantBadge && (
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
      {approveBlocked && (
        <p className="text-[11px] text-slate-500">Approving gives the badge — needs the grant-badge permission.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => decide("approve")}
          disabled={busy !== null || approveBlocked}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
        >
          {busy === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Approve
        </button>
        <button
          onClick={() => decide("reject")}
          disabled={busy !== null}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 text-xs font-semibold disabled:opacity-50"
        >
          {busy === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Reject
        </button>
      </div>
    </div>
  );
}
