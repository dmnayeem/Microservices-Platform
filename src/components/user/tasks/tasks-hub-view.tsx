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
  BadgeDollarSign,
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
  TAB_PAGE,
  type UserSummary,
} from "@/components/user/earn/earning-hub";
import { isPathHidden } from "@/lib/page-visibility";
import { DailyMissionCard } from "@/components/user/tasks/daily-mission-card";

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
  { key: "leaderboard", label: "Leaderboard", icon: Award },
  { key: "offerwall", label: "Offerwall", icon: Globe },
];

type Kind = "type" | "board" | "feature";
interface Category {
  key: string;
  label: string;
  description: string;
  icon: typeof Video;
  /** Icon colour (TONE). */
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
  { key: "visit", label: "Visit & Earn", description: "Open a link for a set time or pass a short link", icon: Globe, color: "cyan", href: "/visit-tasks", kind: "type", taskType: "VISIT" },
  { key: "custom", label: "Custom", description: "Custom tasks to earn", icon: Sparkles, color: "indigo", href: "/custom-tasks", kind: "type", taskType: "CUSTOM" },
  { key: "survey", label: "Survey", description: "Complete surveys", icon: ClipboardList, color: "purple", href: "/survey-tasks", kind: "type", taskType: "SURVEY" },
  { key: "quiz", label: "Quiz Tasks", description: "Answer quiz questions", icon: HelpCircle, color: "amber", href: "/quiz-tasks", kind: "type", taskType: "QUIZ" },
  { key: "proxy", label: "Proxy", description: "Geo-targeted browsing", icon: Globe, color: "cyan", href: "/proxy-tasks", kind: "type", taskType: "PROXY" },
  { key: "board", label: "Board Tasks", description: "Complete a task board", icon: Pin, color: "amber", href: "/board-tasks", kind: "board" },
  { key: "quizzes", label: "Quiz Games", description: "Standalone games — not tasks", icon: Brain, color: "amber", href: "/quizzes", kind: "feature", feature: "quizzes" },
  { key: "offerwalls", label: "Offerwalls", description: "Complete partner offers", icon: Gift, color: "emerald", href: "/offerwalls", kind: "feature", feature: "offerwalls" },
  { key: "cpa", label: "CPA Offers", description: "Sign up with partners + proof", icon: BadgeDollarSign, color: "emerald", href: "/cpa", kind: "feature" },
];

/** Icon colour per category, so the types can be told apart at a glance. */
const TONE: Record<Category["color"], string> = {
  red: "bg-red-500/15 text-red-300",
  blue: "bg-blue-500/15 text-blue-300",
  amber: "bg-amber-500/15 text-amber-300",
  purple: "bg-purple-500/15 text-purple-300",
  pink: "bg-pink-500/15 text-pink-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  indigo: "bg-indigo-500/15 text-indigo-300",
  violet: "bg-violet-500/15 text-violet-300",
};

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
  initialSummary,
  hiddenPaths,
}: {
  user: UserSummary;
  packageName: string;
  /** Server-rendered first copy of /api/tasks/summary (null ⇒ fetch on mount). */
  initialSummary?: SummaryData | null;
  /** Pages hidden by super-admin page visibility — their cards/tabs drop out. */
  hiddenPaths?: string[];
}) {
  const [tab, setTab] = useState<TabKey>("tasks");
  const [data, setData] = useState<SummaryData>(() =>
    initialSummary ? { ...EMPTY, ...initialSummary } : EMPTY
  );
  const hasInitialSummary = !!initialSummary;
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
    // Deferred a tick so the loaders' setState calls are not synchronous in the
    // effect body (react-hooks/set-state-in-effect).
    // The summary arrives server-rendered; only fetch it here when it did not.
    void Promise.resolve().then(() => {
      if (!hasInitialSummary) loadSummary();
      loadStats();
    });
  }, [loadSummary, loadStats, hasInitialSummary]);

  useAutoRefresh(() => {
    loadSummary();
    loadStats();
  });

  const totalAvailable = useMemo(
    () => Object.values(data.summary).reduce((a, s) => a + s.available, 0),
    [data.summary]
  );

  // Which category cards show is controlled by the admin per-category toggle
  // (SystemSetting `tasks.category_visibility`); missing key ⇒ shown. A card
  // whose page the super admin hid for this user drops out as well.
  const visibleCategories = useMemo(
    () =>
      CATEGORIES.filter(
        (cat) =>
          isCategoryVisible(data.visibility, cat.key) &&
          !isPathHidden(cat.href, hiddenPaths)
      ),
    [data.visibility, hiddenPaths]
  );
  const tabs = TABS.filter(
    (t) => !TAB_PAGE[t.key] || !isPathHidden(TAB_PAGE[t.key]!, hiddenPaths)
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
    // Social is split the way its two lists are: posts you WRITE, and
    // like/follow/comment work. Social Posts had no numbers at all.
    if (cat.key === "social-posts") return data.summary.SOCIAL_POSTS ?? null;
    if (cat.key === "social") return data.summary.SOCIAL_ENGAGE ?? data.summary[cat.taskType!] ?? null;
    if (cat.kind === "type") return data.summary[cat.taskType!] ?? null;
    if (cat.kind === "board") return data.board;
    return null;
  };

  // What to do, in order: task types with work waiting (most points first),
  // the non-task features, and the task types that are empty right now.
  const ranked = visibleCategories.map((cat) => {
    const row = progressFor(cat);
    const done = row?.completed ?? 0;
    const left = row ? Math.max(0, row.available - done) : 0;
    const isTask = cat.kind === "type" || cat.kind === "board" || cat.key === "social-posts";
    const pct = row && row.available > 0 ? Math.min(100, Math.round((done / row.available) * 100)) : 0;
    return { cat, row, left, isTask, pct, points: row?.earnablePoints ?? 0 };
  });
  const ready = ranked
    .filter((r): r is typeof r & { row: SummaryRow } => r.isTask && !!r.row && r.left > 0)
    .sort((a, b) => b.points - a.points || b.left - a.left);
  const more = ranked.filter((r) => !r.isTask).map((r) => r.cat);
  const empty = ranked.filter((r) => r.isTask && r.left === 0).map((r) => r.cat);
  const next = ready[0] ?? null;

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
      {/* One sideways row on a phone — five stacked tiles pushed the tasks
          a whole screen down. */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5 [&>*]:w-40 [&>*]:shrink-0 sm:[&>*]:w-auto">
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
        {tabs.map((t) => {
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
                  : "bg-(--app-surface) text-(--app-ink-3) border-(--app-line) hover:text-(--app-ink)"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </ScrollFadeRow>

      {/* Tasks tab. On a phone, fourteen identical cards — empty ones
          included — gave no hint where to start. Now: one "Start here" pick,
          then the types that HAVE work, numbered by what they pay, then the
          other ways to earn, and the empty types last in one small row. */}
      {tab === "tasks" &&
        (visibleCategories.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks available right now"
            description="New earning opportunities appear here as soon as they're added."
          />
        ) : (
          // Desktop (xl): the mission card becomes a sticky right column beside
          // the task grid. Full width it was a 1,100px-wide card holding five
          // short rows and an orange button stretched edge to edge. Below xl
          // this is the same single column as before (card, then sections).
          <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6 xl:space-y-0">
            {/* Today's Daily Mission first — progress, what is left, what it
                pays, and a Start button. Without a mission it is the old
                "Start here" pick. */}
            <div className="xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1">
            <DailyMissionCard
              plan={{
                items: ready.map((r) => ({
                  key: r.cat.key,
                  label: r.cat.label,
                  href: r.cat.href,
                  left: r.left,
                  doneToday: r.row.completedToday,
                  points: r.points,
                })),
                completedToday: today.completedToday,
                pointsEarned: today.pointsEarned,
                xpEarned: today.xpEarned,
              }}
              hrefForType={(type) =>
                visibleCategories.find((c) => c.taskType === type || (type.startsWith("SOCIAL") && c.taskType === "SOCIAL"))?.href ?? null
              }
              fallback={
                <>
                {next && (
                  <Link
                    href={next.cat.href}
                    className="app-card app-press block border-(--app-accent-edge) bg-(--app-nav-wash)"
                  >
                    <p className="text-[11px] font-black uppercase tracking-widest text-(--app-accent-ink)">
                      Start here
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", TONE[next.cat.color])}>
                        <next.cat.icon className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black text-white">{next.cat.label}</p>
                        <p className="t-meta text-(--app-ink-3)">
                          {next.left} task{next.left === 1 ? "" : "s"} waiting
                          {next.points > 0 ? ` · up to ${pts(next.points)} pts` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="mt-3 flex w-full items-center justify-center gap-2 app-accent rounded-xl py-3 text-sm font-black">
                      Start {next.cat.label} <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                )}
                </>
              }
            />
            </div>

            <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
            {ready.length > 0 && (
              <section>
                <h2 className="t-section text-white">Tasks for you</h2>
                <p className="t-meta text-(--app-ink-3) mt-0.5">In order of what they pay — start with number 1.</p>
                <ol className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {ready.map((r, i) => (
                    <li key={r.cat.key}>
                      <Link href={r.cat.href} className="app-card app-press app-lift relative flex h-full flex-col gap-2.5 !p-4">
                        <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-(--app-surface-2) text-xs font-black text-(--app-ink-2)">
                          {i + 1}
                        </span>
                        <span className={cn("grid h-12 w-12 place-items-center rounded-2xl", TONE[r.cat.color])}>
                          <r.cat.icon className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-black text-white">{r.cat.label}</p>
                          <p className="t-meta text-(--app-ink-3) line-clamp-2">{r.cat.description}</p>
                        </div>
                        <p className="text-sm font-bold text-(--app-ink)">
                          {r.left} left
                          {r.points > 0 ? <span className="text-amber-300"> · {pts(r.points)} pts</span> : null}
                        </p>
                        {r.row.completedToday > 0 && (
                          <p className="t-meta text-emerald-300">{r.row.completedToday} done today</p>
                        )}
                        <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-(--app-surface-2)">
                          <div className="h-full rounded-full bg-(image:--app-rail)" style={{ width: `${r.pct}%` }} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {more.length > 0 && (
              <section>
                <h2 className="t-section text-white">More ways to earn</h2>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
                  {more.map((cat) => (
                    <Link key={cat.key} href={cat.href} className="app-card app-press app-lift flex flex-col gap-2 !p-3">
                      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", TONE[cat.color])}>
                        <cat.icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-bold text-white">{cat.label}</span>
                      <span className="t-meta text-(--app-ink-3) line-clamp-2">{cat.description}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {empty.length > 0 && (
              <section>
                <h2 className="t-meta font-bold uppercase tracking-wider text-(--app-ink-3)">
                  No tasks right now — check back soon
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
                  {empty.map((cat) => (
                    <Link
                      key={cat.key}
                      href={cat.href}
                      className="app-card app-press flex items-center gap-2.5 !p-3 opacity-70 hover:opacity-100"
                    >
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE[cat.color])}>
                        <cat.icon className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">{cat.label}</span>
                        <span className="block t-meta text-(--app-ink-3)">No tasks now</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            </div>
          </div>
        ))}

      {tab === "learn" && <LearnTab hiddenPaths={hiddenPaths} />}
      {tab === "rank" && <LevelUpTab user={user} />}
      {tab === "promote" && <PromoteTab hiddenPaths={hiddenPaths} />}
      {tab === "leaderboard" && <LeaderboardTab user={user} />}
      {tab === "offerwall" && <OfferwallTab />}
    </div>
  );
}
