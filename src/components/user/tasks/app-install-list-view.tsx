"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { TaskCard, type TaskDeviceNeeds, type TaskGate } from "@/components/user/primitives/task-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskListError } from "./task-list-error";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface AppTask {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  xpReward?: number;
  thumbnailUrl: string | null;
  /** AVAILABLE | IN_PROGRESS | SUBMITTED | REVISION | REJECTED | COMPLETED */
  userStatus?: string;
}

export function AppInstallListView() {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/tasks?type=APPINSTALL&limit=50", {
        cache: "no-store",
      });
      if (res.status >= 500) throw new Error(String(res.status)); // 4xx = gated: empty list
      const d = await res.json();
      setFailed(false);
      setTasks(d.tasks ?? []);
    } catch {
      if (!silent) setFailed(true);
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
          <Smartphone className="w-6 h-6 text-green-400" />
          App Install Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Install apps, submit proof, and earn points once your install is
          verified.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && failed && <TaskListError onRetry={() => load()} />}

      {!loading && !failed && tasks.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title="No app-install tasks yet"
          description="Check back soon — new apps to install and earn from will appear here."
        />
      )}

      {!loading && !failed && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              deviceNeeds={t as unknown as TaskDeviceNeeds}
              gate={t as unknown as TaskGate}
              description={t.description ?? undefined}
              type="app"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              thumbnail={t.thumbnailUrl ?? undefined}
              status={(t.userStatus ?? "AVAILABLE") as never}
              actionLabel="Install & Earn"
              href={`/app-install-tasks/${t.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
