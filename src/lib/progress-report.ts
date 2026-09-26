import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { isPointsEarned, magnitudePoints } from "@/lib/finance/signing";
import { pointSourceOf, type PointSource } from "@/lib/finance/points-source";
import { getRevenueBreakdown, type RevenueStream } from "@/lib/finance/revenue";

/**
 * /admin/progress — how the platform did in a period (today, this week, this
 * month, any range) against the period just before it: users, points earned,
 * referrals and teams, and — finance only — money.
 *
 * Days are UTC, like every other admin count (finance pulse, returning users),
 * so a figure here matches the same figure elsewhere. Staff accounts are left
 * out: their seeded balances would drown what real users do.
 *
 * Points use the finance console's own rules (`isPointsEarned`,
 * `magnitudePoints`) — never `Transaction.amount`'s sign, which is not
 * consistent across writers.
 */

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "custom", label: "Custom" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export interface Period {
  key: PeriodKey;
  label: string;
  /** [from, to) — to is the midnight after the last day. */
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
}

const DAY = 86_400_000;
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parseYmd = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export function resolvePeriod(key?: string, fromStr?: string, toStr?: string): Period {
  const today = midnight(new Date());
  const tomorrow = new Date(today.getTime() + DAY);
  let k = (PERIODS.some((p) => p.key === key) ? key : "7d") as PeriodKey;
  let from: Date;
  let to: Date;
  // "This month" is compared with the same number of days of last month, so
  // the 5th is not measured against a whole 30-day month.
  let prevFrom: Date | null = null;
  let prevTo: Date | null = null;
  switch (k) {
    case "today":
      from = today;
      to = tomorrow;
      break;
    case "yesterday":
      from = new Date(today.getTime() - DAY);
      to = today;
      break;
    case "30d":
      from = new Date(today.getTime() - 29 * DAY);
      to = tomorrow;
      break;
    case "month": {
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      to = tomorrow;
      prevFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const lastOfPrev = new Date(from.getTime() - DAY).getUTCDate();
      const n = Math.min(today.getUTCDate(), lastOfPrev);
      prevTo = new Date(prevFrom.getTime() + n * DAY);
      break;
    }
    case "lastmonth":
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      prevFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
      prevTo = from;
      break;
    case "custom": {
      const a = parseYmd(fromStr);
      const b = parseYmd(toStr);
      if (a && b && a <= b) {
        from = a;
        to = new Date(Math.min(b.getTime() + DAY, tomorrow.getTime()));
        // A year at most — the report reads the ledger for the whole range.
        if (to.getTime() - from.getTime() > 366 * DAY) from = new Date(to.getTime() - 366 * DAY);
        break;
      }
      k = "7d";
      from = new Date(today.getTime() - 6 * DAY);
      to = tomorrow;
      break;
    }
    default:
      from = new Date(today.getTime() - 6 * DAY);
      to = tomorrow;
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
  if (!prevFrom || !prevTo) {
    prevTo = from;
    prevFrom = new Date(from.getTime() - days * DAY);
  }
  const label =
    k === "custom"
      ? `${ymd(from)} → ${ymd(new Date(to.getTime() - DAY))}`
      : PERIODS.find((p) => p.key === k)!.label;
  return { key: k, label, from, to, prevFrom, prevTo, days };
}

export interface Pair {
  cur: number;
  prev: number;
}

export interface DayRow {
  date: string;
  signups: number;
  active: number;
  returning: number;
  referred: number;
  tasks: number;
  points: number;
}

export interface ReferrerRow {
  userId: string;
  name: string | null;
  email: string;
  /** People they brought in during the period (or all time). */
  newReferrals: number;
  /** Everyone they have ever brought in (direct team). */
  teamSize: number;
  /** Direct team members who opened the app during the period. */
  teamActive: number;
  /** Referral commission earned in the period (or all time), in points. */
  commissionPoints: number;
}

export interface ProgressReport {
  period: Period;
  pointsPerUsd: number;
  signups: Pair;
  referredSignups: Pair;
  active: Pair;
  returning: Pair;
  /** Opened the app on every day of the period (multi-day periods only). */
  everyDay: Pair;
  tasksCompleted: Pair;
  pointsEarned: Pair;
  earners: Pair;
  commissionPoints: Pair;
  bySource: Array<{ source: PointSource; points: number }>;
  topEarners: Array<{ userId: string; name: string | null; email: string; points: number; tasks: number }>;
  topReferrers: ReferrerRow[];
  /** Day by day — the period, or the 14 days ending with it when it is shorter. */
  daily: DayRow[];
  money: null | {
    revenue: Pair;
    streams: RevenueStream[];
    withdrawalsRequested: Pair & { count: number };
    withdrawalsPaid: Pair & { count: number };
  };
}

const APPROVED = ["APPROVED", "AUTO_APPROVED"] as const;

export async function getProgressReport(
  period: Period,
  seesMoney: boolean,
  /** Rank referrers by the period (default) or by all time. */
  referrersAllTime = false,
): Promise<ProgressReport> {
  const { from, to, prevFrom, prevTo, days } = period;
  const refFrom = referrersAllTime ? new Date(0) : from;
  // The chart needs some context even for "Today".
  const chartFrom = days < 14 ? new Date(to.getTime() - 14 * DAY) : from;
  const readFrom = new Date(Math.min(prevFrom.getTime(), chartFrom.getTime()));
  const inCur = (d: Date) => d >= from && d < to;
  const inPrev = (d: Date) => d >= prevFrom && d < prevTo;

  const userCount = (a: Date, b: Date, referred = false) =>
    prisma.user.count({
      where: { role: "USER", createdAt: { gte: a, lt: b }, ...(referred ? { referredById: { not: null } } : {}) },
    });
  const tasksCount = (a: Date, b: Date) =>
    prisma.taskSubmission.count({
      where: { status: { in: [...APPROVED] }, reviewedAt: { gte: a, lt: b }, user: { role: "USER" } },
    });
  const activeIn = (a: Date, b: Date, n: number) =>
    prisma.$queryRaw<Array<{ active: number; returning: number; every: number }>>`
      SELECT COUNT(*)::int AS active,
             COUNT(*) FILTER (WHERE later > 0)::int AS returning,
             COUNT(*) FILTER (WHERE d = ${n})::int AS every
      FROM (
        SELECT a."userId", COUNT(*) AS d,
               COUNT(*) FILTER (WHERE a.date > (u."createdAt" AT TIME ZONE 'UTC')::date) AS later
        FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
        WHERE a.date >= ${a} AND a.date < ${b} AND u.role = 'USER'
        GROUP BY a."userId"
      ) x`.then((r) => r[0]);
  const commission = (a: Date, b: Date) =>
    prisma.referralEarning.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: a, lt: b } } });

  const [
    pointsPerUsd,
    signupsCur,
    signupsPrev,
    refCur,
    refPrev,
    tasksCur,
    tasksPrev,
    actCur,
    actPrev,
    comCur,
    comPrev,
    ledger,
    dailyRows,
    submissionsByUser,
  ] = await Promise.all([
    getPointsPerUsd(),
    userCount(from, to),
    userCount(prevFrom, prevTo),
    userCount(from, to, true),
    userCount(prevFrom, prevTo, true),
    tasksCount(from, to),
    tasksCount(prevFrom, prevTo),
    activeIn(from, to, days),
    activeIn(prevFrom, prevTo, Math.round((prevTo.getTime() - prevFrom.getTime()) / DAY)),
    commission(from, to),
    commission(prevFrom, prevTo),
    prisma.transaction.findMany({
      where: { createdAt: { gte: readFrom, lt: to }, user: { role: "USER" } },
      select: { userId: true, type: true, status: true, reference: true, amount: true, points: true, createdAt: true },
    }),
    prisma.$queryRaw<Array<{ date: Date; signups: number; referred: number; active: number; returning: number; tasks: number }>>`
      WITH days AS (
        SELECT generate_series(${chartFrom}::date, (${to}::date - 1), interval '1 day')::date AS date
      ),
      s AS (
        SELECT ("createdAt" AT TIME ZONE 'UTC')::date AS date, COUNT(*)::int AS signups,
               COUNT(*) FILTER (WHERE "referredById" IS NOT NULL)::int AS referred
        FROM "User" WHERE role = 'USER' AND "createdAt" >= ${chartFrom} AND "createdAt" < ${to} GROUP BY 1
      ),
      a AS (
        SELECT a.date, COUNT(*)::int AS active,
               COUNT(*) FILTER (WHERE a.date > (u."createdAt" AT TIME ZONE 'UTC')::date)::int AS returning
        FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
        WHERE a.date >= ${chartFrom} AND a.date < ${to} AND u.role = 'USER' GROUP BY 1
      ),
      t AS (
        SELECT (ts."reviewedAt" AT TIME ZONE 'UTC')::date AS date, COUNT(*)::int AS tasks
        FROM "TaskSubmission" ts JOIN "User" u ON u.id = ts."userId"
        WHERE ts.status IN ('APPROVED', 'AUTO_APPROVED') AND ts."reviewedAt" >= ${chartFrom} AND ts."reviewedAt" < ${to}
          AND u.role = 'USER'
        GROUP BY 1
      )
      SELECT d.date, COALESCE(s.signups, 0) AS signups, COALESCE(s.referred, 0) AS referred,
             COALESCE(a.active, 0) AS active, COALESCE(a.returning, 0) AS returning, COALESCE(t.tasks, 0) AS tasks
      FROM days d LEFT JOIN s ON s.date = d.date LEFT JOIN a ON a.date = d.date LEFT JOIN t ON t.date = d.date
      ORDER BY d.date`,
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: { status: { in: [...APPROVED] }, reviewedAt: { gte: from, lt: to } },
      _count: { _all: true },
    }),
  ]);

  // One pass over the ledger: totals, per day, by source, by user.
  const earned = { cur: 0, prev: 0 };
  const earnersCur = new Set<string>();
  const earnersPrev = new Set<string>();
  const perDay = new Map<string, number>();
  const bySource = new Map<PointSource, number>();
  const byUser = new Map<string, number>();
  for (const row of ledger) {
    const r = {
      type: row.type,
      status: row.status,
      reference: row.reference,
      amount: Number(row.amount ?? 0),
      points: row.points ?? 0,
    };
    if (!isPointsEarned(r)) continue;
    const pts = magnitudePoints(r);
    if (!pts) continue;
    const at = row.createdAt;
    if (at >= chartFrom) perDay.set(ymd(at), (perDay.get(ymd(at)) ?? 0) + pts);
    if (inCur(at)) {
      earned.cur += pts;
      earnersCur.add(row.userId);
      const src = pointSourceOf(r);
      bySource.set(src, (bySource.get(src) ?? 0) + pts);
      byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + pts);
    } else if (inPrev(at)) {
      earned.prev += pts;
      earnersPrev.add(row.userId);
    }
  }

  // Top referrers: most new referrals in the period, plus the biggest
  // commission earners (someone whose old team is busy may bring nobody new).
  const [newRefs, comByUser] = (await Promise.all([
    prisma.user.groupBy({
      by: ["referredById"],
      where: { referredById: { not: null }, role: "USER", createdAt: { gte: refFrom, lt: to } },
      _count: { _all: true },
      orderBy: { _count: { referredById: "desc" } },
      take: 20,
    }),
    prisma.referralEarning.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: refFrom, lt: to } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 20,
    }),
  ])) as unknown as [
    Array<{ referredById: string | null; _count: { _all: number } }>,
    Array<{ userId: string; _sum: { amount: Prisma.Decimal | null } }>,
  ];
  const refIds = [...new Set([...newRefs.map((r) => r.referredById!), ...comByUser.map((r) => r.userId)])];
  const topUserIds = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);

  const [people, teamSizes, teamActive] = (await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set([...refIds, ...topUserIds])] } },
      select: { id: true, name: true, email: true },
    }),
    refIds.length
      ? prisma.user.groupBy({ by: ["referredById"], where: { referredById: { in: refIds } }, _count: { _all: true } })
      : Promise.resolve([] as Array<{ referredById: string | null; _count: { _all: number } }>),
    refIds.length
      ? prisma.$queryRaw<Array<{ id: string; n: number }>>`
          SELECT u."referredById" AS id, COUNT(DISTINCT a."userId")::int AS n
          FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
          WHERE u."referredById" IN (${Prisma.join(refIds)}) AND a.date >= ${from} AND a.date < ${to}
          GROUP BY 1`
      : Promise.resolve([] as Array<{ id: string; n: number }>),
  ])) as unknown as [
    Array<{ id: string; name: string | null; email: string }>,
    Array<{ referredById: string | null; _count: { _all: number } }>,
    Array<{ id: string; n: number }>,
  ];
  const who = new Map(people.map((p) => [p.id, p]));
  const newMap = new Map(newRefs.map((r) => [r.referredById!, r._count._all]));
  const comMap = new Map(comByUser.map((r) => [r.userId, Math.round(toNum(r._sum.amount) * pointsPerUsd)]));
  const sizeMap = new Map(teamSizes.map((r) => [r.referredById!, r._count._all]));
  const actMap = new Map(teamActive.map((r) => [r.id, r.n]));
  const topReferrers: ReferrerRow[] = refIds
    .map((id) => ({
      userId: id,
      name: who.get(id)?.name ?? null,
      email: who.get(id)?.email ?? "",
      newReferrals: newMap.get(id) ?? 0,
      teamSize: sizeMap.get(id) ?? 0,
      teamActive: actMap.get(id) ?? 0,
      commissionPoints: comMap.get(id) ?? 0,
    }))
    .sort((a, b) => b.newReferrals - a.newReferrals || b.commissionPoints - a.commissionPoints)
    .slice(0, 15);

  const tasksBy = new Map(
    (submissionsByUser as unknown as Array<{ userId: string; _count: { _all: number } }>).map((s) => [s.userId, s._count._all]),
  );
  const topEarners = topUserIds.map((id) => ({
    userId: id,
    name: who.get(id)?.name ?? null,
    email: who.get(id)?.email ?? "",
    points: byUser.get(id) ?? 0,
    tasks: tasksBy.get(id) ?? 0,
  }));

  const daily: DayRow[] = dailyRows.map((d) => {
    const date = ymd(new Date(d.date));
    return {
      date,
      signups: d.signups,
      active: d.active,
      returning: d.returning,
      referred: d.referred,
      tasks: d.tasks,
      points: perDay.get(date) ?? 0,
    };
  });

  let money: ProgressReport["money"] = null;
  if (seesMoney) {
    const last = (b: Date) => new Date(b.getTime() - 1);
    const wd = (field: "createdAt" | "processedAt", a: Date, b: Date) =>
      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: field === "processedAt" ? { status: "COMPLETED", processedAt: { gte: a, lt: b } } : { createdAt: { gte: a, lt: b } },
      });
    const [revCur, revPrev, reqCur, reqPrev, paidCur, paidPrev] = await Promise.all([
      getRevenueBreakdown({ from, to: last(to) }),
      getRevenueBreakdown({ from: prevFrom, to: last(prevTo) }),
      wd("createdAt", from, to),
      wd("createdAt", prevFrom, prevTo),
      wd("processedAt", from, to),
      wd("processedAt", prevFrom, prevTo),
    ]);
    money = {
      revenue: { cur: revCur.totalUsd, prev: revPrev.totalUsd },
      streams: revCur.streams.filter((s) => s.usd > 0).sort((a, b) => b.usd - a.usd),
      withdrawalsRequested: { cur: toNum(reqCur._sum.amount), prev: toNum(reqPrev._sum.amount), count: reqCur._count._all },
      withdrawalsPaid: { cur: toNum(paidCur._sum.amount), prev: toNum(paidPrev._sum.amount), count: paidCur._count._all },
    };
  }

  return {
    period,
    pointsPerUsd,
    signups: { cur: signupsCur, prev: signupsPrev },
    referredSignups: { cur: refCur, prev: refPrev },
    active: { cur: actCur?.active ?? 0, prev: actPrev?.active ?? 0 },
    returning: { cur: actCur?.returning ?? 0, prev: actPrev?.returning ?? 0 },
    everyDay: { cur: actCur?.every ?? 0, prev: actPrev?.every ?? 0 },
    tasksCompleted: { cur: tasksCur, prev: tasksPrev },
    pointsEarned: earned,
    earners: { cur: earnersCur.size, prev: earnersPrev.size },
    commissionPoints: {
      cur: Math.round(toNum(comCur._sum.amount) * pointsPerUsd),
      prev: Math.round(toNum(comPrev._sum.amount) * pointsPerUsd),
    },
    bySource: [...bySource.entries()].map(([source, points]) => ({ source, points })).sort((a, b) => b.points - a.points),
    topEarners,
    topReferrers,
    daily,
    money,
  };
}
