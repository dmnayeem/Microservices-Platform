"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, ShieldOff, ShieldCheck } from "lucide-react";

export function TutorRowActions({
  tutorId,
  isSuspended,
}: {
  tutorId: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuspended: !isSuspended }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(isSuspended ? "Tutor un-suspended" : "Tutor suspended");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border disabled:opacity-50 " +
        (isSuspended
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20")
      }
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isSuspended ? (
        <ShieldCheck className="w-3.5 h-3.5" />
      ) : (
        <ShieldOff className="w-3.5 h-3.5" />
      )}
      {isSuspended ? "Reinstate" : "Suspend"}
    </button>
  );
}
