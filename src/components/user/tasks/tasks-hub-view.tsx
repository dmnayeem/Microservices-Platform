"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ListTodo,
  Search,
  FileText,
  Video,
  Brain,
  Send,
  ClipboardList,
  Globe,
  Pin,
  Smartphone,
} from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { taskRunHref } from "@/lib/task-routes";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  pointsReward: number;
  xpReward: number;
  difficulty?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  minLevel?: number;
  canStart?: boolean;
  reason?: string | null;
  locked?: boolean;
  lockReason?: string | null;
  userStatus?:
    | "AVAILABLE"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "COMPLETED"
    | "REVISION"
    | "REJECTED";
}

// Cohesive tinted chips (not saturated rainbow gradients) — professional look.
const QA_CHIP: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  violet: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20",
};

const QUICK_ACCESS = [
  { name: "Articles", href: "/article-tasks", icon: FileText, tone: "indigo" },
  { name: "Videos", href: "/video-tasks", icon: Video, tone: "rose" },
  { name: "Quizzes", href: "/quiz-tasks", icon: Brain, tone: "emerald" },
  { name: "Social", href: "/social-tasks", icon: Send, tone: "cyan" },
  { name: "Manual", href: "/manual-tasks", icon: ClipboardList, tone: "indigo" },
  { name: "Proxy", href: "/proxy-tasks", icon: Globe, tone: "violet" },
  { name: "Boards", href: "/board-tasks", icon: Pin, tone: "amber" },
  { name: "Offerwall", href: "/earn#offerwall", icon: Smartphone, tone: "violet" },
];

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ARTICLE", label: "Article" },
  { value: "VIDEO", label: "Video" },
  { value: "QUIZ", label: "Quiz" },
  { value: "SOCIAL", label: "Social" },
  { value: "MANUAL", label: "Manual" },
  { value: "PROXY", label: "Proxy" },
];

export function TasksHubView() {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    available: 0,
    completedToday: 0,
    pointsEarned: 0,
    xpEarned: 0,
  });

  // Fetch task list for the active filter. `silent` skips the skeleton so
  // background auto-refreshes don't flash.
  const loadTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const url =
        filter === "ALL"
          ? "/api/tasks?limit=50"
          : `/api/tasks?type=${filter}&limit=50`;
      try {
        const r = await fetch(url, { cache: "no-store" });
        const d = await r.json();
        setTasks(d.tasks ?? []);
        setStats((prev) => ({ ...prev, available: d.tasks?.length ?? 0 }));
      } catch {
        if (!silent) setTasks([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filter]
  );

  // Pull today's submission stats (separate small fetch).
  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/profile", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (!d?.todayStats) return;
      setStats((prev) => ({
        ...prev,
        completedToday: d.todayStats.tasksCompleted ?? 0,
        pointsEarned: d.todayStats.pointsEarned ?? 0,
        xpEarned: d.todayStats.xpEarned ?? 0,
      }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Live refresh: tab refocus + 15s timer (paused while tab hidden).
  useAutoRefresh(() => {
    loadTasks(true);
    loadStats();
  });

  const filtered = search.trim()
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          (t.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <p className="text-gray-400 mt-1">
          Complete tasks to earn points and XP
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-400">Available Tasks</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">
            {stats.available}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-400">Completed Today</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">
            {stats.completedToday}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-400">Points Earned</p>
          <p className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">
            {stats.pointsEarned}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-400">XP Earned</p>
          <p className="text-2xl font-bold text-purple-400 mt-1 tabular-nums">
            {stats.xpEarned}
          </p>
        </div>
      </div>

      <AdRenderer placement="TASK_LIST" />

      <section>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
          Quick Access
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {QUICK_ACCESS.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="group card card-interactive flex flex-col items-center justify-center gap-1.5 p-3"
            >
              <div
                className={`w-10 h-10 rounded-xl grid place-items-center ${QA_CHIP[item.tone]}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-gray-300 group-hover:text-white text-center leading-tight">
                {item.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <FilterChips
        value={filter}
        onChange={setFilter}
        options={FILTERS}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={ListTodo}
          title="No tasks available right now"
          description={
            search
              ? `Nothing matches "${search}"`
              : "Check back soon for new earning opportunities!"
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description ?? undefined}
              type={t.type.toLowerCase()}
              reward={t.pointsReward}
              xpReward={t.xpReward}
              difficulty={
                (t.difficulty?.toUpperCase() as "EASY" | "MEDIUM" | "HARD") ??
                undefined
              }
              durationMin={t.duration ?? undefined}
              thumbnail={t.thumbnailUrl ?? undefined}
              href={taskRunHref(t.type, t.id)}
              status={t.locked ? "LOCKED" : t.userStatus ?? "AVAILABLE"}
              actionLabel={t.locked ? "🔒 Locked" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
