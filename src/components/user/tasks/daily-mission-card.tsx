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

export function DailyMissionCard({
  hrefForType,
  fallback,
}: {
  /** Page that runs a task type (from the hub's category list). */
  hrefForType: (taskType: string) => string | null;
  fallback: ReactNode;
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
  if (data === "none" || !data.mission) return <>{fallback}</>;

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
