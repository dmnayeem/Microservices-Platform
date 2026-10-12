"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { TaskCard, type TaskDeviceNeeds, type TaskGate } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskListError } from "./task-list-error";
import { TaskSubmissionRow } from "@/components/user/primitives/task-submission-row";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

type Tab = "available" | "pending" | "approved" | "rejected";

interface SurveyTask {
  id: string;
  title: string;
  description?: string;
  pointsReward: number;
  xpReward: number;
  difficulty?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  /** AVAILABLE | IN_PROGRESS | SUBMITTED | REVISION | REJECTED | COMPLETED */
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
}

const TAB_TO_STATUS: Record<Tab, string[]> = {
  available: [],
  pending: ["PENDING"],
  approved: ["APPROVED", "AUTO_APPROVED"],
  rejected: ["REJECTED", "REVISION_REQUESTED"],
};

export function SurveyTasksView() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("available");
  const [tasks, setTasks] = useState<SurveyTask[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (tab === "available") {
        const res = await fetch("/api/tasks?type=SURVEY", { cache: "no-store" });
        if (res.status >= 500) throw new Error(String(res.status)); // 4xx = gated: empty list
        const d = await res.json();
        setFailed(false);
        setTasks(d.tasks ?? []);
      } else {
        const res = await fetch(
          `/api/submissions?status=${TAB_TO_STATUS[tab].join(",")}&type=SURVEY`,
          { cache: "no-store" }
        );
        if (res.status >= 500) throw new Error(String(res.status)); // 4xx = gated: empty list
        const d = await res.json();
        setFailed(false);
        setSubmissions(d.submissions ?? []);
      }
    } catch {
      if (!silent) setFailed(true);
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
          <ClipboardList className="w-6 h-6 text-purple-400" />
          Survey Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Answer surveys and get rewarded. Each survey is a one-time submission;
          your response goes to admin for review.
        </p>
      </div>

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

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && failed && <TaskListError onRetry={() => load()} />}

      {!loading && !failed && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No survey tasks available"
          description="Check back soon for new surveys."
        />
      )}

      {!loading && !failed && tab === "available" && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              deviceNeeds={t as unknown as TaskDeviceNeeds}
              gate={t as unknown as TaskGate}
              description={t.description}
              type="survey"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              durationMin={t.duration ?? undefined}
              thumbnail={t.thumbnailUrl ?? undefined}
              status={(t.userStatus ?? "AVAILABLE") as never}
              actionLabel="Take Survey"
              onAction={() => router.push(`/survey-tasks/${t.id}`)}
            />
          ))}
        </div>
      )}

      {!loading && !failed && tab !== "available" && submissions.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={`No ${tab} submissions`}
          description={
            tab === "pending"
              ? "Submit a survey to see it here."
              : `Your ${tab} submissions will show up here.`
          }
        />
      )}

      {!loading && !failed && tab !== "available" && submissions.length > 0 && (
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
              redoHref={`/survey-tasks/${s.task.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
