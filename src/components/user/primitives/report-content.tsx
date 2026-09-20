"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Flag, Loader2 } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";

export type ReportTargetType =
  | "POST"
  | "COMMENT"
  | "USER"
  | "LISTING"
  | "GROUP";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or hate speech" },
  { value: "scam", label: "Scam or fraud" },
  { value: "nsfw", label: "Adult or sensitive content" },
  { value: "violence", label: "Violence or self-harm" },
  { value: "misinformation", label: "Misinformation" },
  { value: "other", label: "Other" },
];

interface ReportContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  endpoint?: string;
}

export function ReportContent({
  open,
  onOpenChange,
  targetType,
  targetId,
  endpoint = "/api/reports",
}: ReportContentProps) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Report submitted", {
        description: "Our team will review shortly.",
      });
      setDetails("");
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to submit", {
        description: err instanceof Error ? err.message : "Try again later",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Report"
      description={`Help us understand what's wrong with this ${targetType.toLowerCase()}.`}
      footer={
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Flag className="w-4 h-4" />
            )}
            Submit Report
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Reason
          </label>
          <div className="space-y-1">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--app-line) hover:border-(--app-line) cursor-pointer"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-indigo-500"
                />
                <span className="text-sm text-white">{r.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Additional details (optional)
          </label>
          <textarea
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Anything else we should know?"
            className="w-full px-3 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) resize-none"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
