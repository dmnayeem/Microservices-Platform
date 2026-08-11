"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Ban, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface BanUserModalProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  open: boolean;
  onClose: () => void;
}

const REASONS = [
  { value: "fraud", label: "Fraud / Suspicious activity" },
  { value: "tos", label: "Violates Terms of Service" },
  { value: "spam", label: "Spam / Abusive behaviour" },
  { value: "duplicate", label: "Duplicate / Multiple accounts" },
  { value: "harassment", label: "Harassment / Hate speech" },
  { value: "other", label: "Other (specify below)" },
];

const DURATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "permanent", label: "Permanent" },
];

export function BanUserModal({
  userId,
  userName,
  userEmail,
  open,
  onClose,
}: BanUserModalProps) {
  const router = useRouter();
  const [reasonKey, setReasonKey] = useState("fraud");
  const [otherReason, setOtherReason] = useState("");
  const [duration, setDuration] = useState("permanent");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (reasonKey === "other" && !otherReason.trim()) {
      toast.error("Please specify a reason");
      return;
    }
    setSubmitting(true);
    try {
      const reasonLabel =
        reasonKey === "other"
          ? otherReason.trim()
          : REASONS.find((r) => r.value === reasonKey)?.label ?? reasonKey;
      const fullReason = `${reasonLabel} (${duration})${
        message ? " — " + message : ""
      }`;
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: fullReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("User banned");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to ban user", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Ban User</h2>
              <p className="text-xs text-slate-500 truncate max-w-65">
                {userName || userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Reason
            </label>
            <select
              value={reasonKey}
              onChange={(e) => setReasonKey(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            >
              {REASONS.map((r) => (
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
                placeholder="Describe the reason"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Note: duration is recorded but enforcement is currently
              permanent until manually unbanned.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Message to user (optional)
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
              placeholder="Additional context the user will see"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Ban
          </button>
        </div>
      </div>
    </div>
  );
}
