"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface AppTask {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  xpReward?: number;
  thumbnailUrl: string | null;
}

export function AppInstallListView() {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/tasks?type=APPINSTALL&limit=50", {
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
          <Smartphone className="w-6 h-6 text-green-400" />
          App Install Tasks
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Install apps, submit proof, and earn points once your install is
          verified.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title="No app-install tasks yet"
          description="Check back soon — new apps to install and earn from will appear here."
        />
      )}

      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description ?? undefined}
              type="app"
              reward={t.pointsReward}
              xpReward={t.xpReward}
              thumbnail={t.thumbnailUrl ?? undefined}
              actionLabel="Install & Earn"
              href={`/app-install-tasks/${t.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
