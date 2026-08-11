"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Minus, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type AdjustType = "points" | "cash" | "level" | "xp";
export type AdjustAction = "add" | "deduct";

interface BalanceAdjustModalProps {
  userId: string;
  type: AdjustType;
  action: AdjustAction;
  currentValue: number;
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<AdjustType, { unit: string; title: string }> = {
  points: { unit: "pts", title: "Points" },
  cash: { unit: "$", title: "Cash" },
  level: { unit: "lvl", title: "Level" },
  xp: { unit: "xp", title: "XP" },
};

export function BalanceAdjustModal({
  userId,
  type,
  action,
  currentValue,
  open,
  onClose,
}: BalanceAdjustModalProps) {
  const router = useRouter();
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const labels = TYPE_LABELS[type];
  const isAdd = action === "add";

  const submit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action, amount: numAmount, reason: reason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        `${isAdd ? "Added" : "Deducted"} ${numAmount} ${labels.unit}`
      );
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to adjust", {
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
            <div
              className={cn(
                "p-2 rounded-lg",
                isAdd
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              )}
            >
              {isAdd ? (
                <Plus className="w-5 h-5" />
              ) : (
                <Minus className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isAdd ? "Add" : "Deduct"} {labels.title}
              </h2>
              <p className="text-xs text-slate-500">
                Current: {currentValue.toLocaleString()} {labels.unit}
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
              Amount ({labels.unit})
            </label>
            <input
              type="number"
              autoFocus
              min={type === "cash" ? 0.01 : 1}
              step={type === "cash" ? 0.01 : 1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder={type === "cash" ? "10.00" : "100"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Reason
              <span className="text-slate-600 ml-2">
                {type === "points" || type === "cash"
                  ? "shown to user in transaction history"
                  : "internal note"}
              </span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="e.g. Compensation for failed task"
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
            disabled={submitting || !amount}
            className={cn(
              "flex-1 px-4 py-2.5 text-white rounded-lg transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2",
              isAdd ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
            )}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
