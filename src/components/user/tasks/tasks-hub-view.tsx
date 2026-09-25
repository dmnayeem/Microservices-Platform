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
import { cn, pts } from "@/lib/utils";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { StatCard } from "@/components/user/primitives/stat-card";
import { isCategoryVisible } from "@/lib/task-categories";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";
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
  /** Distinct eligible tasks of this type already completed, all time. */
  completed?: number;
  earnableXp: number;
  earnablePoints?: number;
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

/* The `color` on each category below is kept — it is part of the catalogue
   descriptor and other surfaces may still want it — but the hub no longer
   renders it. Twelve category cards in nine hues is the worst instance of the
   problem in the product: a wall of red, blue, amber, purple, pink, cyan,
   emerald, indigo and violet, where the colour told you nothing except that
   someone had assigned one. Twelve identical neutral cards let the twelve
   LABELS do the distinguishing, which is what they are for. */

type Kind = "type" | "board" | "feature";
interface Category {
  key: string;
  label: string;
  description: string;
  icon: typeof Video;
  /** Catalogue metadata. Kept on the descriptor, no longer rendered here. */
  color:
    | "red"
    | "blue"
    | "amber"
    | "purple"
    | "pink"
    | "cyan"
    | "emerald"
    | "indigo"
    | "violet";
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
  { key: "video", label: "Video", description: "YouTube, Facebook & direct videos", icon: Video, color: "red", href: "/video-tasks", kind: "type", taskType: "VIDEO" },
  { key: "social-posts", label: "Social Posts", description: "Write & publish a post", icon: Megaphone, color: "violet", href: "/social-posts", kind: "feature", feature: "social-posts" },
  { key: "social", label: "Social Tasks", description: "Like, comment, share, follow", icon: Share2, color: "pink", href: "/social-tasks", kind: "type", taskType: "SOCIAL" },
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
  board: { available: 0, completedToday: 0, completed: 0, earnableXp: 0, earnablePoints: 0 },
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
        <h1 className="t-title text-white">Tasks</h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Pick a task type to start earning points and XP
        </p>
      </div>

      {/* The space is literally named for this page ("Tasks hub (/tasks) — top")
          and was mounted on all thirteen per-type task lists EXCEPT this one —
          the hub the mobile bottom nav points at. */}
      <AdRenderer placement="TASK_LIST" />

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
      <ScrollFadeRow
        className="-mx-1 sticky top-0 z-10"
        innerClassName="flex gap-1.5 px-1 pb-1"
        ariaLabel="Task tabs"
      >
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "app-tap-row app-press shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border",
                isActive
                  ? "app-accent-soft"
                  : "bg-(--app-surface) text-(--app-ink-3) border-(--app-line) hover:text-white"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </ScrollFadeRow>

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
              const Icon = cat.icon;
              const row = progressFor(cat);
              const hasProgress = !!row && row.available > 0;
              // The bar tracks how much of this type is FINISHED, not how much
              // was finished today. A user who cleared nineteen of twenty
              // article tasks last week saw an empty bar and "0/20 done today",
              // which reads as "nothing here has been touched".
              const done = row?.completed ?? 0;
              const pct = hasProgress
                ? Math.min(100, Math.round((done / row!.available) * 100))
                : 0;
              return (
                <Link
                  key={cat.key}
                  href={cat.href}
                  className="app-card app-press app-lift flex flex-col"
                >
                  <div className="flex items-start gap-3">
                    <div className="app-icon app-icon-lg">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="t-section text-white">{cat.label}</h3>
                      <p className="t-meta text-(--app-ink-3) mt-1">
                        {cat.description}
                      </p>
                    </div>
                  </div>

                  {hasProgress ? (
                    <div className="mt-auto pt-4">
                      <div className="flex items-center justify-between t-meta mb-1.5">
                        <span className="text-(--app-ink-3)">
                          <span className="text-white font-bold">{done}</span>
                          /{row!.available} done
                        </span>
                        {/* Points first: it is the number users compare between
                            task types. XP available is a genuine "there is
                            something here for you" signal, so it keeps the one
                            warn colour. */}
                        <span className="t-warn font-bold">
                          {(row!.earnablePoints ?? 0) > 0
                            ? `${pts(row!.earnablePoints ?? 0)} pts`
                            : ""}
                          {(row!.earnablePoints ?? 0) > 0 && row!.earnableXp > 0
                            ? " · "
                            : ""}
                          {row!.earnableXp > 0 ? `${row!.earnableXp} XP` : ""}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-(--app-surface-2) overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] bg-(image:--app-rail)"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="t-meta text-(--app-ink-3) mt-1.5">
                        {Math.max(0, row!.available - done)} left
                        {row!.completedToday > 0
                          ? ` · ${row!.completedToday} today`
                          : ""}
                      </p>
                    </div>
                  ) : (
                    <span className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-bold text-(--app-ink-3)">
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
