"use client";

import { confirmDialog } from "@/lib/confirm";

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

interface KycReviewActionsProps {
  documentId: string;
  userName: string;
  canApprove: boolean;
  canReject: boolean;
  /** Pass-through for the spec checklist (returned in audit log). */
  checklistDefaults?: { id: string; label: string }[];
}

const REJECTION_REASONS = [
  { value: "blurry", label: "Blurry / unreadable image" },
  { value: "mismatch", label: "Name doesn't match ID" },
  { value: "expired", label: "ID has expired" },
  { value: "fake", label: "Fake / suspicious document" },
  { value: "selfie", label: "Selfie doesn't match ID photo" },
  { value: "incomplete", label: "Incomplete documents" },
  { value: "other", label: "Other (specify below)" },
];

const DEFAULT_CHECKLIST = [
  { id: "name", label: "Name matches ID" },
  { id: "photo", label: "Photo is clear" },
  { id: "selfie", label: "Selfie matches ID photo" },
  { id: "expiry", label: "ID not expired" },
];

export function KycReviewActions({
  documentId,
  userName,
  canApprove,
  canReject,
  checklistDefaults = DEFAULT_CHECKLIST,
}: KycReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [reasonKey, setReasonKey] = useState(REJECTION_REASONS[0].value);
  const [otherReason, setOtherReason] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const allChecked = checklistDefaults.every((c) => checks[c.id]);

  const submit = async (
    action: "approve" | "reject" | "request_more",
    extra: Record<string, unknown> = {}
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/kyc/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        action === "approve"
          ? "KYC approved"
          : action === "reject"
          ? "KYC rejected"
          : "Request for more info sent"
      );
      setShowReject(false);
      setShowRequest(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to review", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!allChecked) {
      const ok = await confirmDialog({
        title: "Approve anyway?",
        description: "Not all checklist items are checked.",
        tone: "warning",
        confirmLabel: "Approve",
      });
      if (!ok) return;
    }
    submit("approve", { decisionNote });
  };

  const reject = () => {
    const reasonLabel =
      reasonKey === "other"
        ? otherReason.trim()
        : REJECTION_REASONS.find((r) => r.value === reasonKey)?.label;
    if (!reasonLabel) {
      toast.error("Please select or specify a reason");
      return;
    }
    submit("reject", { rejectionReason: reasonLabel, decisionNote });
  };

  return (
    <div className="space-y-4">
      {/* Verification Checklist */}
      <div>
        <p className="text-sm text-slate-400 mb-2 font-medium">
          Verification Checklist:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {checklistDefaults.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 cursor-pointer text-sm text-slate-300"
            >
              <input
                type="checkbox"
                checked={!!checks[c.id]}
                onChange={(e) =>
                  setChecks((p) => ({ ...p, [c.id]: e.target.checked }))
                }
                className="rounded bg-slate-900 border-slate-600 text-emerald-500"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {/* Decision Note */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Decision Note (optional, shown to user)
        </label>
        <textarea
          rows={2}
          value={decisionNote}
          onChange={(e) => setDecisionNote(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          placeholder="Additional context"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 justify-end">
        {canReject && (
          <button
            onClick={() => setShowRequest(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request More Info
          </button>
        )}
        {canReject && (
          <button
            onClick={() => setShowReject(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        )}
        {canApprove && (
          <button
            onClick={approve}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Approve
          </button>
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
                  <h3 className="text-lg font-semibold text-white">
                    Reject KYC
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-65">
                    {userName}
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
                    Specify Reason *
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
                  Note to User
                </label>
                <textarea
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
                  placeholder="What should they do differently next time?"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowReject(false)}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject KYC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request More Info Modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Request More Info
                </h3>
              </div>
              <button
                onClick={() => setShowRequest(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                What additional documents do you need? *
              </label>
              <textarea
                rows={4}
                required
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                placeholder="e.g. Please upload a clearer photo of the back of your ID."
              />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowRequest(false)}
                disabled={busy}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  submit("request_more", { decisionNote: requestNote })
                }
                disabled={busy || !requestNote.trim()}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
