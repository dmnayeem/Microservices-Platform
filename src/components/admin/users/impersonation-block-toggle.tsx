"use client";

import { useState } from "react";
import { ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";

/** Super admin only: stop anyone (including the super admin) from "Login as user" on this account. */
export function ImpersonationBlockToggle({ userId, initial }: { userId: string; initial: boolean }) {
  const [blocked, setBlocked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${userId}/impersonation-block`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: !blocked }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed");
      setBlocked(!blocked);
      toast.success(!blocked ? "Nobody can log in as this account now." : "Login as user allowed again.");
    } catch (e) {
      toast.error("Couldn't change it", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title="Super admin: protect this account from Login as user"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
        blocked
          ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
          : "border-slate-700 text-slate-300 hover:bg-slate-800"
      }`}
    >
      {blocked ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {blocked ? "Login as user: blocked" : "Block login as user"}
    </button>
  );
}
