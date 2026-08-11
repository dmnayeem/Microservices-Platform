"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, AlertTriangle, Trash2, Ban, Clock } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  reportId: string;
  contentType: string;
}

const RESOLUTIONS = [
  { value: "DISMISSED", label: "Dismiss", icon: X, tone: "slate" },
  { value: "WARNED", label: "Warn user", icon: AlertTriangle, tone: "amber" },
  { value: "DELETED", label: "Delete content", icon: Trash2, tone: "red" },
  { value: "SUSPENDED", label: "Suspend user", icon: Clock, tone: "orange" },
  { value: "BANNED", label: "Ban user", icon: Ban, tone: "red" },
] as const;

export function ReportActions({ reportId, contentType }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const apply = async (resolution: string) => {
    if (
      (resolution === "BANNED" || resolution === "DELETED") &&
      !(await confirmDialog({
        title: `${resolution} this ${contentType}?`,
        description: "This is hard to undo.",
        tone: "danger",
        confirmLabel: resolution === "BANNED" ? "Ban" : "Delete",
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/social-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, resolverNote: note || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(`Marked as ${resolution.toLowerCase()}`);
      router.refresh();
    } catch (err) {
      toast.error("Failed to apply", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const visibleResolutions = RESOLUTIONS.filter((r) => {
    if (contentType === "POST" || contentType === "COMMENT" || contentType === "LISTING") {
      return r.value !== "BANNED" && r.value !== "SUSPENDED";
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {showNote ? (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional resolver note (audit trail)"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
          <button
            onClick={() => setShowNote(false)}
            className="text-xs text-slate-500 hover:text-white"
          >
            Hide note
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNote(true)}
          className="text-xs text-slate-400 hover:text-white"
        >
          + Add resolver note
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {visibleResolutions.map((r) => {
          const Icon = r.icon;
          const cls = {
            slate: "bg-slate-700 text-white hover:bg-slate-600",
            amber:
              "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20",
            red: "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20",
            orange:
              "bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20",
          }[r.tone];
          return (
            <button
              key={r.value}
              onClick={() => apply(r.value)}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${cls} disabled:opacity-50`}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Icon className="w-3 h-3" />
              )}
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
