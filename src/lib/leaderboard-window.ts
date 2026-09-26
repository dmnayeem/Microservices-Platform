import "server-only";
import { prisma } from "@/lib/prisma";
import { NON_STAFF_WHERE } from "@/lib/staff";
import { completedBetween } from "@/lib/submission-status";

/**
 * Leaderboard prize ranking, scoped to the cycle being paid.
 *
 * WHY THIS EXISTS
 * ---------------
 * The prize run ranked every cycle on ALL-TIME totals — `topTaskEarners()` had
 * no date window, nor did the XP, referral, task-count or combined branches.
 * So the "daily" prize went to whoever led all time, every single day: one user
 * collected 16 payouts (95,000 points), and leaderboard prizes became the
 * largest source of points on the platform, larger than every task combined.
 * A daily/weekly/monthly cycle means "who did the most IN that day/week/month",
 * and that is what this ranks.
 *
 * Every metric is read from the window only:
 *   points  — task points from submissions completed in the window
 *   tasks   — submissions completed in the window
 *   xp      — XP from submissions completed in the window
 *   team    — referrals who signed up in the window
 *   COMBINED — the same average-of-four-percentiles the public board uses,
 *              over those windowed values
 * Someone with nothing in the window cannot win it.
 */

export type WindowMetric = "COMBINED" | "POINTS_EARNED" | "XP_EARNED" | "REFERRALS" | "TASKS_COMPLETED";

export interface CycleWindow {
  from: Date;
  to: Date;
}

/** [start, end) of the daily / ISO-weekly / monthly cycle containing `at`, UTC. */
export function cycleWindow(period: "daily" | "weekly" | "monthly", at: Date): CycleWindow {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const d = at.getUTCDate();
  if (period === "monthly") {
    return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
  }
  if (period === "daily") {
    return { from: new Date(Date.UTC(y, m, d)), to: new Date(Date.UTC(y, m, d + 1)) };
  }
  // ISO week: Monday 00:00 UTC to the next Monday — the same week `cycleKey` names.
  const dow = at.getUTCDay() || 7;
  const monday = new Date(Date.UTC(y, m, d - (dow - 1)));
  return { from: monday, to: new Date(monday.getTime() + 7 * 86_400_000) };
}

type Row = { userId: string; name: string | null; points: number; xp: number; tasks: number; team: number };

async function windowedActivity(w: CycleWindow): Promise<Row[]> {
  const done = completedBetween(w.from, w.to);
  const [subsRaw, refsRaw] = await Promise.all([
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: done,
      _sum: { pointsEarned: true, xpEarned: true },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["referredById"],
      where: { referredById: { not: null }, createdAt: { gte: w.from, lt: w.to } },
      _count: { _all: true },
    }),
  ]);
  const subs = subsRaw as unknown as Array<{
    userId: string;
    _sum: { pointsEarned: number | null; xpEarned: number | null };
    _count: { _all: number };
  }>;
  const refs = refsRaw as unknown as Array<{ referredById: string | null; _count: { _all: number } }>;

  const by = new Map<string, Omit<Row, "name">>();
  const get = (id: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { userId: id, points: 0, xp: 0, tasks: 0, team: 0 }));
    return r;
  };
  for (const s of subs) {
    const r = get(s.userId);
    r.points = s._sum.pointsEarned ?? 0;
    r.xp = s._sum.xpEarned ?? 0;
    r.tasks = s._count._all;
  }
  for (const f of refs) if (f.referredById) get(f.referredById).team = f._count._all;
  if (by.size === 0) return [];
  return [...by.values()].map((r) => ({ ...r, name: null }));
}

/**
 * The top `take` eligible, non-staff users for `metric` within the window.
 * `eligibleSet` holds upper-cased package slugs, as in leaderboard-reset.
 */
export async function topUsersInWindow(
  metric: WindowMetric,
  take: number,
  eligibleSet: Set<string>,
  w: CycleWindow
): Promise<Array<{ userId: string; name: string | null; value: number }>> {
  const activity = await windowedActivity(w);
  if (activity.length === 0) return [];

  const usersRaw = await prisma.user.findMany({
    where: { id: { in: activity.map((a) => a.userId) }, ...NON_STAFF_WHERE },
    select: { id: true, name: true, package: { select: { slug: true } } },
  });
  const users = usersRaw as unknown as Array<{ id: string; name: string | null; package: { slug: string } | null }>;
  const eligible = new Map(
    users
      .filter((u) => u.package?.slug && eligibleSet.has(u.package.slug.toUpperCase()))
      .map((u) => [u.id, u])
  );
  const rows = activity.filter((a) => eligible.has(a.userId)).map((a) => ({ ...a, name: eligible.get(a.userId)!.name }));

  if (metric === "COMBINED") {
    const pct = (vals: number[]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      return (v: number) => {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid] <= v) lo = mid + 1;
          else hi = mid;
        }
        return Math.round((lo / Math.max(1, sorted.length)) * 100);
      };
    };
    const [pP, pX, pT, pR] = [
      pct(rows.map((r) => r.points)),
      pct(rows.map((r) => r.xp)),
      pct(rows.map((r) => r.tasks)),
      pct(rows.map((r) => r.team)),
    ];
    return rows
      .map((r) => ({ r, score: (pP(r.points) + pX(r.xp) + pT(r.tasks) + pR(r.team)) / 4 }))
      .sort((a, b) => b.score - a.score || b.r.points - a.r.points)
      .slice(0, take)
      .map(({ r, score }) => ({ userId: r.userId, name: r.name, value: Math.round(score) }));
  }

  const pick: Record<Exclude<WindowMetric, "COMBINED">, (r: Row) => number> = {
    POINTS_EARNED: (r) => r.points,
    XP_EARNED: (r) => r.xp,
    REFERRALS: (r) => r.team,
    TASKS_COMPLETED: (r) => r.tasks,
  };
  const f = pick[metric];
  return rows
    .map((r) => ({ userId: r.userId, name: r.name, value: f(r) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, take);
}
