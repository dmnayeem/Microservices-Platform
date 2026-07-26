"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Coins, ChevronRight, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface AppTask {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  thumbnailUrl: string | null;
}

export function AppInstallListView() {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks?type=APPINSTALL&limit=50")
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500/15 text-green-400 grid place-items-center">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">App Install Tasks</h1>
          <p className="text-xs text-gray-400">Install apps, submit proof, earn points.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-green-400" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="No app-install tasks yet"
          description="Check back soon — new apps to install and earn from will appear here."
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/app-install-tasks/${t.id}`}
              className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-800 overflow-hidden shrink-0 grid place-items-center">
                {t.thumbnailUrl ? (
                  <SmartImage
                    src={t.thumbnailUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Smartphone className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-gray-500 truncate">{t.description}</p>
                )}
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-amber-300">
                  <Coins className="w-3 h-3" />+{t.pointsReward.toLocaleString()} pts
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
