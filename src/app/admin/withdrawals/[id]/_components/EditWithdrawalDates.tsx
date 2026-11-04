"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

/** ISO → the "yyyy-MM-ddTHH:mm" a datetime-local input wants, in the admin's own time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Super admin / finance admin only (the page and the API both check): move
 * the request date and the paid date earlier or later. Times are entered in
 * the admin's own time zone and sent as UTC.
 */
export function EditWithdrawalDates({
  withdrawalId,
  createdAt,
  processedAt,
  processedLabel,
}: {
  withdrawalId: string;
  createdAt: string;
  processedAt: string | null;
  processedLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(() => toLocalInput(createdAt));
  const [processed, setProcessed] = useState(() => (processedAt ? toLocalInput(processedAt) : ""));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Change dates
      </button>
    );
  }

  const save = async () => {
    const body: Record<string, string> = {};
    if (created && created !== toLocalInput(createdAt)) body.createdAt = new Date(created).toISOString();
    if (processedAt && processed && processed !== toLocalInput(processedAt)) {
      body.processedAt = new Date(processed).toISOString();
    }
    if (Object.keys(body).length === 0) {
      setOpen(false);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/dates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(j.error ?? "Could not change the dates");
      return;
    }
    toast.success("Dates updated");
    setOpen(false);
    router.refresh();
  };

  const input =
    "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white [color-scheme:dark]";
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Request created</span>
        <input type="datetime-local" value={created} onChange={(e) => setCreated(e.target.value)} className={input} />
      </label>
      {processedAt && (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">{processedLabel}</span>
          <input type="datetime-local" value={processed} onChange={(e) => setProcessed(e.target.value)} className={input} />
        </label>
      )}
      <p className="text-[11px] text-gray-500">Saved to the activity log with the old and new dates.</p>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save dates
        </button>
        <button
          onClick={() => {
            setCreated(toLocalInput(createdAt));
            setProcessed(processedAt ? toLocalInput(processedAt) : "");
            setOpen(false);
          }}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
