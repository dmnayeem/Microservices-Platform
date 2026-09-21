import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { direction, isSettled, magnitudePoints } from "@/lib/finance/signing";

/**
 * Today, and the periods around it.
 *
 * The finance dashboard already answers "how much money exists" and "what did
 * this range earn". What it could not answer was "what happened today" — and
 * that is the question an owner actually opens a dashboard to ask. Points
 * earned today, who came back, who arrived through a referral, who subscribed.
 *
 * POINTS EARNED IS NOT A SUM OF A COLUMN
 * --------------------------------------
 * `Transaction.points` is written with inconsistent signs across this codebase
 * — the same reason `amount` cannot be trusted — so `magnitudePoints` takes the
 * absolute value and `direction()` decides what the row MEANS. Points earned by
 * users are therefore the rows whose direction is `cost`: money the platform
 * paid out. A naive `_sum` of the column would add a withdrawal to an earning
 * and call the result income.
 *
 * The rows are loaded once and bucketed here rather than queried five times.
 * At this platform's volume that is a few hundred rows; five aggregate queries
 * that each have to re-derive direction per row would cost more and could
 * disagree with each other at a period boundary.
 *
 * DAYS ARE UTC
 * ------------
 * Same as the rest of this dashboard, and stated on the page. A "day" that
 * shifts with whoever is looking is a number two admins cannot discuss.
 */

export interface PeriodCounts {
  day: number;
  week: number;
  month: number;
  year: number;
  total: number;
}

export interface PeriodMoney extends PeriodCounts {
  dayUsd: number;
  weekUsd: number;
  monthUsd: number;
  yearUsd: number;
  totalUsd: number;
}

export interface FinancePulse {
  /** Points credited to users, by period, with the cash equivalent. */
  pointsEarned: PeriodMoney;
  /** Signups, by period. */
  signups: PeriodCounts;
  /**
   * Accounts that logged in during the period on a LATER DAY than they signed
   * up — people who came back, as opposed to people who just arrived.
   *
   * The obvious definition, "logged in during the window but registered before
   * it", does not nest: widen the window and more accounts fall inside it as
   * signups, so the year can report FEWER returning users than the month. It
   * did, on live data — 2 for the year against 5 for the month — and a
   * dashboard that prints that is one nobody can trust again. This definition
   * grows with the window, because coming back is a property of the account,
   * not of where the window happens to start.
   */
  returning: PeriodCounts;
  /** Signups that carry a referrer, by period. */
  referred: PeriodCounts;
  /** Subscriptions started in the period, and what they were worth. */
  subscriptions: PeriodMoney;
  /** Subscriptions that have not expired and were not cancelled. */
  activeSubscribers: number;
  /** Distinct accounts that have ever subscribed. */
  everSubscribed: number;
  pointsPerUsd: number;
}

/** Midnight UTC, `daysBack` days ago. */
function utcDaysAgo(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

/** First moment of the current UTC month. */
function utcMonthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First moment of the current UTC year. */
function utcYearStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
}

const zeroCounts: PeriodCounts = { day: 0, week: 0, month: 0, year: 0, total: 0 };
const zeroMoney: PeriodMoney = {
  ...zeroCounts,
  dayUsd: 0,
  weekUsd: 0,
  monthUsd: 0,
  yearUsd: 0,
  totalUsd: 0,
};

export async function getFinancePulse(): Promise<FinancePulse> {
  const dayStart = utcDaysAgo(0);
  // Seven days INCLUDING today, not "today minus seven" — otherwise the week
  // silently covers eight days and never matches a hand count.
  const weekStart = utcDaysAgo(6);
  const monthStart = utcMonthStart();
  const yearStart = utcYearStart();

  try {
    const pointsPerUsd = await getPointsPerUsd();

    /* One pass over the ledger since the start of the year. Everything the
       four periods need is in there, and a single snapshot cannot disagree
       with itself the way five separate queries can when a row lands between
       two of them. */
    const ledger = await prisma.transaction.findMany({
      where: { createdAt: { gte: yearStart } },
      select: {
        type: true,
        status: true,
        reference: true,
        amount: true,
        points: true,
        createdAt: true,
      },
    });

    const earned = { day: 0, week: 0, month: 0, year: 0 };
    for (const row of ledger) {
      // `amount` is a Prisma Decimal; the signing helpers take plain numbers.
      // Narrowed here, once, rather than at each call site.
      const r = {
        type: row.type,
        status: row.status,
        reference: row.reference,
        amount: Number(row.amount ?? 0),
        points: row.points ?? 0,
      };
      if (!isSettled(r)) continue;
      // A user earning is money the platform paid out.
      if (direction(r) !== "cost") continue;
      const pts = magnitudePoints(r);
      if (pts === 0) continue;
      const at = row.createdAt;
      earned.year += pts;
      if (at >= monthStart) earned.month += pts;
      if (at >= weekStart) earned.week += pts;
      if (at >= dayStart) earned.day += pts;
    }

    const signupsIn = (from?: Date) =>
      prisma.user.count({
        where: from ? { createdAt: { gte: from } } : {},
      });

    const referredIn = (from?: Date) =>
      prisma.user.count({
        where: {
          referredById: { not: null },
          ...(from ? { createdAt: { gte: from } } : {}),
        },
      });

    const subsIn = (from?: Date) =>
      prisma.subscription.aggregate({
        _count: { _all: true },
        _sum: { amount: true },
        where: from ? { startDate: { gte: from } } : {},
      });

    const [
      sDay,
      sWeek,
      sMonth,
      sYear,
      sAll,
      refDay,
      refWeek,
      refMonth,
      refYear,
      refAll,
      subDay,
      subWeek,
      subMonth,
      subYear,
      subAll,
      activeSubscribers,
      everSubscribed,
    ] = await Promise.all([
      signupsIn(dayStart),
      signupsIn(weekStart),
      signupsIn(monthStart),
      signupsIn(yearStart),
      signupsIn(),
      referredIn(dayStart),
      referredIn(weekStart),
      referredIn(monthStart),
      referredIn(yearStart),
      referredIn(),
      subsIn(dayStart),
      subsIn(weekStart),
      subsIn(monthStart),
      subsIn(yearStart),
      subsIn(),
      /* Active means paid-for time that has not run out. `isActive` alone
         would count a cancelled row whose flag was never cleared, and an
         endDate alone would count one the user cancelled yesterday. */
      prisma.subscription.count({
        where: { isActive: true, endDate: { gte: new Date() } },
      }),
      prisma.subscription
        .findMany({ select: { userId: true }, distinct: ["userId"] })
        .then((rows) => rows.length),
    ]);

    /* Returning, in one pass for the same reason the ledger is: four counts
       derived from one snapshot cannot contradict each other. Prisma cannot
       compare two columns of the same row, and at this platform's size the
       comparison is cheaper in memory than four queries would be anyway. */
    const seen = await prisma.user.findMany({
      where: { lastLoginAt: { not: null } },
      select: { createdAt: true, lastLoginAt: true },
    });
    const utcDay = (d: Date) =>
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const returning = { day: 0, week: 0, month: 0, year: 0, total: 0 };
    for (const u of seen) {
      const at = u.lastLoginAt;
      if (!at) continue;
      // Came back on a later DAY than they joined. Same-day logins are the
      // signup session, not a return.
      if (utcDay(at) <= utcDay(u.createdAt)) continue;
      returning.total += 1;
      if (at >= yearStart) returning.year += 1;
      if (at >= monthStart) returning.month += 1;
      if (at >= weekStart) returning.week += 1;
      if (at >= dayStart) returning.day += 1;
    }

    const num = (v: unknown) => Number(v ?? 0);

    /* `total` is deliberately the year, not all time: the pass above only
       loads this year's rows. All-time points already have a home on this
       page — the wallet balances — and that figure is the authoritative one. */
    const pointsEarned: PeriodMoney = {
      day: earned.day,
      week: earned.week,
      month: earned.month,
      year: earned.year,
      total: earned.year,
      dayUsd: earned.day / pointsPerUsd,
      weekUsd: earned.week / pointsPerUsd,
      monthUsd: earned.month / pointsPerUsd,
      yearUsd: earned.year / pointsPerUsd,
      totalUsd: earned.year / pointsPerUsd,
    };

    const subscriptions: PeriodMoney = {
      day: subDay._count._all,
      week: subWeek._count._all,
      month: subMonth._count._all,
      year: subYear._count._all,
      total: subAll._count._all,
      dayUsd: num(subDay._sum.amount),
      weekUsd: num(subWeek._sum.amount),
      monthUsd: num(subMonth._sum.amount),
      yearUsd: num(subYear._sum.amount),
      totalUsd: num(subAll._sum.amount),
    };

    return {
      pointsEarned,
      signups: { day: sDay, week: sWeek, month: sMonth, year: sYear, total: sAll },
      returning,
      referred: {
        day: refDay,
        week: refWeek,
        month: refMonth,
        year: refYear,
        total: refAll,
      },
      subscriptions,
      activeSubscribers,
      everSubscribed,
      pointsPerUsd,
    };
  } catch {
    /* A dashboard that throws is a dashboard nobody can use to find out what
       is wrong. Zeroes with a working page beat a stack trace. */
    return {
      pointsEarned: zeroMoney,
      signups: zeroCounts,
      returning: zeroCounts,
      referred: zeroCounts,
      subscriptions: zeroMoney,
      activeSubscribers: 0,
      everSubscribed: 0,
      pointsPerUsd: 1000,
    };
  }
}
