"use client";

import { useState } from "react";
import { AlertTriangle, Ban, PencilLine } from "lucide-react";
import { AD_REJECTION_REASONS } from "@/lib/ad-review-reasons";
import { cn } from "@/lib/utils";

export type NegativeDecision = "reject" | "request-changes";

/**
 * Structured reject / request-changes form. Replaces `window.prompt("Reason for
 * rejection?")`, which was unstyled, blockable by the browser, and accepted an
 * empty string — the API then stored "Not approved.", telling the advertiser
 * nothing they could act on.
 *
 * Preset codes make decisions consistent and reportable; the free-text message is
 * what the advertiser reads; the internal note stays admin-only.
 */
export function AdRejectForm({
  decision,
  busy,
  onCancel,
  onSubmit,
}: {
  decision: NegativeDecision;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    reasonCodes: string[];
    message: string;
    internalNote: string;
  }) => void;
}) {
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const reject = decision === "reject";
  const valid = codes.length > 0 || message.trim().length > 0;

  const toggle = (code: string) =>
    setCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        {reject ? (
          <Ban className="w-4 h-4 text-red-400" />
        ) : (
          <PencilLine className="w-4 h-4 text-orange-400" />
        )}
        {reject ? "Reject this ad" : "Ask the advertiser for changes"}
      </div>
      <p className="text-[11px] text-slate-400">
        {reject
          ? "The ad won't serve. The advertiser gets your reason and can fix and resubmit."
          : "The ad won't serve until it's fixed, but the advertiser keeps it and can resubmit."}
      </p>

      <div className="grid sm:grid-cols-2 gap-1.5">
        {AD_REJECTION_REASONS.map((r) => (
          <label
            key={r.code}
            className={cn(
              "flex items-start gap-2 rounded-lg border p-2 cursor-pointer text-xs",
              codes.includes(r.code)
                ? "border-blue-500/60 bg-blue-500/10 text-white"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
            )}
          >
            <input
              type="checkbox"
              checked={codes.includes(r.code)}
              onChange={() => toggle(r.code)}
              className="mt-0.5 accent-blue-500"
            />
            <span>{r.label}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
          Message to the advertiser {codes.includes("OTHER") && <span className="text-red-400">(required for “Other”)</span>}
        </label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Be specific about what to change — e.g. “The landing page 404s; fix the link and resubmit.”"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
          Internal note (admins only)
        </label>
        <input
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          placeholder="Optional — context for other reviewers"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {!valid && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          Pick at least one reason, or write a message.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
        >
          Back
        </button>
        <button
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({ reasonCodes: codes, message: message.trim(), internalNote: internalNote.trim() })
          }
          className={cn(
            "px-3 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed",
            reject ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"
          )}
        >
          {busy ? "Saving…" : reject ? "Confirm reject" : "Send back for changes"}
        </button>
      </div>
    </div>
  );
}
