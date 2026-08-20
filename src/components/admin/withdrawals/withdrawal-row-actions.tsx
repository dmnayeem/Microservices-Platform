"use client";
import { usd } from "@/lib/utils";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { Eye } from "lucide-react";

interface WithdrawalRowActionsProps {
  withdrawalId: string;
  status: string;
  amount: number;
  canProcess: boolean;
}

const REJECTION_REASONS = [
  { value: "fraud", label: "Suspected fraud" },
  { value: "invalid_payout", label: "Invalid payout details" },
  { value: "kyc_required", label: "KYC verification required" },
  { value: "insufficient_balance", label: "Insufficient balance" },
  { value: "account_suspended", label: "Account suspended" },
  { value: "other", label: "Other (specify below)" },
];

export function WithdrawalRowActions({
  withdrawalId,
  status,
  amount,
  canProcess,
}: WithdrawalRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reasonKey, setReasonKey] = useState(REJECTION_REASONS[0].value);
  const [otherReason, setOtherReason] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const approve = async () => {
    if (!(await confirmDialog({ title: `Approve ${usd(amount)} withdrawal?`, description: "It will be marked approved & processing.", tone: "success", confirmLabel: "Approve" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Withdrawal approved & moved to Processing");
      router.refresh();
    } catch (err) {
      toast.error("Failed to approve", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const reasonLabel =
      reasonKey === "other"
        ? otherReason.trim()
        : REJECTION_REASONS.find((r) => r.value === reasonKey)?.label;
    if (!reasonLabel) {
      toast.error("Please select or specify a reason");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejectionReason: reasonLabel,
          adminNote: adminNote || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Withdrawal rejected — funds returned to user");
      setShowReject(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to reject", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Link
          href={`/admin/withdrawals/${withdrawalId}`}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="View details"
        >
          <Eye className="w-4 h-4" />
        </Link>
        {canProcess && status === "PENDING" && (
          <>
            <button
              onClick={approve}
              disabled={busy}
              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
              title="Approve & process"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
              title="Reject"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Reject Modal */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Reject Withdrawal
                  </h2>
                  <p className="text-xs text-slate-500">
                    {usd(amount)} will be refunded
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReject(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Rejection Reason *
                </label>
                <select
                  value={reasonKey}
                  onChange={(e) => setReasonKey(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {reasonKey === "other" && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Specify Reason
                  </label>
                  <input
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Message to user (optional)
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowReject(false)}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject & Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
