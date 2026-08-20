"use client";
import { usd } from "@/lib/utils";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface WithdrawalActionsProps {
  withdrawalId: string;
  status: string;
  amount: number;
  netAmount: number;
  method: string;
  existingTransactionId: string | null;
}

const REJECTION_REASONS = [
  { value: "fraud", label: "Suspected fraud" },
  { value: "invalid_payout", label: "Invalid payout details" },
  { value: "kyc_required", label: "KYC verification required" },
  { value: "insufficient_balance", label: "Insufficient balance" },
  { value: "account_suspended", label: "Account suspended" },
  { value: "other", label: "Other (specify below)" },
];

/**
 * Status-aware Process panel per admin_oo.md §5.07.
 *
 * - PENDING:    Approve & Mark as Processing  /  Reject
 * - PROCESSING: Mark as Paid (transaction ref required)  /  Reject
 * - PAID/REJECTED: read-only summary
 */
export function WithdrawalActions({
  withdrawalId,
  status,
  amount,
  netAmount,
  method,
  existingTransactionId,
}: WithdrawalActionsProps) {
  const router = useRouter();
  const [showReject, setShowReject] = useState(false);
  const [transactionId, setTransactionId] = useState(existingTransactionId ?? "");
  const [adminNote, setAdminNote] = useState("");
  const [reasonKey, setReasonKey] = useState(REJECTION_REASONS[0].value);
  const [otherReason, setOtherReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(data.message ?? "Updated");
      router.refresh();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error("Failed to update", { description: msg });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = () => post({ action: "approve", transactionId: transactionId || undefined, adminNote });
  const markPaid = () => post({ action: "mark_paid", transactionId, adminNote });
  const reject = () => {
    const reasonLabel =
      reasonKey === "other"
        ? otherReason.trim()
        : REJECTION_REASONS.find((r) => r.value === reasonKey)?.label;
    if (!reasonLabel) {
      setError("Please select or specify a reason");
      return;
    }
    post({ action: "reject", rejectionReason: reasonLabel, adminNote }).then((ok) => {
      if (ok) setShowReject(false);
    });
  };

  // Read-only state for finished statuses
  if (status === "COMPLETED" || status === "CANCELLED") {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Payment Details
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Status</span>
            <span className="text-emerald-400 font-medium">{status}</span>
          </div>
          {existingTransactionId && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Transaction Ref</span>
              <span className="text-white font-mono text-xs truncate">
                {existingTransactionId}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-emerald-400" />
        Process Withdrawal
      </h2>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="rounded-lg bg-slate-800/50 p-3 text-sm">
        <p className="text-slate-400">
          Amount to send:{" "}
          <span className="text-white font-semibold">
            {usd(netAmount)}
          </span>{" "}
          via {method}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          (Gross {usd(amount)} — net is after fee)
        </p>
      </div>

      {/* PENDING — show Approve & Reject (no payment ref needed yet) */}
      {status === "PENDING" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Transaction Reference (optional)
            </label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Optional — can be added when marking paid"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Admin Note
            </label>
            <textarea
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Internal note"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={approve}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Approve & Mark Processing
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 inline mr-1" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* PROCESSING — Mark as Paid (transactionId required) or reject */}
      {status === "PROCESSING" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Transaction Reference *
              <span className="text-slate-600 ml-2">
                Required — paste the bank/wallet payment ID
              </span>
            </label>
            <input
              type="text"
              required
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. BKASH-TX-12345"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Admin Note
            </label>
            <textarea
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Internal note"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={markPaid}
              disabled={busy || !transactionId.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Mark as Paid
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 inline mr-1" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal — shared between PENDING and PROCESSING */}
      {showReject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowReject(false)}
        >
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Reject withdrawal?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {usd(amount)} will be refunded to user balance
              </p>
            </div>
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
                Message to User
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
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
    </div>
  );
}
