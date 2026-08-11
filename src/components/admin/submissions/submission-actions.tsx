"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface SubmissionActionsProps {
  submissionId: string;
  taskTitle: string;
  canApprove: boolean;
  canReject: boolean;
}

const REJECTION_REASONS = [
  { value: "invalid_proof", label: "Invalid proof" },
  { value: "fraud", label: "Suspected fraud" },
  { value: "incomplete", label: "Incomplete task" },
  { value: "wrong_format", label: "Wrong format" },
  { value: "duplicate", label: "Duplicate submission" },
  { value: "other", label: "Other (specify below)" },
];

export function SubmissionActions({
  submissionId,
  taskTitle,
  canApprove,
  canReject,
}: SubmissionActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [reasonKey, setReasonKey] = useState(REJECTION_REASONS[0].value);
  const [otherReason, setOtherReason] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const review = async (action: "approved" | "rejected" | "revision_requested") => {
    setBusy(true);
    try {
      const reasonLabel =
        reasonKey === "other"
          ? otherReason.trim()
          : REJECTION_REASONS.find((r) => r.value === reasonKey)?.label;

      const body: Record<string, unknown> = {
        action,
      };
      if (action === "rejected") {
        body.rejectionReason = reasonLabel;
        body.adminNote = adminNote || undefined;
      } else if (action === "revision_requested") {
        body.adminNote = adminNote || undefined;
      } else {
        body.adminNote = adminNote || undefined;
      }

      const res = await fetch(
        `/api/admin/submissions/${submissionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        action === "approved"
          ? "Submission approved"
          : action === "rejected"
          ? "Submission rejected"
          : "Revision requested"
      );
      setShowReject(false);
      setShowRevise(false);
      setAdminNote("");
      router.refresh();
    } catch (err) {
      toast.error("Failed to review", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <button
            onClick={() => review("approved")}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Approve
          </button>
        )}
        {canReject && (
          <button
            onClick={() => setShowRevise(true)}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/30 text-sm rounded-lg hover:bg-orange-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request Revision
          </button>
        )}
        {canReject && (
          <button
            onClick={() => setShowReject(true)}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 text-sm rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        )}
      </div>

      {/* Reject Modal — structured reason picker */}
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
                    Reject Submission
                  </h2>
                  <p className="text-xs text-slate-500 truncate max-w-65">
                    {taskTitle}
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
                  Admin Note (optional, shown to user)
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
                  placeholder="Additional context for the user…"
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
                onClick={() => review("rejected")}
                disabled={
                  busy || (reasonKey === "other" && !otherReason.trim())
                }
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Revision Modal */}
      {showRevise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Request Revision
                </h2>
              </div>
              <button
                onClick={() => setShowRevise(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-400 mb-4">
                Send the submission back to the user for changes. They&apos;ll
                be notified and can resubmit.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  What needs to change? *
                </label>
                <textarea
                  rows={4}
                  required
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 resize-none"
                  placeholder="Be specific so the user can address the issue…"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowRevise(false)}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => review("revision_requested")}
                disabled={busy || !adminNote.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Back for Revision
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
