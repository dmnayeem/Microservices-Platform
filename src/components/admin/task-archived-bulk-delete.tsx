"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

/**
 * "Delete all archived" on the Archived tab. The server handles up to 1000
 * tasks per call and reports `remaining`, so this loops until nothing is left.
 */
export function ArchivedBulkDelete({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    let deleted = 0;
    let removed = 0;
    try {
      // Bounded: a server that keeps reporting `remaining` must not spin forever.
      for (let round = 0; round < 50; round++) {
        const res = await fetch("/api/admin/tasks/archived", { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        const d = Number(data.deleted ?? 0);
        const r = Number(data.removed ?? 0);
        deleted += d;
        removed += r;
        if (!res.ok) throw new Error(data.error || "Failed to delete archived tasks");
        // Stop when done, or when a round made no progress.
        if (!data.remaining || d + r === 0) break;
      }
      toast.success(`Deleted ${deleted + removed} archived task${deleted + removed === 1 ? "" : "s"}`, {
        description: `${deleted} deleted permanently · ${removed} kept for the payment records (hidden from every list).`,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete archived tasks");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete all archived ({count.toLocaleString()})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Delete all archived tasks</h2>
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-2">
              <p className="text-gray-300">
                Delete all{" "}
                <span className="text-white font-semibold">{count.toLocaleString()}</span>{" "}
                archived task{count === 1 ? "" : "s"}?
              </p>
              <p className="text-gray-400 text-sm">
                Tasks with completed work are kept for the payment records but
                disappear from every list. Tasks nobody submitted to are
                deleted permanently. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy} className="flex-1">
                Cancel
              </Button>
              <button
                onClick={run}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete {count.toLocaleString()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
