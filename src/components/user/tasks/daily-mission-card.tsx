"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Flame, Gift } from "lucide-react";
import { pts } from "@/lib/utils";

/**
 * Top of /tasks: today's Daily Mission — how far along it is, what is left,
 * what finishing pays — with a Start button straight to the next unfinished
 * part. Orange, so it is the first thing the eye lands on. Falls back to
 * `fallback` (the "Start here" pick) when there is no mission for this member.
 */

type Item = {
  id: string;
  taskType: string;
  description: string | null;
  targetCount: number;
  xpPerComplete: number;
  pointsPerComplete: number;
  completedToday: number;
  done: boolean;
};

type Today = {
  mission: { name: string; completionXpReward: number; completionPointsReward: number } | null;
  items?: Item[];
  progress?: { done: number; total: number; allDone: boolean };
  claimedToday?: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video",
  ARTICLE: "Article",
  SOCIAL: "Social",
  SURVEY: "Survey",
  QUIZ: "Quiz",
  APPINSTALL: "App install",
  CUSTOM: "Custom",
  VISIT: "Visit",
  PROXY: "Proxy",
  MANUAL: "Manual",
};

/** Today's work per category, from the hub's summary — for the no-mission card. */
export type TodayPlan = {
  items: { key: string; label: string; href: string; left: number; doneToday: number; points: number }[];
  completedToday: number;
  pointsEarned: number;
  xpEarned: number;
};

export function DailyMissionCard({
  hrefForType,
  fallback,
  plan,
}: {
  /** Page that runs a task type (from the hub's category list). */
  hrefForType: (taskType: string) => string | null;
  fallback: ReactNode;
  /** Shown as "Today's progress" when no Daily Mission is set up. */
  plan?: TodayPlan;
}) {
  const [data, setData] = useState<Today | null | "none">(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-mission/today", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Today) : null))
      .then((d) => !cancelled && setData(d?.mission ? d : "none"))
      .catch(() => !cancelled && setData("none"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null) return <div className="h-40 animate-pulse rounded-2xl bg-orange-500/10" aria-hidden />;
  if (data === "none" || !data.mission) {
    return plan && (plan.items.length > 0 || plan.completedToday > 0) ? <TodayPlanCard plan={plan} /> : <>{fallback}</>;
  }

  const items = data.items ?? [];
  const done = data.progress?.done ?? 0;
  const total = data.progress?.total ?? items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const left = items.filter((i) => !i.done);
  const next = left[0];
  const startHref = (next && hrefForType(next.taskType)) || "/daily-mission";
  const finished = data.progress?.allDone ?? false;

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/25 via-orange-500/10 to-amber-500/5 p-4 shadow-lg shadow-orange-950/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-orange-300">
            <Flame className="h-3.5 w-3.5" /> Daily mission
          </p>
          <h2 className="mt-1 truncate text-lg font-black text-white">{data.mission.name}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-black tabular-nums text-orange-200">
          {done}/{total}
        </span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      {(data.mission.completionPointsReward > 0 || data.mission.completionXpReward > 0) && (
        <p className="mt-2.5 inline-flex flex-wrap items-center gap-1.5 text-sm text-orange-50">
          <Gift className="h-4 w-4 text-orange-300" />
          Finish it to get
          {data.mission.completionPointsReward > 0 && (
            <b className="text-white">+{pts(data.mission.completionPointsReward)} pts</b>
          )}
          {data.mission.completionXpReward > 0 && <b className="text-white">+{data.mission.completionXpReward} XP</b>}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((it) => {
            const href = hrefForType(it.taskType);
            const row = (
              <>
                <span
                  className={
                    it.done
                      ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"
                      : "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-orange-300/70 text-[10px] font-black text-orange-200"
                  }
                >
                  {it.done ? <Check className="h-3.5 w-3.5" /> : it.targetCount - it.completedToday}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={it.done ? "block truncate text-sm text-orange-100/60 line-through" : "block truncate text-sm font-semibold text-white"}>
                    {it.description || `Complete ${it.targetCount} ${TYPE_LABEL[it.taskType] ?? it.taskType.toLowerCase()} task${it.targetCount === 1 ? "" : "s"}`}
                  </span>
                  <span className="block text-xs text-orange-100/70">
                    {it.completedToday}/{it.targetCount} done
                    {it.pointsPerComplete > 0 ? ` · +${pts(it.pointsPerComplete)} pts each` : ""}
                    {it.xpPerComplete > 0 ? ` · +${it.xpPerComplete} XP each` : ""}
                  </span>
                </span>
                {!it.done && href && <ArrowRight className="h-4 w-4 shrink-0 text-orange-300" />}
              </>
            );
            return (
              <li key={it.id}>
                {!it.done && href ? (
                  <Link href={href} className="app-press flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2 hover:bg-black/30">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl bg-black/10 px-3 py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={finished ? "/daily-mission" : startHref}
        className="app-press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-black text-black hover:bg-orange-400"
      >
        {finished
          ? data.claimedToday
            ? "Mission done — see you tomorrow"
            : "Claim your mission reward"
          : next
            ? `Start: ${TYPE_LABEL[next.taskType] ?? next.taskType.toLowerCase()} tasks`
            : "Open daily mission"}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

/**
 * No Daily Mission set up: the same orange card, built from today's work —
 * done so far, what is left in each category and what it still pays.
 */
function TodayPlanCard({ plan }: { plan: TodayPlan }) {
  const left = plan.items.reduce((n, i) => n + i.left, 0);
  const total = plan.completedToday + left;
  const pct = total > 0 ? Math.round((plan.completedToday / total) * 100) : 100;
  const canEarn = plan.items.reduce((n, i) => n + i.points, 0);
  const next = plan.items[0];
  return (
    <section className="overflow-hidden rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/25 via-orange-500/10 to-amber-500/5 p-4 shadow-lg shadow-orange-950/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-orange-300">
            <Flame className="h-3.5 w-3.5" /> Today&apos;s progress
          </p>
          <h2 className="mt-1 text-lg font-black text-white">
            {left > 0 ? `${left} task${left === 1 ? "" : "s"} waiting for you` : "All done for today 🎉"}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-black tabular-nums text-orange-200">
          {plan.completedToday}/{total}
        </span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-orange-50">
        <span>
          Earned today <b className="text-white">+{pts(plan.pointsEarned)} pts</b>
          {plan.xpEarned > 0 ? <b className="text-white"> · +{plan.xpEarned} XP</b> : null}
        </span>
        {canEarn > 0 && (
          <span className="inline-flex items-center gap-1">
            <Gift className="h-4 w-4 text-orange-300" /> Still to earn <b className="text-white">+{pts(canEarn)} pts</b>
          </span>
        )}
      </p>

      {plan.items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {plan.items.slice(0, 5).map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="app-press flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2 hover:bg-black/30">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-orange-300/70 text-[10px] font-black text-orange-200">
                  {it.left}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{it.label}</span>
                  <span className="block text-xs text-orange-100/70">
                    {it.left} left{it.doneToday > 0 ? ` · ${it.doneToday} done today` : ""}
                    {it.points > 0 ? ` · up to ${pts(it.points)} pts` : ""}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-orange-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {next && (
        <Link
          href={next.href}
          className="app-press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-black text-black hover:bg-orange-400"
        >
          Start: {next.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
