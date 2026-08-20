"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ListTodo,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Share2,
  Globe,
  Gift,
  Smartphone,
  Sparkles,
  Megaphone,
  Brain,
  Pin,
  ArrowRight,
  Package as PackageIcon,
  GraduationCap,
  TrendingUp,
  Award,
} from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { StatCard } from "@/components/user/primitives/stat-card";
import { isCategoryVisible } from "@/lib/task-categories";
// Reuse the Earn-hub tabs (single source of truth — /earn stays unchanged).
import {
  LearnTab,
  LevelUpTab,
  PromoteTab,
  LeaderboardTab,
  OfferwallTab,
  type UserSummary,
} from "@/components/user/earn/earning-hub";

type SummaryRow = {
  available: number;
  completedToday: number;
  earnableXp: number;
};
type SummaryData = {
  summary: Record<string, SummaryRow>;
  board: SummaryRow;
  quizzes: number;
  offerwalls: number;
  /** Admin per-category on/off toggles (missing key ⇒ shown). */
  visibility: Record<string, boolean>;
};

type TabKey = "tasks" | "learn" | "rank" | "promote" | "leaderboard" | "offerwall";

const TABS: { key: TabKey; label: string; icon: typeof ListTodo }[] = [
  { key: "tasks", label: "Tasks", icon: ListTodo },
  { key: "learn", label: "Learn", icon: GraduationCap },
  { key: "rank", label: "Rank", icon: TrendingUp },
  { key: "promote", label: "Promote", icon: Megaphone },
  { key: "leaderboard", label: "Leaderboard", icon: Award },
  { key: "offerwall", label: "Offerwall", icon: Globe },
];

// Static full class strings (Tailwind can't see `bg-${color}` interpolation).
const CARD_COLOR: Record<
  string,
  { chip: string; hover: string; bar: string }
> = {
  red: { chip: "bg-red-500/10 text-red-400", hover: "hover:border-red-500/40", bar: "bg-red-500" },
  blue: { chip: "bg-blue-500/10 text-blue-400", hover: "hover:border-blue-500/40", bar: "bg-blue-500" },
  amber: { chip: "bg-amber-500/10 text-amber-400", hover: "hover:border-amber-500/40", bar: "bg-amber-500" },
  purple: { chip: "bg-purple-500/10 text-purple-400", hover: "hover:border-purple-500/40", bar: "bg-purple-500" },
  pink: { chip: "bg-pink-500/10 text-pink-400", hover: "hover:border-pink-500/40", bar: "bg-pink-500" },
  cyan: { chip: "bg-cyan-500/10 text-cyan-400", hover: "hover:border-cyan-500/40", bar: "bg-cyan-500" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-400", hover: "hover:border-emerald-500/40", bar: "bg-emerald-500" },
  indigo: { chip: "bg-indigo-500/10 text-indigo-400", hover: "hover:border-indigo-500/40", bar: "bg-indigo-500" },
  violet: { chip: "bg-violet-500/10 text-violet-400", hover: "hover:border-violet-500/40", bar: "bg-violet-500" },
};

type Kind = "type" | "board" | "feature";
interface Category {
  key: string;
  label: string;
  description: string;
  icon: typeof Video;
  color: keyof typeof CARD_COLOR;
  href: string;
  kind: Kind;
  /** Real Task.type (kind="type") for daily progress. */
  taskType?: string;
  /** Which non-task feature (kind="feature") — drives the hide-empty rule. */
  feature?: "social-posts" | "quizzes" | "offerwalls";
}

// Order exactly as requested.
const CATEGORIES: Category[] = [
  { key: "article", label: "Article", description: "Read articles to earn", icon: FileText, color: "blue", href: "/article-tasks", kind: "type", taskType: "ARTICLE" },
  { key: "video", label: "Video", description: "Watch videos to earn", icon: Video, color: "red", href: "/video-tasks", kind: "type", taskType: "VIDEO" },
  { key: "social-posts", label: "Social Posts", description: "Earn from your posts", icon: Megaphone, color: "violet", href: "/social-posts", kind: "feature", feature: "social-posts" },
  { key: "social", label: "Social Tasks", description: "Social media engagement", icon: Share2, color: "pink", href: "/social-tasks", kind: "type", taskType: "SOCIAL" },
  { key: "appinstall", label: "App Install", description: "Install an app + proof", icon: Smartphone, color: "emerald", href: "/app-install-tasks", kind: "type", taskType: "APPINSTALL" },
  { key: "custom", label: "Custom", description: "Custom tasks to earn", icon: Sparkles, color: "indigo", href: "/custom-tasks", kind: "type", taskType: "CUSTOM" },
  { key: "survey", label: "Survey", description: "Complete surveys", icon: ClipboardList, color: "purple", href: "/survey-tasks", kind: "type", taskType: "SURVEY" },
  { key: "quiz", label: "Quiz Tasks", description: "Answer quiz questions", icon: HelpCircle, color: "amber", href: "/quiz-tasks", kind: "type", taskType: "QUIZ" },
  { key: "proxy", label: "Proxy", description: "Geo-targeted browsing", icon: Globe, color: "cyan", href: "/proxy-tasks", kind: "type", taskType: "PROXY" },
  { key: "board", label: "Board Tasks", description: "Complete a task board", icon: Pin, color: "amber", href: "/board-tasks", kind: "board" },
  { key: "quizzes", label: "Quiz Games", description: "Standalone games — not tasks", icon: Brain, color: "amber", href: "/quizzes", kind: "feature", feature: "quizzes" },
  { key: "offerwalls", label: "Offerwalls", description: "Complete partner offers", icon: Gift, color: "emerald", href: "/offerwalls", kind: "feature", feature: "offerwalls" },
];

const EMPTY: SummaryData = {
  summary: {},
  board: { available: 0, completedToday: 0, earnableXp: 0 },
  quizzes: 0,
  offerwalls: 0,
  visibility: {},
};

export function TasksHubView({
  user,
  packageName,
}: {
  user: UserSummary;
  packageName: string;
}) {
  const [tab, setTab] = useState<TabKey>("tasks");
  const [data, setData] = useState<SummaryData>(EMPTY);
  const [today, setToday] = useState({
    completedToday: 0,
    pointsEarned: 0,
    xpEarned: 0,
  });

  const loadSummary = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks/summary", { cache: "no-store" });
      const d = r.ok ? await r.json() : EMPTY;
      setData({ ...EMPTY, ...d });
    } catch {
      /* keep last */
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/profile", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (!d?.todayStats) return;
      setToday({
        completedToday: d.todayStats.tasksCompleted ?? 0,
        pointsEarned: d.todayStats.pointsEarned ?? 0,
        xpEarned: d.todayStats.xpEarned ?? 0,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadStats();
  }, [loadSummary, loadStats]);

  useAutoRefresh(() => {
    loadSummary();
    loadStats();
  });

  const totalAvailable = useMemo(
    () => Object.values(data.summary).reduce((a, s) => a + s.available, 0),
    [data.summary]
  );

  // Which category cards show is controlled by the admin per-category toggle
  // (SystemSetting `tasks.category_visibility`); missing key ⇒ shown.
  const visibleCategories = useMemo(
    () => CATEGORIES.filter((cat) => isCategoryVisible(data.visibility, cat.key)),
    [data.visibility]
  );

  const STATS = [
    {
      label: "Available Tasks",
      value: totalAvailable,
      tone: "blue" as const,
      icon: <ListTodo className="w-5 h-5" />,
    },
    {
      label: "Completed Today",
      value: today.completedToday,
      tone: "green" as const,
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      label: "Points Earned",
      value: today.pointsEarned,
      tone: "amber" as const,
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      label: "XP Earned",
      value: today.xpEarned,
      tone: "purple" as const,
      icon: <Award className="w-5 h-5" />,
    },
  ];

  const progressFor = (cat: Category): SummaryRow | null => {
    if (cat.kind === "type") return data.summary[cat.taskType!] ?? null;
    if (cat.kind === "board") return data.board;
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <p className="text-gray-400 mt-1">
          Pick a task type to start earning points and XP
        </p>
      </div>

      {/* Stats row: package + today's numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Your Package"
          value={packageName}
          tone="slate"
          icon={<PackageIcon className="w-5 h-5" />}
        />
        {STATS.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            tone={s.tone}
            icon={s.icon}
          />
        ))}
      </div>

      {/* Tab row */}
      <nav className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 sticky top-0 z-10 bg-gray-950/80 backdrop-blur-sm">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                isActive
                  ? "bg-indigo-500/15 text-white border-indigo-500/40"
                  : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:bg-gray-800"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Tasks tab — category grid (only non-empty categories) */}
      {tab === "tasks" &&
        (visibleCategories.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks available right now"
            description="New earning opportunities appear here as soon as they're added."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCategories.map((cat) => {
              const c = CARD_COLOR[cat.color];
              const Icon = cat.icon;
              const row = progressFor(cat);
              const hasProgress = !!row && row.available > 0;
              const pct = hasProgress
                ? Math.min(100, Math.round((row!.completedToday / row!.available) * 100))
                : 0;
              return (
                <Link
                  key={cat.key}
                  href={cat.href}
                  className={cn(
                    "card card-interactive p-5 flex flex-col transition-colors",
                    c.hover
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl grid place-items-center shrink-0",
                        c.chip
                      )}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white">{cat.label}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {cat.description}
                      </p>
                    </div>
                  </div>

                  {hasProgress ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-gray-400">
                          {row!.completedToday}/{row!.available} done today
                        </span>
                        <span className="text-amber-400 font-bold">
                          Up to {row!.earnableXp} XP
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-[width]", c.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
                      Explore <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

      {tab === "learn" && <LearnTab />}
      {tab === "rank" && <LevelUpTab user={user} />}
      {tab === "promote" && <PromoteTab />}
      {tab === "leaderboard" && <LeaderboardTab user={user} />}
      {tab === "offerwall" && <OfferwallTab />}
    </div>
  );
}
