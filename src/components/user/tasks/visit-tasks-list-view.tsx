"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface VisitTask {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  xpReward?: number;
  thumbnailUrl: string | null;
}

export function VisitTasksListView() {
  const [tasks, setTasks] = useState<VisitTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/tasks?type=VISIT&limit=50", {
        cache: "no-store",
      });
      const d = await res.json();
      setTasks(d.tasks ?? []);
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
     
  }, []);

  useAutoRefresh(() => load(true));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Globe className="w-6 h-6 text-cyan-400" />
          Visit & Earn
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Open sponsor links or short links and earn points once your visit
          counts.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={Globe}
          title="No visit tasks yet"
          description="Check back soon — new links to visit and earn from will appear here."
        />
      )}

      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description ?? undefined}
              type="visit"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              thumbnail={t.thumbnailUrl ?? undefined}
              actionLabel="Visit & Earn"
              href={`/visit-tasks/${t.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
