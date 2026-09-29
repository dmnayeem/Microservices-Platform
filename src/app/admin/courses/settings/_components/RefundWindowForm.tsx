"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

export function RefundWindowForm({
  initial,
  canEdit,
}: {
  initial: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState(initial);
  const [busy, setBusy] = useState(false);
  const valid = Number.isInteger(days) && days >= 0 && days <= 365;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/courses/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundWindowDays: days }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Refund window saved");
      router.refresh();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Refund window</h2>
        <p className="text-sm text-slate-400">
          How many days after enrolling a student may ask for a refund. Requests still go to
          the Refunds queue for review. 0 = students cannot request a refund.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-300">
          Days
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={Number.isFinite(days) ? days : ""}
            disabled={!canEdit}
            onChange={(e) => setDays(Number(e.target.value))}
            className={`mt-1 block w-32 px-3 py-2 bg-slate-950 border rounded-lg text-sm text-white tabular-nums focus:outline-none disabled:opacity-50 ${
              valid ? "border-slate-800" : "border-red-500"
            }`}
          />
        </label>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={busy || !valid || days === initial}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        )}
      </div>
      {!valid && <p className="text-xs text-red-400">Whole number of days, 0 to 365.</p>}
    </div>
  );
}
