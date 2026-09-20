"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowRight, Sparkles, Share2 } from "lucide-react";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/ui/brand-icon";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
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
  const [tasks, setTasks] = useState<(SocialTaskView & { locked?: boolean })[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await fetch(
          `/api/tasks/social?status=${status}${kind ? `&kind=${kind}` : ""}`,
          { cache: "no-store" }
        );
        const d = await r.json();
        setTasks(d.tasks ?? []);
      } catch {
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
                ? "bg-(--app-bright) text-(--app-on-bright)"
                : "bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-2)"
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
                  : "bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-2)"
              )}
            >
              <BrandIcon brand={p.key} fallback={p.emoji} className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
      </ScrollFadeRow>

      <AdRenderer placement="TASK_LIST" />

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
                className="card p-3 flex flex-col"
              >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0",
                    platform.brandColor
                  )}
                >
                  <BrandIcon brand={platform.key} fallback={platform.emoji} className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {t.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-(--app-cta)/15 text-(--app-accent-ink)">
                      {t.items.length} action{t.items.length > 1 ? "s" : ""}
                    </span>
                    {t.items.slice(0, 3).map((it, i) => {
                      const def = getAction(t.platform, it.action);
                      return (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-(--app-surface-2) text-(--app-ink-2)"
                        >
                          {def ? `${def.emoji} ${def.label}` : it.action}
                        </span>
                      );
                    })}
                    {t.items.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-(--app-surface-2) text-(--app-ink-3)">
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
                  <span className="w-full inline-flex items-center justify-center gap-1 py-2.5 rounded-lg bg-(--app-surface-2) text-(--app-ink-3) text-xs font-bold cursor-not-allowed">
                    🔒 Locked
                  </span>
                ) : (
                  <Link
                    href={`/social-tasks/${t.id}`}
                    className="w-full inline-flex items-center justify-center gap-1 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold"
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
