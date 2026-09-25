"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Video as VideoIcon } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { TaskCard } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskSubmissionRow } from "@/components/user/primitives/task-submission-row";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import {
  videoNetworkOf,
  VIDEO_NETWORK_LABEL,
  VIDEO_NETWORK_ORDER,
  type VideoNetwork,
} from "@/lib/video-networks";
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
  /** AVAILABLE | IN_PROGRESS | SUBMITTED | REVISION | REJECTED | COMPLETED.
   *  Rendering it is what stops a task the user walked away from looking
   *  identical to one they have never opened. */
  userStatus?: string;
}

interface Submission {
  id: string;
  task: { id: string; title: string };
  status: string;
  pointsReward: number;
  createdAt: string;
  rejectionReason?: string | null;
  adminNote?: string | null;
  score?: number | null;
  penaltyPoints?: number | null;
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

  // Preserves VIDEO_NETWORK_ORDER and drops empty groups, so the page never
  // shows a "Facebook" heading with nothing under it.
  const groups = useMemo(() => {
    const by = new Map<VideoNetwork, VideoTask[]>();
    for (const t of tasks) {
      const n = videoNetworkOf(t.contentUrl ?? t.videoConfig?.videoUrl ?? null);
      by.set(n, [...(by.get(n) ?? []), t]);
    }
    return VIDEO_NETWORK_ORDER.filter((n) => by.get(n)?.length).map(
      (n) => [n, by.get(n)!] as const
    );
  }, [tasks]);

  useAutoRefresh(() => load(true));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <VideoIcon className="w-6 h-6 text-rose-400" />
          Video Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
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

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={VideoIcon}
          title="No video tasks available"
          description="Check back soon for new video tasks."
        />
      )}

      {/* Grouped by network. A YouTube watch, a Facebook watch and a clip we
          host ourselves each ask something different of the user, and in one
          flat grid they were indistinguishable until the player opened. */}
      {!loading && tab === "available" && tasks.length > 0 && (
        <div className="space-y-6">
          {groups.map(([network, list]) => (
            <div key={network}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold text-white">
                  {VIDEO_NETWORK_LABEL[network]}
                </h2>
                <span className="text-[11px] text-(--app-ink-3)">
                  {list.length} task{list.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((t) => {
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
                status={t.locked ? "LOCKED" : ((t.userStatus ?? "AVAILABLE") as never)}
                actionLabel={t.locked ? "🔒 Locked" : "Watch & Earn"}
                onAction={
                  t.locked ? undefined : () => router.push(`/video-tasks/${t.id}`)
                }
              />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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
              score={s.score}
              penaltyPoints={s.penaltyPoints}
              redoHref={`/video-tasks/${s.task.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
