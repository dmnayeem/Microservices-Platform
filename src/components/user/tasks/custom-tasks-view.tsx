"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { taskRunHref } from "@/lib/task-routes";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  difficulty?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  locked?: boolean;
  userStatus?:
    | "AVAILABLE"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "COMPLETED"
    | "REVISION"
    | "REJECTED";
}

export function CustomTasksView() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/tasks?type=CUSTOM&limit=50", {
        cache: "no-store",
      });
      const d = await r.json();
      setTasks(d.tasks ?? []);
    } catch {
      if (!silent) setTasks([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-400" /> Custom Tasks
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Complete custom tasks to earn points and XP.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No custom tasks available"
          description="Check back soon for new custom tasks."
        />
      )}

      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description ?? undefined}
              type="custom"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              difficulty={
                (t.difficulty?.toUpperCase() as "EASY" | "MEDIUM" | "HARD") ??
                undefined
              }
              durationMin={t.duration ?? undefined}
              thumbnail={t.thumbnailUrl ?? undefined}
              href={taskRunHref("CUSTOM", t.id)}
              status={t.locked ? "LOCKED" : t.userStatus ?? "AVAILABLE"}
              actionLabel={t.locked ? "🔒 Locked" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
