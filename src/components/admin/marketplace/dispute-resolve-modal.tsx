"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Scale } from "lucide-react";
import { toast } from "@/lib/toast";

interface DisputeResolveModalProps {
  disputeId: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  open: boolean;
  onClose: () => void;
}

type Decision =
  | "RESOLVED_BUYER"
  | "RESOLVED_SELLER"
  | "PARTIAL"
  | "CLOSED"
  | "ESCALATED";

const DECISIONS: Array<{ value: Decision; label: string; description: string }> = [
  {
    value: "RESOLVED_BUYER",
    label: "Full refund to buyer",
    description: "Buyer wins — return the full amount",
  },
  {
    value: "RESOLVED_SELLER",
    label: "Release to seller",
    description: "Seller wins — release escrow to seller (less platform fee)",
  },
  {
    value: "PARTIAL",
    label: "Partial refund",
    description: "Specify split between buyer and seller",
  },
  {
    value: "CLOSED",
    label: "Close — no action",
    description: "No funds movement (use sparingly)",
  },
  {
    value: "ESCALATED",
    label: "Escalate to senior admin",
    description: "Mark as escalated for higher-level review",
  },
];

export function DisputeResolveModal({
  disputeId,
  buyerName,
  sellerName,
  amount,
  open,
  onClose,
}: DisputeResolveModalProps) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>("RESOLVED_BUYER");
  const [partialBuyer, setPartialBuyer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (decision === "PARTIAL") {
      const num = parseFloat(partialBuyer);
      if (!num || num <= 0 || num > amount) {
        toast.error(`Buyer refund must be between $0 and $${amount.toFixed(2)}`);
        return;
      }
    }
    if (!note.trim()) {
      toast.error("Resolution note is required");
      return;
    }
    setBusy(true);
    try {
      // Map UI decision → API action shape
      let body: Record<string, unknown>;
      if (decision === "RESOLVED_BUYER") {
        body = {
          action: "resolve",
          inFavorOf: "BUYER",
          resolvedAmount: amount,
          resolution: note.trim(),
        };
      } else if (decision === "RESOLVED_SELLER") {
        body = {
          action: "resolve",
          inFavorOf: "SELLER",
          resolution: note.trim(),
        };
      } else if (decision === "PARTIAL") {
        body = {
          action: "resolve",
          inFavorOf: "BUYER",
          resolvedAmount: parseFloat(partialBuyer),
          resolution: note.trim(),
        };
      } else if (decision === "CLOSED") {
        body = { action: "close", resolution: note.trim() };
      } else {
        // ESCALATED
        body = { action: "escalate", adminNotes: note.trim() };
      }

      const res = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Dispute resolved");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to resolve dispute", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Resolve Dispute
              </h2>
              <p className="text-xs text-slate-500">
                ${amount.toFixed(2)} held in escrow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">
                Buyer
              </p>
              <p className="text-white font-medium truncate">{buyerName}</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">
                Seller
              </p>
              <p className="text-white font-medium truncate">{sellerName}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Decision *
            </label>
            <div className="space-y-2">
              {DECISIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    decision === d.value
                      ? "bg-purple-500/10 border-purple-500/50"
                      : "bg-slate-900 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={d.value}
                    checked={decision === d.value}
                    onChange={() => setDecision(d.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm text-white font-medium">{d.label}</p>
                    <p className="text-xs text-slate-500">{d.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {decision === "PARTIAL" && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Buyer refund amount (max ${amount.toFixed(2)})
              </label>
              <input
                type="number"
                min={0.01}
                max={amount}
                step={0.01}
                value={partialBuyer}
                onChange={(e) => setPartialBuyer(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="0.00"
              />
              {partialBuyer && (
                <p className="text-xs text-slate-500 mt-1">
                  Seller receives: $
                  {Math.max(0, amount - parseFloat(partialBuyer || "0")).toFixed(
                    2
                  )}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Resolution Note *
            </label>
            <textarea
              rows={4}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
              placeholder="Explain your decision — visible to both parties"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !note.trim()}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Resolution
          </button>
        </div>
      </div>
    </div>
  );
}
