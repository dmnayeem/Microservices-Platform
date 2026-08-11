"use client";

import { promptDialog } from "@/lib/confirm";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { normalizeSocialConfig, getAction } from "@/lib/social-tasks";

interface Props {
  submissionId: string;
  taskTitle: string;
  taskPoints: number;
  socialConfig: unknown;
  canApprove: boolean;
  canReject: boolean;
}

/**
 * Per-action review control for a SOCIAL bundle submission. The admin approves
 * or rejects each action; the API awards only the approved actions' points.
 * Reject / Request-revision act on the whole submission (existing semantics).
 */
export function SocialReviewActions({
  submissionId,
  taskTitle,
  taskPoints,
  socialConfig,
  canApprove,
  canReject,
}: Props) {
  const router = useRouter();
  const norm = useMemo(() => normalizeSocialConfig(socialConfig), [socialConfig]);
  const [decisions, setDecisions] = useState<Record<number, "approved" | "rejected">>(
    () => Object.fromEntries(norm.items.map((_, i) => [i, "approved" as const]))
  );
  const [busy, setBusy] = useState(false);

  const { approvedCount, awardPreview } = useMemo(() => {
    const total = norm.items.length || 1;
    let count = 0;
    let pts = 0;
    let sum = 0;
    norm.items.forEach((it, i) => {
      sum += it.points || 0;
      if (decisions[i] !== "rejected") {
        count++;
        pts += it.points || 0;
      }
    });
    if (sum <= 0) pts = Math.round((taskPoints * count) / total);
    return { approvedCount: count, awardPreview: pts };
  }, [norm.items, decisions, taskPoints]);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(d.message ?? okMsg);
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const applyDecisions = () =>
    patch({ action: "approved", itemDecisions: decisions }, "Reviewed");

  const rejectAll = async () => {
    const reason = await promptDialog({
      title: `Reject all of "${taskTitle}"?`,
      description: "Reason (shown to the user):",
      tone: "danger",
      multiline: true,
      confirmLabel: "Reject all",
    });
    if (reason === null) return;
    patch({ action: "rejected", rejectionReason: reason || undefined }, "Rejected");
  };

  const requestRevision = async () => {
    const note = await promptDialog({
      title: "Request revision",
      description: "What should the user revise?",
      tone: "warning",
      multiline: true,
      confirmLabel: "Request revision",
    });
    if (note === null) return;
    patch({ action: "revision_requested", adminNote: note || undefined }, "Revision requested");
  };

  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-2.5 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Per-action decision
        </p>
        {norm.items.map((it, i) => {
          const def = getAction(norm.platform, it.action);
          const dec = decisions[i] ?? "approved";
          return (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-300 truncate">
                {i + 1}. {def ? def.label : it.action}
                <span className="text-amber-400/80 ml-1">+{it.points}</span>
              </span>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setDecisions((p) => ({ ...p, [i]: "approved" }))}
                  className={`p-1 rounded ${
                    dec === "approved"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                  aria-label="Approve action"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDecisions((p) => ({ ...p, [i]: "rejected" }))}
                  className={`p-1 rounded ${
                    dec === "rejected"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                  aria-label="Reject action"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-800">
          Will award{" "}
          <span className="text-emerald-400 font-bold">{awardPreview} pts</span> (
          {approvedCount}/{norm.items.length} actions)
        </p>
      </div>

      {canApprove && (
        <button
          type="button"
          onClick={applyDecisions}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Apply decision
        </button>
      )}
      {canReject && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={rejectAll}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-red-400 text-xs font-semibold disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Reject all
          </button>
          <button
            type="button"
            onClick={requestRevision}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 text-xs font-semibold disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revision
          </button>
        </div>
      )}
    </div>
  );
}
