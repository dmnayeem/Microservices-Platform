"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

/** One click between Live and Draft, from the plans list. */
export function PackagePublishToggle({ id, live }: { id: string; live: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    if (live && !confirm("Move this plan to Draft? It disappears from the plans page and nobody can buy it. People already on it keep it.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !live }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not change the status");
      toast.success(live ? "Moved to Draft — hidden from users" : "Published — users can see and buy it");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the status");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      title={live ? "Move to Draft" : "Publish"}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 " +
        (live ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-emerald-600 hover:bg-emerald-700 text-white")
      }
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : live ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      {live ? "Unpublish" : "Publish"}
    </button>
  );
}
