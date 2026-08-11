"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface TaskReviewActionsProps {
  taskId: string;
}

export function TaskReviewActions({ taskId }: TaskReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const review = async (action: "approve" | "reject", reason?: string) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} task`);
      toast.success(
        action === "approve" ? "Task approved" : "Task rejected & refunded",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const onReject = () => {
    const reason = window.prompt("Reason for rejection (optional):") ?? undefined;
    // window.prompt returns null on cancel — treat as abort.
    if (reason === undefined) return;
    review("reject", reason || undefined);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => review("approve")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
      >
        {busy === "approve" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
      >
        {busy === "reject" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <X className="w-4 h-4" />
        )}
        Reject
      </button>
    </div>
  );
}
