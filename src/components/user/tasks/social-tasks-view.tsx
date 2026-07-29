"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowRight, Sparkles, Share2 } from "lucide-react";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import {
  SOCIAL_PLATFORMS,
  getAction,
  type SocialTaskView,
} from "@/lib/social-tasks";

type Status =
  | "available"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired";

const PLATFORM_LOOKUP = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.key, p])
);

export function SocialTasksView() {
  const [status, setStatus] = useState<Status>("available");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [tasks, setTasks] = useState<(SocialTaskView & { locked?: boolean })[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await fetch(`/api/tasks/social?status=${status}`, {
          cache: "no-store",
        });
        const d = await r.json();
        setTasks(d.tasks ?? []);
      } catch {
        if (!silent) setTasks([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load(true));

  const changeStatus = (s: Status) => {
    if (s === status) return;
    setLoading(true);
    setStatus(s);
  };

  const visible = tasks.filter(
    (t) => platformFilter === "ALL" || t.platform === platformFilter
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Share2 className="w-6 h-6 text-cyan-400" /> Social Tasks
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Follow, like, comment & share to earn — proof-verified.
        </p>
      </div>

      <FilterChips
        value={status}
        onChange={changeStatus}
        options={[
          { value: "available", label: "Available" },
          { value: "in_progress", label: "In Progress" },
          { value: "submitted", label: "Submitted" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
          { value: "expired", label: "Expired" },
        ]}
      />

      {/* Platform filter — bigger, clearer, brand-coloured when active */}
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 pb-1 min-w-max">
          <button
            onClick={() => setPlatformFilter("ALL")}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors",
              platformFilter === "ALL"
                ? "bg-white text-gray-900"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            )}
          >
            All
          </button>
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatformFilter(p.key)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors",
                platformFilter === p.key
                  ? cn(p.brandColor, "text-white ring-2 ring-white/20")
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              )}
            >
              <span>{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <ListSkeleton rows={4} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={ExternalLink}
          title="No social tasks"
          description="Try a different filter or check back later."
        />
      )}

      {!loading && visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((t) => {
            const platform = PLATFORM_LOOKUP[t.platform];
            if (!platform) return null;
            const hasAi = t.items.some((it) => it.aiPromptEnabled);
            return (
              <div
                key={t.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex flex-col"
              >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0",
                    platform.brandColor
                  )}
                >
                  {platform.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {t.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-300">
                      {t.items.length} action{t.items.length > 1 ? "s" : ""}
                    </span>
                    {t.items.slice(0, 3).map((it, i) => {
                      const def = getAction(t.platform, it.action);
                      return (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-300"
                        >
                          {def ? `${def.emoji} ${def.label}` : it.action}
                        </span>
                      );
                    })}
                    {t.items.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400">
                        +{t.items.length - 3}
                      </span>
                    )}
                    {hasAi && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/15 text-purple-400 inline-flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        AI
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-amber-400 font-bold text-sm tabular-nums shrink-0">
                  +{t.pointsReward}
                </span>
              </div>
              <div className="mt-auto pt-3">
                {t.locked ? (
                  <span className="w-full inline-flex items-center justify-center gap-1 py-2.5 rounded-lg bg-gray-800 text-gray-500 text-xs font-bold cursor-not-allowed">
                    🔒 Locked
                  </span>
                ) : (
                  <Link
                    href={`/social-tasks/${t.id}`}
                    className="w-full inline-flex items-center justify-center gap-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                  >
                    {status === "available" ? "Start task" : "View task"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
