"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Upload, Loader2, Video as VideoIcon } from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { runInterstitial } from "@/lib/reward-interstitial";
import { ensureAdsAllowed } from "@/lib/adblock";

type Tab = "available" | "pending" | "approved" | "rejected";

interface ManualTask {
  id: string;
  title: string;
  description?: string;
  pointsReward: number;
  xpReward: number;
  difficulty?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  instructions?: string | null;
  instructionVideoUrl?: string | null;
  locked?: boolean;
}

interface Submission {
  id: string;
  task: { id: string; title: string };
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "AUTO_APPROVED";
  pointsReward: number;
  createdAt: string;
  rejectionReason?: string | null;
  adminNote?: string | null;
}

const TAB_TO_STATUS: Record<Tab, string[]> = {
  available: [],
  pending: ["PENDING"],
  approved: ["APPROVED", "AUTO_APPROVED"],
  rejected: ["REJECTED", "REVISION_REQUESTED"],
};

export function ManualTasksView() {
  const [tab, setTab] = useState<Tab>("available");
  const [tasks, setTasks] = useState<ManualTask[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<ManualTask | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (tab === "available") {
        const res = await fetch("/api/tasks?type=MANUAL", { cache: "no-store" });
        const d = await res.json();
        setTasks(d.tasks ?? []);
      } else {
        const res = await fetch(
          `/api/submissions?status=${TAB_TO_STATUS[tab].join(",")}&type=MANUAL`,
          { cache: "no-store" }
        );
        const d = await res.json();
        setSubmissions(d.submissions ?? []);
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useAutoRefresh(() => load(true));

  const submit = async () => {
    if (!submitting) return;
    if (!proofUrl.trim()) {
      toast.error("Proof URL or screenshot required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${submitting.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ proofUrl, notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      await runInterstitial();
      toast.success("Submitted! Awaiting review.");
      setSubmitting(null);
      setProofUrl("");
      setNotes("");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <ClipboardList className="w-6 h-6 text-indigo-400" /> Manual Tasks
      </h1>

      <AdRenderer placement="TASK_LIST" />

      <FilterChips
        value={tab}
        onChange={setTab}
        options={[
          { value: "available", label: "Available", count: tasks.length },
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No manual tasks available"
          description="Check back soon for new manual tasks."
        />
      )}

      {!loading && tab === "available" &&
        tasks.map((t) => (
          <TaskCard
            key={t.id}
            title={t.title}
            description={t.description}
            type="manual"
            reward={t.pointsReward}
            xpReward={t.xpReward}
            durationMin={t.duration ?? undefined}
            thumbnail={t.thumbnailUrl ?? undefined}
            status={t.locked ? "LOCKED" : undefined}
            actionLabel={t.locked ? "🔒 Locked" : "Submit Proof"}
            onAction={
              t.locked
                ? undefined
                : async () => {
                    if (await ensureAdsAllowed()) setSubmitting(t);
                  }
            }
          />
        ))}

      {!loading && tab !== "available" && submissions.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={`No ${tab} submissions`}
          description={
            tab === "pending"
              ? "Submit a task to see it here."
              : `Your ${tab} submissions will show up here.`
          }
        />
      )}

      {!loading && tab !== "available" && submissions.length > 0 && (
        <div className="space-y-2">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="p-3 rounded-xl border border-gray-800 bg-gray-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {s.task.title}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {format(new Date(s.createdAt), "PP p")}
                  </p>
                </div>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                    s.status === "PENDING" && "bg-amber-500/10 text-amber-400",
                    (s.status === "APPROVED" || s.status === "AUTO_APPROVED") &&
                      "bg-emerald-500/10 text-emerald-400",
                    s.status === "REJECTED" && "bg-red-500/10 text-red-400",
                    s.status === "REVISION_REQUESTED" &&
                      "bg-orange-500/10 text-orange-400"
                  )}
                >
                  {s.status.replace("_", " ")}
                </span>
                <span className="text-sm font-bold text-amber-400 tabular-nums">
                  +{s.pointsReward}
                </span>
              </div>
              {(s.rejectionReason || s.adminNote) && (
                <p className="text-xs text-gray-400 mt-1.5 px-2 py-1.5 rounded bg-gray-950">
                  {s.rejectionReason && <strong>{s.rejectionReason}: </strong>}
                  {s.adminNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <BottomSheet
        open={!!submitting}
        onOpenChange={(o) => !o && setSubmitting(null)}
        title="Submit Proof"
        description={submitting?.title}
        footer={
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => setSubmitting(null)}
              className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={submit}
              className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Submit
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {submitting?.description && (
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                About this task
              </p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {submitting.description}
              </p>
            </div>
          )}

          {submitting?.instructions && (
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                Steps
              </p>
              <ol className="space-y-1 text-sm text-gray-300 list-decimal pl-4">
                {submitting.instructions
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
              </ol>
            </div>
          )}

          {submitting?.instructionVideoUrl && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold inline-flex items-center gap-1.5">
                <VideoIcon className="w-3 h-3" />
                Instruction video
              </p>
              <div className="max-w-2xl mx-auto">
                <InlineVideoEmbed
                  url={submitting.instructionVideoUrl}
                  title={`Instruction video — ${submitting.title}`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Proof URL or screenshot link *
            </label>
            <input
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know?"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
