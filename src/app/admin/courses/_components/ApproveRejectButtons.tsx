"use client";

import { promptDialog } from "@/lib/confirm";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, Check, X } from "lucide-react";

export function ApproveRejectButtons({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [, startTransition] = useTransition();

  const approve = async () => {
    setBusy("approve");
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/approve`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Course approved & published");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Approve failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const note = await promptDialog({
      title: "Reject for revision",
      description: "What needs to change before this can publish? (optional, shown to the tutor)",
      tone: "warning",
      multiline: true,
      confirmLabel: "Reject",
    });
    if (note === null) return; // cancelled
    setBusy("reject");
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: note || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Course returned to draft");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Reject failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={approve}
        disabled={busy !== null}
        className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-300 disabled:opacity-50"
        title="Approve & publish"
      >
        {busy === "approve" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={busy !== null}
        className="p-1.5 rounded hover:bg-rose-500/10 text-rose-300 disabled:opacity-50"
        title="Send back to draft"
      >
        {busy === "reject" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <X className="w-4 h-4" />
        )}
      </button>
    </>
  );
}
