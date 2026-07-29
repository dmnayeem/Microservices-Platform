"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Trophy,
  ListTodo,
  GraduationCap,
  TrendingUp,
  Megaphone,
  Award,
  Globe,
  Ticket,
  ClipboardList,
  Brain,
  Send,
  Pin,
  Smartphone,
  Crown,
  Star,
  Coins,
  Sparkles,
  Zap,
  Loader2,
  ArrowRight,
  Lock,
  CheckCircle,
} from "lucide-react";
import { TaskCard } from "@/components/user/primitives/task-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { GlobalSearch } from "@/components/user/primitives/global-search";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { cn } from "@/lib/utils";
import { calculateLevel, calculateXpProgress } from "@/lib/utils";
import { taskRunHref } from "@/lib/task-routes";

type TabKey =
  | "tasks"
  | "learn"
  | "rank"
  | "promote"
  | "leaderboard"
  | "offerwall";

const TABS: { key: TabKey; label: string; icon: typeof ListTodo }[] = [
  { key: "tasks", label: "Tasks", icon: ListTodo },
  { key: "learn", label: "Learn", icon: GraduationCap },
  { key: "rank", label: "Rank", icon: TrendingUp },
  { key: "promote", label: "Promote", icon: Megaphone },
  { key: "leaderboard", label: "Leaderboard", icon: Award },
  { key: "offerwall", label: "Offerwall", icon: Globe },
];

// Cohesive tinted chips (not saturated rainbow gradients) — matches the
// tasks-hub Quick Access for a consistent, professional look.
const QA_CHIP: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  violet: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20",
};

const QUICK_ACCESS = [
  { name: "Daily Mission", href: "/daily-mission", icon: Award, tone: "indigo" },
  { name: "Lottery", href: "/lottery", icon: Ticket, tone: "violet" },
  { name: "Manual Tasks", href: "/manual-tasks", icon: ClipboardList, tone: "indigo" },
  { name: "Quizzes", href: "/quiz-tasks", icon: Brain, tone: "emerald" },
  { name: "Social Tasks", href: "/social-tasks", icon: Send, tone: "cyan" },
  { name: "Proxy", href: "/proxy-tasks", icon: Globe, tone: "rose" },
  { name: "Board Tasks", href: "/board-tasks", icon: Pin, tone: "amber" },
  { name: "Offerwalls", href: "/offerwalls", icon: Smartphone, tone: "violet" },
];

interface UserSummary {
  id: string;
  name: string | null;
  avatar: string | null;
  level: number;
  xp: number;
  pointsBalance: number;
  packageTier: string;
}

interface EarningHubProps {
  user: UserSummary;
}

export function EarningHub({ user }: EarningHubProps) {
  const [tab, setTab] = useState<TabKey>("tasks");
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            Earn
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            All your earning options in one place.
          </p>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <Search className="w-4 h-4" />
          Search…
        </button>
      </header>

      {/* Quick Access 8-grid */}
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

      {/* Tab Nav */}
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

      {/* Active Tab */}
      <section>
        {tab === "tasks" && <TasksTab />}
        {tab === "learn" && <LearnTab />}
        {tab === "rank" && <LevelUpTab user={user} />}
        {tab === "promote" && <PromoteTab />}
        {tab === "leaderboard" && <LeaderboardTab user={user} />}
        {tab === "offerwall" && <OfferwallTab />}
      </section>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — Tasks
// ─────────────────────────────────────────────────────────────────────────────

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
}

const TASK_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "SOCIAL", label: "Social" },
  { value: "VIDEO", label: "Video" },
  { value: "ARTICLE", label: "Article" },
  { value: "QUIZ", label: "Quiz" },
  { value: "MANUAL", label: "Manual" },
  { value: "PROXY", label: "Proxy" },
  { value: "BOARD", label: "Board" },
] as const;

function TasksTab() {
  const [filter, setFilter] = useState<string>("ALL");
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const url = filter === "ALL" ? "/api/tasks" : `/api/tasks?type=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setTasks(d.tasks ?? []);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="space-y-4">
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={TASK_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={ListTodo}
          title="No tasks available"
          description="Check back soon for new earning opportunities."
        />
      )}

      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tasks.map((t) => (
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
              actionLabel="Start"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 — Learn (Courses)
// ─────────────────────────────────────────────────────────────────────────────

interface ApiCourse {
  id: string;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  difficulty?: string | null;
  totalDuration?: number | null;
  pointsReward?: number;
  creator?: { name?: string | null } | null;
}

function LearnTab() {
  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCourses(d.courses ?? []);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Available Courses</h2>
        <Link
          href="/course-creator"
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Create Course
        </Link>
      </div>

      {loading && <ListSkeleton rows={3} />}

      {!loading && courses.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="New courses will appear here. Be the first to create one!"
        />
      )}

      {!loading && courses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className="group glass rounded-xl hover:border-indigo-500/40 p-4 transition-colors"
            >
              <div className="flex gap-3">
                {c.thumbnail ? (
                  <SmartImage
                    src={c.thumbnail}
                    alt=""
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-lg object-cover bg-gray-800 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-7 h-7" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {c.title}
                  </h3>
                  {c.creator?.name && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      By {c.creator.name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                    {c.difficulty && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-800 uppercase">
                        {c.difficulty}
                      </span>
                    )}
                    {typeof c.pointsReward === "number" && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold">
                        <Coins className="w-3 h-3" />
                        {c.pointsReward}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-white shrink-0 self-center" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3 — Rank / Level Up
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_TIERS: { range: [number, number]; title: string; gradient: string }[] = [
  { range: [1, 10], title: "NOVICE", gradient: "from-slate-500 to-slate-600" },
  { range: [11, 25], title: "APPRENTICE", gradient: "from-blue-500 to-cyan-500" },
  { range: [26, 40], title: "EARNER", gradient: "from-emerald-500 to-teal-500" },
  { range: [41, 60], title: "PRO", gradient: "from-purple-500 to-pink-500" },
  { range: [61, 80], title: "ELITE", gradient: "from-amber-500 to-orange-500" },
  { range: [81, 95], title: "MASTER", gradient: "from-rose-500 to-red-600" },
  { range: [96, 99], title: "LEGEND", gradient: "from-fuchsia-500 to-purple-600" },
  { range: [100, 100], title: "G.O.A.T", gradient: "from-yellow-400 to-amber-500" },
];

function tierForLevel(level: number) {
  return LEVEL_TIERS.find(
    (t) => level >= t.range[0] && level <= t.range[1]
  ) ?? LEVEL_TIERS[0];
}

function LevelUpTab({ user }: { user: UserSummary }) {
  const level = useMemo(
    () => calculateLevel(user.xp ?? 0),
    [user.xp]
  );
  const progress = useMemo(
    () => calculateXpProgress(user.xp ?? 0),
    [user.xp]
  );
  const currentTier = tierForLevel(level);
  const currentLevelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentLevelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  return (
    <div className="space-y-4">
      <AdRenderer placement="EARN_HUB" />
      {/* Current Level Card */}
      <div
        className={`rounded-2xl p-5 bg-linear-to-r ${currentTier.gradient} shadow-2xl`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/80 font-bold">
                Lvl {level} · {currentTier.title}
              </p>
              <p className="text-lg font-extrabold text-white">
                {progress.current.toLocaleString()} XP
                <span className="text-sm font-medium text-white/70">
                  {" "}/ {progress.required.toLocaleString()}
                </span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold">
              Next
            </p>
            <p className="text-2xl font-extrabold text-white tabular-nums">
              Lv {level + 1}
            </p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/20 overflow-hidden mt-4">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <p className="text-[11px] text-white/80 mt-1.5">
          {progress.percentage}% to Level {level + 1}
        </p>
      </div>

      {/* Level Map */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
          Full Level Map (1–100)
        </p>
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
          {Array.from({ length: 100 }, (_, i) => i + 1).map((lvl) => {
            const tier = tierForLevel(lvl);
            const isPast = lvl < level;
            const isCurrent = lvl === level;
            const isLocked = lvl > level;
            const xpForLevel = lvl * lvl * 100;
            return (
              <div
                key={lvl}
                ref={isCurrent ? currentLevelRef : null}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  isCurrent
                    ? "bg-indigo-500/10 border-indigo-500/50 scale-[1.02]"
                    : isPast
                      ? "bg-gray-900 border-emerald-500/20"
                      : "bg-gray-900/60 border-gray-800 opacity-70"
                )}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold",
                    isPast
                      ? "bg-emerald-500/15 text-emerald-400"
                      : isCurrent
                        ? `bg-linear-to-r ${tier.gradient} text-white shadow-lg`
                        : "bg-gray-800 text-gray-500"
                  )}
                >
                  {isPast ? <CheckCircle className="w-4 h-4" /> : lvl}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold truncate",
                      isCurrent ? "text-white" : isPast ? "text-emerald-300" : "text-gray-400"
                    )}
                  >
                    Lvl {lvl} · {tier.title}
                    {isCurrent && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500 text-white rounded">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {xpForLevel.toLocaleString()} XP needed
                  </p>
                </div>
                {isLocked && <Lock className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                {isPast && (
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">
                    Done
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4 — Promote
// ─────────────────────────────────────────────────────────────────────────────

interface MissionItem {
  id: string;
  title: string;
  description: string;
  reward: number;
  progress: number;
  goal: number;
  done: boolean;
}

function PromoteTab() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/milestones")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: MissionItem[] = (d.missions ?? d.milestones ?? []).map(
          (m: {
            id: string;
            title: string;
            description?: string;
            reward?: number;
            progress?: number;
            goal?: number;
            done?: boolean;
          }) => ({
            id: m.id,
            title: m.title,
            description: m.description ?? "",
            reward: m.reward ?? 0,
            progress: m.progress ?? 0,
            goal: m.goal ?? 1,
            done: m.done ?? false,
          })
        );
        setMissions(list);
      })
      .catch(() => {
        if (!cancelled) setMissions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-linear-to-br from-amber-500/15 to-orange-500/10 p-4">
        <div className="flex items-start gap-3">
          <Megaphone className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-white">Spread the word</p>
            <p className="text-xs text-amber-200/90 mt-0.5">
              Boost any of your social posts for 100 pts to amplify reach. Earn
              referral commission on every signup.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link
                href="/referrals"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Share my link
              </Link>
              <Link
                href="/social-posts"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10"
              >
                Boost a post
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-white mb-2">Today&apos;s Missions</h2>

        {loading && <ListSkeleton rows={3} />}

        {!loading && missions.length === 0 && (
          <EmptyState
            icon={Megaphone}
            title="No active missions"
            description="Check back tomorrow for new missions to boost your earnings."
          />
        )}

        {!loading && missions.length > 0 && (
          <div className="space-y-2">
            {missions.slice(0, 6).map((m) => {
              const pct = Math.min(100, (m.progress / Math.max(1, m.goal)) * 100);
              return (
                <div
                  key={m.id}
                  className="glass rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {m.title}
                      </p>
                      {m.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">
                          {m.description}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-amber-400 text-xs font-bold tabular-nums shrink-0">
                      <Coins className="w-3 h-3" />+{m.reward}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        m.done
                          ? "bg-emerald-500"
                          : "bg-linear-to-r from-amber-500 to-orange-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                    {m.progress} / {m.goal}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5 — Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string | null;
  avatar: string | null;
  level: number;
  packageTier: string;
  value: number;
}

const LB_PERIODS = [
  { value: "points", label: "Points" },
  { value: "xp", label: "XP" },
  { value: "referrals", label: "Referrals" },
];

function LeaderboardTab({ user }: { user: UserSummary }) {
  const [period, setPeriod] = useState<string>("points");
  const [list, setList] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/leaderboard?type=${period}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setList(d.leaderboard ?? []);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const youEntry = list.find((e) => e.userId === user.id);

  return (
    <div className="space-y-4">
      <FilterChips
        value={period}
        onChange={setPeriod}
        options={LB_PERIODS}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && list.length > 0 && (
        <>
          {/* Top 3 podium */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 0, 2].map((idx) => {
              const e = list[idx];
              if (!e) return <div key={idx} />;
              const isFirst = e.rank === 1;
              const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉";
              return (
                <div
                  key={e.userId}
                  className={cn(
                    "rounded-xl p-3 text-center border backdrop-blur-xl",
                    isFirst
                      ? "bg-linear-to-b from-yellow-500/20 to-amber-500/5 border-yellow-500/40 -translate-y-2"
                      : "bg-gray-900 border-gray-800"
                  )}
                >
                  {isFirst && (
                    <Crown className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                  )}
                  <p className="text-2xl mb-1">{medal}</p>
                  <p className="text-sm font-bold text-white truncate">
                    {e.name ?? "Anon"}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Lvl {e.level}
                  </p>
                  <p className="text-base font-extrabold text-amber-400 tabular-nums mt-1">
                    {e.value.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Full ranking */}
          <div className="glass rounded-xl divide-y divide-gray-800">
            {list.slice(3).map((e) => (
              <div
                key={e.userId}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  e.userId === user.id && "bg-indigo-500/10"
                )}
              >
                <span className="w-7 text-right text-xs text-gray-500 font-mono">
                  #{e.rank}
                </span>
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(e.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {e.name ?? "Anon"}
                    {e.userId === user.id && (
                      <span className="ml-1 text-[10px] uppercase text-indigo-400 font-bold">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500">Lvl {e.level}</p>
                </div>
                <span className="text-sm font-bold text-amber-400 tabular-nums">
                  {e.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Your position banner (if outside top 50) */}
          {!youEntry && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm text-indigo-200">
              Your position is outside the top 50 — keep grinding to climb the
              ranks!
            </div>
          )}
        </>
      )}

      {!loading && list.length === 0 && (
        <EmptyState
          icon={Award}
          title="No leaderboard data yet"
          description="Be the first to earn and claim the #1 spot!"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 6 — Offerwall
// ─────────────────────────────────────────────────────────────────────────────

interface OfferwallProvider {
  id: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  avgReward?: number;
  url?: string;
}

interface OfferwallSummary {
  pending: number;
  approved: number;
  total: number;
  providers: OfferwallProvider[];
}

function OfferwallTab() {
  const [view, setView] = useState<"offerwalls" | "history">("offerwalls");
  const [data, setData] = useState<OfferwallSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/offerwalls")
      .then((r) => (r.ok ? r.json() : { providers: [], pending: 0, approved: 0, total: 0 }))
      .then((d) => {
        if (!cancelled) setData(d as OfferwallSummary);
      })
      .catch(() => {
        if (!cancelled)
          setData({ pending: 0, approved: 0, total: 0, providers: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="offerwall" className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label="Pending"
          value={data?.pending ?? 0}
          tone="amber"
        />
        <SummaryCard
          label="Approved"
          value={data?.approved ?? 0}
          tone="emerald"
        />
        <SummaryCard
          label="Total"
          value={data?.total ?? 0}
          tone="indigo"
        />
      </div>

      <FilterChips
        value={view}
        onChange={(v) => setView(v as "offerwalls" | "history")}
        options={[
          { value: "offerwalls", label: "Offerwalls" },
          { value: "history", label: "History" },
        ]}
      />

      {loading && <ListSkeleton rows={3} />}

      {!loading && view === "offerwalls" && (
        <>
          {(data?.providers ?? []).length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No offerwalls available"
              description="Offerwall providers will appear here once admin enables them."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(data?.providers ?? []).map((p) => (
                <a
                  key={p.id}
                  href={p.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group glass rounded-xl hover:border-indigo-500/40 p-4 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center text-white">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {p.name}
                      </p>
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 text-[10px] uppercase rounded font-bold mt-0.5",
                          p.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-gray-700 text-gray-400"
                        )}
                      >
                        {p.status}
                      </span>
                      {p.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mt-1">
                          {p.description}
                        </p>
                      )}
                      {typeof p.avgReward === "number" && (
                        <p className="text-[11px] text-amber-400 font-bold mt-1">
                          Avg ~{p.avgReward} pts
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-white shrink-0 self-center" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && view === "history" && (
        <EmptyState
          icon={Loader2}
          title="No offerwall completions yet"
          description="Approved offerwall completions show up here once you complete offers from the providers above."
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "indigo";
}) {
  const tones = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    indigo: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
  } as const;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-center backdrop-blur-xl",
        tones[tone]
      )}
    >
      <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">
        {label}
      </p>
      <p className="text-xl font-extrabold tabular-nums mt-0.5">
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] opacity-70">pts</p>
    </div>
  );
}

// Avoid noisy unused-import warnings while iterating
void Star;
void Zap;
