"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

/**
 * Attach the account a sign-up signal was about to its abuse case. After
 * that, the case drawer's account actions (suspend, ban, hold withdrawals…)
 * work on it — they were all disabled for a case with no account.
 */
export function AttachAccount({ caseId, userId, name }: { caseId: string; userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const ok = await confirmDialog({
          title: `Attach ${name} to this case?`,
          description: "The case's account actions (suspend, ban, hold withdrawals) then act on this account.",
          confirmLabel: "Attach",
        });
        if (!ok) return;
        setBusy(true);
        const res = await fetch(`/api/admin/abuse/cases/${caseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachUserId: userId }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) {
          toast.error(j.error ?? "Could not attach");
          return;
        }
        toast.success(`${name} attached to the case`);
        router.refresh();
      }}
      className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
      Attach to case
    </button>
  );
}
