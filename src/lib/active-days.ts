import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Which days each account opened the app (`UserActiveDay`, UTC days), and the
 * "returning" / "comes daily" views built on it for /admin/users/returning.
 *
 * Returning = came back on a LATER DAY than the day it signed up — the same
 * definition as the "Returning users" card in lib/finance/pulse.ts.
 * Streak = consecutive days ending today, or yesterday (today is not over).
 */

/** Record that the user opened the app today. One row per user per day. */
export async function markActiveToday(userId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "UserActiveDay" ("userId", "date") VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date)
    ON CONFLICT DO NOTHING`.catch(() => {});
}

/** Midnight UTC, `daysBack` days ago. */
export function utcDay(daysBack = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

export type ReturningRow = {
  userId: string;
  /** Days active in the window. */
  days: number;
  lastDay: Date;
  streak: number;
};

export type ReturningQuery = {
  /** Window length in days, today included. */
  windowDays: number;
  /** Only accounts whose current streak is at least this long. 0 = any. */
  minStreak: number;
  search?: string;
  sort: "days" | "streak" | "recent";
  take: number;
  skip: number;
};

/**
 * Current streak per user, for users seen today or yesterday — anyone else's
 * streak is 0. Gaps-and-islands: consecutive dates share `date - row_number`.
 */
const streaks = () => Prisma.sql`
  isl AS (
    SELECT "userId", date, date - (ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY date))::int AS grp
    FROM "UserActiveDay"
    WHERE "userId" IN (SELECT "userId" FROM "UserActiveDay" WHERE date >= ${utcDay(1)})
  ),
  lastgrp AS (
    SELECT DISTINCT ON ("userId") "userId", grp FROM isl ORDER BY "userId", date DESC
  ),
  streak AS (
    SELECT i."userId", COUNT(*)::int AS streak
    FROM isl i JOIN lastgrp l ON l."userId" = i."userId" AND l.grp = i.grp
    GROUP BY i."userId"
  )`;

export async function returningUsers(q: ReturningQuery): Promise<{ rows: ReturningRow[]; total: number }> {
  const since = utcDay(q.windowDays - 1);
  const s = q.search?.trim();
  const searchSql = s
    ? Prisma.sql`AND (u.name ILIKE ${"%" + s + "%"} OR u.email ILIKE ${"%" + s + "%"} OR u.username ILIKE ${"%" + s + "%"})`
    : Prisma.empty;
  const order =
    q.sort === "streak"
      ? Prisma.sql`streak DESC, days DESC`
      : q.sort === "recent"
        ? Prisma.sql`"lastDay" DESC, days DESC`
        : Prisma.sql`days DESC, streak DESC`;
  const base = Prisma.sql`
    WITH ${streaks()},
    win AS (
      SELECT a."userId", COUNT(*)::int AS days, MAX(a.date) AS "lastDay",
             COUNT(*) FILTER (WHERE a.date > (u."createdAt" AT TIME ZONE 'UTC')::date)::int AS later
      FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
      WHERE a.date >= ${since} AND u.role = 'USER' ${searchSql}
      GROUP BY a."userId"
    ),
    res AS (
      SELECT w."userId", w.days, w."lastDay", COALESCE(s.streak, 0) AS streak
      FROM win w LEFT JOIN streak s ON s."userId" = w."userId"
      WHERE w.later > 0 AND COALESCE(s.streak, 0) >= ${q.minStreak}
    )`;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<ReturningRow[]>`${base} SELECT * FROM res ORDER BY ${order} LIMIT ${q.take} OFFSET ${q.skip}`,
    prisma.$queryRaw<Array<{ n: number }>>`${base} SELECT COUNT(*)::int AS n FROM res`,
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

export type ReturningStats = {
  activeToday: number;
  returningToday: number;
  /** Returning users in the last 7 / 30 days. */
  returning7: number;
  returning30: number;
  /** Current streak of 7+ days — came every day for the last week. */
  daily7: number;
  /** Came on 4 or more of the last 7 days. */
  regular7: number;
};

export async function returningStats(): Promise<ReturningStats> {
  const [r] = await prisma.$queryRaw<ReturningStats[]>`
    WITH ${streaks()},
    a AS (
      SELECT a."userId", a.date, a.date > (u."createdAt" AT TIME ZONE 'UTC')::date AS later
      FROM "UserActiveDay" a JOIN "User" u ON u.id = a."userId"
      WHERE a.date >= ${utcDay(29)} AND u.role = 'USER'
    ),
    w7 AS (SELECT "userId", COUNT(*) AS n FROM a WHERE date >= ${utcDay(6)} GROUP BY "userId")
    SELECT
      (SELECT COUNT(*)::int FROM a WHERE date = ${utcDay(0)}) AS "activeToday",
      (SELECT COUNT(*)::int FROM a WHERE date = ${utcDay(0)} AND later) AS "returningToday",
      (SELECT COUNT(DISTINCT "userId")::int FROM a WHERE date >= ${utcDay(6)} AND later) AS "returning7",
      (SELECT COUNT(DISTINCT "userId")::int FROM a WHERE later) AS "returning30",
      (SELECT COUNT(*)::int FROM streak s JOIN "User" u ON u.id = s."userId" WHERE s.streak >= 7 AND u.role = 'USER') AS "daily7",
      (SELECT COUNT(*)::int FROM w7 WHERE n >= 4) AS "regular7"`;
  return r;
}

/** The active days of these users since `since`, as YYYY-MM-DD sets. */
export async function activeDaysOf(userIds: string[], since: Date): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!userIds.length) return out;
  const rows = await prisma.userActiveDay.findMany({
    where: { userId: { in: userIds }, date: { gte: since } },
    select: { userId: true, date: true },
  });
  for (const r of rows) {
    if (!out.has(r.userId)) out.set(r.userId, new Set());
    out.get(r.userId)!.add(r.date.toISOString().slice(0, 10));
  }
  return out;
}
