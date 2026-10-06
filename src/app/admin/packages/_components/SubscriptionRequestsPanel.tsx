"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";

interface RequestRow {
  id: string;
  user: { id: string; name: string; email: string; currentPackage: string | null };
  package: { name: string };
  amount: number;
  paymentMethod: string | null;
  transactionId: string | null;
  proofUrl: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
}

const days = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/**
 * Off-platform plan requests (bKash / Nagad / crypto / card) waiting for an
 * admin to check the payment. Approve activates the plan for the term the
 * user paid for; reject cancels the request (a reason is required and sent to
 * the user). Before this there was no screen for it — the API existed, but
 * nothing called it, so every such request sat pending forever.
 */
export function SubscriptionRequestsPanel({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/subscriptions?status=pending&limit=50", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setRows(r.ok ? (d.subscriptions ?? []) : []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (row: RequestRow, action: "approve" | "reject") => {
    let rejectionReason: string | undefined;
    if (action === "approve") {
      if (!confirm(`Approve ${row.package.name} for ${row.user.email}? Only approve once you have seen ${usd(row.amount)} arrive (txn ${row.transactionId ?? "—"}).`)) return;
    } else {
      const reason = prompt("Why is this request rejected? The user will see this.");
      if (!reason?.trim()) return;
      rejectionReason = reason.trim();
    }
    setBusy(row.id);
    try {
      const res = await fetch(`/api/admin/subscriptions/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not update the request");
      toast.success(action === "approve" ? "Plan activated" : "Request rejected");
      await load();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the request");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Plan payment requests</h2>
        <span className="text-xs text-gray-500">
          {rows == null ? "Loading…" : `${rows.length} awaiting verification`}
        </span>
      </div>
      {rows == null ? (
        <div className="py-6 text-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin inline" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No plan requests waiting for payment verification.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 flex flex-wrap items-start gap-3">
              {r.proofUrl ? (
                <a href={mediaSrc(r.proofUrl)} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(r.proofUrl)} alt="Payment proof" className="w-20 h-20 object-cover rounded-md border border-gray-700" />
                </a>
              ) : (
                <div className="w-20 h-20 rounded-md border border-dashed border-gray-700 grid place-items-center text-[10px] text-gray-500 text-center px-1">
                  No proof
                </div>
              )}
              <div className="flex-1 min-w-[200px] text-sm">
                <p className="font-semibold text-white">
                  {r.package.name} · {usd(r.amount)} · {days(r.startDate, r.endDate)} days
                </p>
                <p className="text-gray-400 break-all">
                  {r.user.name} ({r.user.email}) — now on {r.user.currentPackage ?? "default plan"}
                </p>
                <p className="text-gray-400">
                  {r.paymentMethod ?? "CARD"} · Txn ID{" "}
                  <span className="font-mono text-gray-200 break-all">{r.transactionId ?? "—"}</span>
                </p>
                <p className="text-xs text-gray-500">Requested {new Date(r.createdAt).toLocaleString()}</p>
                {r.proofUrl && (
                  <a href={mediaSrc(r.proofUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
                    Open proof <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r, "approve")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r, "reject")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
