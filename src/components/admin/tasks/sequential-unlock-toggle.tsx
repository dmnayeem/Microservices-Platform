"use client";

import { useState } from "react";
import { ListOrdered, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * "One task at a time, per category" — the `tasks.sequential_unlock` switch,
 * on the task page where admins look for it (it also lives in Settings).
 * Order inside a category follows each task's Sequence Order.
 */
export function SequentialUnlockToggle({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    const next = !on;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "tasks", settings: { "tasks.sequential_unlock": next } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setOn(next);
      toast.success(next ? "Tasks now unlock one by one in each category" : "Members can do tasks in any order");
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <ListOrdered className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
        <div className="text-sm">
          <p className="font-semibold text-white">Unlock tasks one by one in each category</p>
          <p className="text-slate-400">
            On: inside every category (Video, Social, Article…) a member must finish the first task before the
            second opens; tapping a locked one says &ldquo;complete the task before this one first&rdquo;. Order =
            each task&apos;s <b>Sequence Order</b>. Standard / Premium plan tasks never block the free ones. Resets
            daily.
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!canEdit || busy}
        onClick={flip}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50",
          on ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"
        )}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}
