"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowRight, Sparkles, Share2 } from "lucide-react";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { TaskListError } from "./task-list-error";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/ui/brand-icon";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { TaskDeviceChips, type TaskDeviceNeeds } from "@/components/user/primitives/task-card";
import { openPlanUpsell } from "@/components/user/tasks/plan-upsell";
import { toast } from "@/lib/toast";
import { SlotsBar, type TaskGate } from "@/components/user/primitives/task-card";
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

export function SocialTasksView({
  kind,
  heading = "Social Tasks",
  subheading = "Follow, like, comment & share to earn — proof-verified.",
  icon,
}: {
  /** Narrow the list to post-creation or engagement tasks. Omit for both. */
  kind?: "create" | "engage";
  heading?: string;
  subheading?: string;
  icon?: React.ReactNode;
} = {}) {
  const [status, setStatus] = useState<Status>("available");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [tasks, setTasks] = useState<(SocialTaskView & { locked?: boolean; inProgress?: boolean })[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await fetch(
          `/api/tasks/social?status=${status}${kind ? `&kind=${kind}` : ""}`,
          { cache: "no-store" }
        );
        if (r.status >= 500) throw new Error(String(r.status)); // 4xx = gated: empty list
        const d = await r.json();
        setFailed(false);
        setTasks(d.tasks ?? []);
      } catch {
        if (!silent) setFailed(true);
        if (!silent) setTasks([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [status, kind]
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          {icon ?? <Share2 className="w-6 h-6 text-cyan-400" />}
          {heading}
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">{subheading}</p>
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
      <ScrollFadeRow className="-mx-4" innerClassName="flex items-center gap-2 px-4 pb-1 min-w-max" ariaLabel="Platform filter">
          <button
            onClick={() => setPlatformFilter("ALL")}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors",
              platformFilter === "ALL"
                ? "bg-(--app-cta) text-(--app-on-cta)"
                : "bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
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
                  : "bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
              )}
            >
              <BrandIcon brand={p.key} fallback={p.emoji} className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
      </ScrollFadeRow>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && failed && <TaskListError onRetry={() => load()} />}

      {!loading && !failed && visible.length === 0 && (
        <EmptyState
          icon={ExternalLink}
          title="No social tasks"
          description="Try a different filter or check back later."
        />
      )}

      {!loading && !failed && visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((t) => {
            const platform = PLATFORM_LOOKUP[t.platform];
            if (!platform) return null;
            const hasAi = t.items.some((it) => it.aiPromptEnabled);
            return (
              <div
                key={t.id}
                className="card app-lift flex min-h-[220px] flex-col p-4"
              >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md",
                    platform.brandColor
                  )}
                >
                  <BrandIcon brand={platform.key} fallback={platform.emoji} className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold leading-snug text-white line-clamp-2">
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold text-(--app-ink-2)">{platform.label}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <TaskDeviceChips needs={t as unknown as TaskDeviceNeeds} />
                    <span className="app-chip app-accent-soft">
                      {t.items.length} action{t.items.length > 1 ? "s" : ""}
                    </span>
                    {t.items.slice(0, 3).map((it, i) => {
                      const def = getAction(t.platform, it.action);
                      return (
                        <span
                          key={i}
                          className="app-chip text-(--app-ink-2)"
                        >
                          {def ? `${def.emoji} ${def.label}` : it.action}
                        </span>
                      );
                    })}
                    {t.items.length > 3 && (
                      <span className="app-chip">
                        +{t.items.length - 3}
                      </span>
                    )}
                    {status === "available" && t.inProgress && (
                      <span className="app-chip app-chip-warn">
                        In progress
                      </span>
                    )}
                    {hasAi && (
                      <span className="app-chip bg-purple-500/15 text-purple-300">
                        <Sparkles className="w-3 h-3" />
                        AI
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-sm font-black tabular-nums text-amber-300">
                  +{t.pointsReward}
                </span>
              </div>
              {t.description && (
                <p className="mt-2.5 text-[13px] leading-snug text-(--app-ink-2) line-clamp-2">{t.description}</p>
              )}
              {typeof (t as unknown as TaskGate).completedCount === "number" && (
                <div className="mt-3">
                  <SlotsBar
                    completed={(t as unknown as TaskGate).completedCount!}
                    total={(t as unknown as TaskGate).totalLimit ?? null}
                  />
                </div>
              )}
              <div className="mt-auto pt-4">
                {(t as unknown as TaskGate).planLock ? (
                  <button
                    type="button"
                    onClick={() => openPlanUpsell((t as unknown as TaskGate).planLock!)}
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-amber-500/15 text-amber-300 text-sm font-bold"
                  >
                    ⭐ {(t as unknown as TaskGate).planLock!.name} plan
                  </button>
                ) : t.locked ? (
                  <button
                    type="button"
                    onClick={() =>
                      toast.info("This task is locked", {
                        description:
                          (t as unknown as TaskGate).lockReason ??
                          "Complete the task before this one in this category first — then this one unlocks.",
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-(--app-surface-2) text-(--app-ink-3) text-sm font-bold"
                  >
                    🔒 Locked
                  </button>
                ) : (
                  <Link
                    href={`/social-tasks/${t.id}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold"
                  >
                    {status === "available" ? (t.inProgress ? "Continue task" : "Start task") : "View task"}
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
