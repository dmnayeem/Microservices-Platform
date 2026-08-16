"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskSubmissionRow } from "@/components/user/primitives/task-submission-row";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

type Tab = "available" | "pending" | "approved" | "rejected";

interface ArticleTask {
  id: string;
  title: string;
  description?: string;
  pointsReward: number;
  xpReward: number;
  difficulty?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
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
  score?: number | null;
  penaltyPoints?: number | null;
}

const TAB_TO_STATUS: Record<Tab, string[]> = {
  available: [],
  pending: ["PENDING"],
  approved: ["APPROVED", "AUTO_APPROVED"],
  rejected: ["REJECTED", "REVISION_REQUESTED"],
};

export function ArticleTasksView() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("available");
  const [tasks, setTasks] = useState<ArticleTask[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (tab === "available") {
        const res = await fetch("/api/tasks?type=ARTICLE", { cache: "no-store" });
        const d = await res.json();
        setTasks(d.tasks ?? []);
      } else {
        const res = await fetch(
          `/api/submissions?status=${TAB_TO_STATUS[tab].join(",")}&type=ARTICLE`,
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
          <FileText className="w-6 h-6 text-blue-400" />
          Article Tasks
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Read articles, submit proof, get rewarded. Submissions go to PENDING
          and get credited when admin approves.
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

      {!loading && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No article tasks available"
          description="Check back soon for new article tasks."
        />
      )}

      {!loading && tab === "available" && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description}
              type="article"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              durationMin={t.duration ?? undefined}
              thumbnail={t.thumbnailUrl ?? undefined}
              status={t.locked ? "LOCKED" : undefined}
              actionLabel={t.locked ? "🔒 Locked" : "Read & Submit"}
              onAction={
                t.locked ? undefined : () => router.push(`/article-tasks/${t.id}`)
              }
            />
          ))}
        </div>
      )}

      {!loading && tab !== "available" && submissions.length === 0 && (
        <EmptyState
          icon={FileText}
          title={`No ${tab} submissions`}
          description={
            tab === "pending"
              ? "Submit an article task to see it here."
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
              redoHref={`/article-tasks/${s.task.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
