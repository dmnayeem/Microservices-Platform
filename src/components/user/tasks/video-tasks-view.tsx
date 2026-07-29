"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Video as VideoIcon } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { TaskCard } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskSubmissionRow } from "@/components/user/primitives/task-submission-row";
import type { VideoConfig } from "@/lib/video-tasks";
import { formatDuration } from "@/lib/video-tasks";

type Tab = "available" | "submitted" | "approved" | "rejected";

interface VideoTask {
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
  videoConfig?: VideoConfig | null;
  contentUrl?: string | null;
  locked?: boolean;
}

interface Submission {
  id: string;
  task: { id: string; title: string };
  status: string;
  pointsReward: number;
  createdAt: string;
  rejectionReason?: string | null;
  adminNote?: string | null;
}

const TAB_TO_STATUS: Record<Tab, string[]> = {
  available: [],
  submitted: ["PENDING"],
  approved: ["APPROVED", "AUTO_APPROVED"],
  rejected: ["REJECTED", "REVISION_REQUESTED"],
};

const TABS: Tab[] = ["available", "submitted", "approved", "rejected"];

export function VideoTasksView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab && (TABS as string[]).includes(initialTab)
      ? (initialTab as Tab)
      : "available"
  );
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (tab === "available") {
        const res = await fetch("/api/tasks?type=VIDEO", { cache: "no-store" });
        const d = await res.json();
        setTasks(d.tasks ?? []);
      } else {
        const res = await fetch(
          `/api/submissions?status=${TAB_TO_STATUS[tab].join(",")}&type=VIDEO`,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <VideoIcon className="w-6 h-6 text-rose-400" />
          Video Tasks
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Watch videos to earn points. Stay on the player until the timer
          finishes.
        </p>
      </div>

      <FilterChips
        value={tab}
        onChange={setTab}
        options={[
          { value: "available", label: "Available", count: tasks.length },
          { value: "submitted", label: "Submitted" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={VideoIcon}
          title="No video tasks available"
          description="Check back soon for new video tasks."
        />
      )}

      {!loading &&
        tab === "available" &&
        tasks.map((t) => {
          const watchSecs = t.videoConfig?.watchSeconds ?? t.duration ?? 0;
          return (
            <TaskCard
              key={t.id}
              title={t.title}
              description={
                t.description ??
                (watchSecs > 0
                  ? `Watch for ${formatDuration(watchSecs)} to earn`
                  : undefined)
              }
              type="video"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              durationMin={
                watchSecs > 0 ? Math.max(1, Math.round(watchSecs / 60)) : undefined
              }
              thumbnail={t.thumbnailUrl ?? undefined}
              status={t.locked ? "LOCKED" : undefined}
              actionLabel={t.locked ? "🔒 Locked" : "Watch & Earn"}
              onAction={
                t.locked ? undefined : () => router.push(`/video-tasks/${t.id}`)
              }
            />
          );
        })}

      {!loading && tab !== "available" && submissions.length === 0 && (
        <EmptyState
          icon={VideoIcon}
          title={`No ${tab} submissions`}
          description={
            tab === "submitted"
              ? "Watch a video task to see it here."
              : `Your ${tab} submissions will show up here.`
          }
        />
      )}

      {!loading && tab !== "available" && submissions.length > 0 && (
        <div className="space-y-2">
          {submissions.map((s) => (
            <TaskSubmissionRow
              key={s.id}
              title={s.task.title}
              status={s.status}
              points={s.pointsReward}
              date={s.createdAt}
              rejectionReason={s.rejectionReason}
              adminNote={s.adminNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}
