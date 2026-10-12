import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/**
 * Third-party platform income — what Google AdSense, Adsterra, Monetag, Amazon
 * Affiliates… pay the company. Only their own dashboards know it, so a finance
 * admin types it in, one figure per platform per day (USD), plus the month's
 * actual payout once it arrives.
 *
 * ── The rules this file exists to keep ──
 *
 *  1. ONE figure per platform per day (`@@unique([platformId, date])`). Saving
 *     a day again replaces it; nothing here ever adds to an existing day.
 *  2. Voided rows count for nothing, anywhere.
 *  3. A month with a recorded payout totals EXACTLY the payout. The difference
 *     between the payout and that month's daily figures is a "month-end
 *     adjustment", dated on the month's last day — so daily charts keep the
 *     daily figures and any range containing the whole month gets the paid
 *     amount.
 *  4. Days are DATES (no time, no timezone). A range given as timestamps is
 *     reduced to the UTC days it touches, so "today" can never drop today's
 *     row because the range started at 09:00.
 *  5. The platform's OWN income (ads, marketplace, courses…) is measured by
 *     lib/finance/revenue.ts and never entered here — see the type guard in
 *     the API, which refuses a platform named like one of those streams.
 *
 * Every report — Finance hub, P&L, the dashboard, Ad Manager eCPM — reads its
 * third-party figure from `thirdPartyIncome` below, so they cannot disagree.
 */

export interface DayRange {
  from?: Date;
  to?: Date;
}

/** `YYYY-MM-DD` → that UTC day at 00:00, or null. */
export function parseDay(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The UTC day a timestamp falls on. */
export function floorDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `YYYY-MM` → its first and last day. */
export function periodDays(period: string): { first: Date; last: Date } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
  const [y, m] = period.split("-").map(Number);
  return { first: new Date(Date.UTC(y, m - 1, 1)), last: new Date(Date.UTC(y, m, 0)) };
}

export const periodOf = (d: Date) => d.toISOString().slice(0, 7);

/** The date filter for entry rows, on whole days. */
function dayWhere(r: DayRange) {
  if (!r.from && !r.to) return undefined;
  return {
    ...(r.from ? { gte: floorDay(r.from) } : {}),
    ...(r.to ? { lte: floorDay(r.to) } : {}),
  };
}

function inRange(day: Date, r: DayRange): boolean {
  if (r.from && day < floorDay(r.from)) return false;
  if (r.to && day > floorDay(r.to)) return false;
  return true;
}

export interface PlatformIncomeLine {
  id: string;
  name: string;
  type: string;
  color: string | null;
  networkKey: string | null;
  isActive: boolean;
  /** Σ daily figures in the range. */
  estimatedUsd: number;
  /** Σ month-end adjustments whose month ends in the range. */
  adjustmentUsd: number;
  /** estimated + adjustment — what this platform contributes to revenue. */
  usd: number;
  /** Days with a figure in the range. */
  days: number;
}

export interface ThirdPartyIncome {
  usd: number;
  estimatedUsd: number;
  adjustmentUsd: number;
  entryCount: number;
  platforms: PlatformIncomeLine[];
}

/**
 * Month-end adjustments for the payouts whose month ends inside the range:
 * payout − Σ that whole month's active daily figures, per platform.
 */
async function adjustments(range: DayRange): Promise<
  { platformId: string; period: string; last: Date; actualUsd: number; estimatedUsd: number; adjustmentUsd: number }[]
> {
  const payouts = await prisma.platformPayout.findMany({
    select: { platformId: true, period: true, actualUsd: true },
  });
  const relevant = payouts
    .map((p) => ({ ...p, days: periodDays(p.period) }))
    .filter((p): p is typeof p & { days: { first: Date; last: Date } } => !!p.days && inRange(p.days.last, range));
  if (relevant.length === 0) return [];
  const out = [];
  for (const p of relevant) {
    const agg = await prisma.platformIncomeEntry.aggregate({
      where: { platformId: p.platformId, status: "ACTIVE", date: { gte: p.days.first, lte: p.days.last } },
      _sum: { amountUsd: true },
    });
    const estimatedUsd = toNum(agg._sum.amountUsd as never);
    const actualUsd = toNum(p.actualUsd as never);
    out.push({
      platformId: p.platformId,
      period: p.period,
      last: p.days.last,
      actualUsd,
      estimatedUsd,
      adjustmentUsd: actualUsd - estimatedUsd,
    });
  }
  return out;
}

/** Third-party income over a range (open range = lifetime). */
export async function thirdPartyIncome(range: DayRange = {}): Promise<ThirdPartyIncome> {
  const [platforms, sums, adj] = await Promise.all([
    prisma.incomePlatform.findMany({ orderBy: { name: "asc" } }),
    prisma.platformIncomeEntry.groupBy({
      by: ["platformId"],
      where: { status: "ACTIVE", ...(dayWhere(range) ? { date: dayWhere(range) } : {}) },
      _sum: { amountUsd: true },
      _count: { _all: true },
    }) as unknown as Promise<{ platformId: string; _sum: { amountUsd: unknown }; _count: { _all: number } }[]>,
    adjustments(range),
  ]);
  const sumBy = new Map(sums.map((s) => [s.platformId, s]));
  const lines: PlatformIncomeLine[] = platforms.map((p) => {
    const s = sumBy.get(p.id);
    const estimatedUsd = s ? toNum(s._sum.amountUsd as never) : 0;
    const adjustmentUsd = adj.filter((a) => a.platformId === p.id).reduce((n, a) => n + a.adjustmentUsd, 0);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      color: p.color,
      networkKey: p.networkKey,
      isActive: p.isActive,
      estimatedUsd,
      adjustmentUsd,
      usd: estimatedUsd + adjustmentUsd,
      days: s?._count._all ?? 0,
    };
  });
  const estimatedUsd = lines.reduce((n, l) => n + l.estimatedUsd, 0);
  const adjustmentUsd = lines.reduce((n, l) => n + l.adjustmentUsd, 0);
  return {
    usd: estimatedUsd + adjustmentUsd,
    estimatedUsd,
    adjustmentUsd,
    entryCount: lines.reduce((n, l) => n + l.days, 0),
    platforms: lines,
  };
}

/**
 * Per-day third-party totals for a closed range (adjustments land on their
 * month's last day), plus which days have NO figure for an active platform —
 * the report shows those, so "income was low" and "nobody typed it in" look
 * different.
 */
export async function thirdPartyDaily(from: Date, to: Date): Promise<{
  days: { date: string; usd: number; byPlatform: Record<string, number> }[];
  missing: { date: string; platforms: string[] }[];
}> {
  const f = floorDay(from);
  const t = floorDay(to);
  const [rows, adj, platforms] = await Promise.all([
    prisma.platformIncomeEntry.findMany({
      where: { status: "ACTIVE", date: { gte: f, lte: t } },
      select: { platformId: true, date: true, amountUsd: true },
    }),
    adjustments({ from: f, to: t }),
    prisma.incomePlatform.findMany({ select: { id: true, name: true, isActive: true, createdAt: true } }),
  ]);
  const byDay = new Map<string, { usd: number; byPlatform: Record<string, number> }>();
  const bump = (d: string, pid: string, usd: number) => {
    const cur = byDay.get(d) ?? { usd: 0, byPlatform: {} };
    cur.usd += usd;
    cur.byPlatform[pid] = (cur.byPlatform[pid] ?? 0) + usd;
    byDay.set(d, cur);
  };
  const have = new Set<string>();
  for (const r of rows) {
    bump(dayKey(r.date), r.platformId, toNum(r.amountUsd as never));
    have.add(`${r.platformId}:${dayKey(r.date)}`);
  }
  for (const a of adj) bump(dayKey(a.last), a.platformId, a.adjustmentUsd);

  const days: { date: string; usd: number; byPlatform: Record<string, number> }[] = [];
  const missing: { date: string; platforms: string[] }[] = [];
  const today = floorDay(new Date());
  for (let d = new Date(f); d <= t; d = new Date(d.getTime() + 86_400_000)) {
    const k = dayKey(d);
    const v = byDay.get(k) ?? { usd: 0, byPlatform: {} };
    days.push({ date: k, ...v });
    // Only active platforms, only days since they were added, never the future.
    if (d <= today) {
      const gaps = platforms
        .filter((p) => p.isActive && floorDay(p.createdAt) <= d && !have.has(`${p.id}:${k}`))
        .map((p) => p.name);
      if (gaps.length) missing.push({ date: k, platforms: gaps });
    }
  }
  return { days, missing };
}

/** Month-end status for one month: per platform, the daily total vs the payout. */
export async function monthEnd(period: string) {
  const days = periodDays(period);
  if (!days) return null;
  const [platforms, sums, payouts] = await Promise.all([
    prisma.incomePlatform.findMany({ orderBy: { name: "asc" } }),
    prisma.platformIncomeEntry.groupBy({
      by: ["platformId"],
      where: { status: "ACTIVE", date: { gte: days.first, lte: days.last } },
      _sum: { amountUsd: true },
      _count: { _all: true },
    }) as unknown as Promise<{ platformId: string; _sum: { amountUsd: unknown }; _count: { _all: number } }[]>,
    prisma.platformPayout.findMany({ where: { period } }),
  ]);
  return platforms
    .map((p) => {
      const s = sums.find((x) => x.platformId === p.id);
      const pay = payouts.find((x) => x.platformId === p.id);
      const estimatedUsd = s ? toNum(s._sum.amountUsd as never) : 0;
      const actualUsd = pay ? toNum(pay.actualUsd as never) : null;
      return {
        platformId: p.id,
        name: p.name,
        isActive: p.isActive,
        days: s?._count._all ?? 0,
        estimatedUsd,
        actualUsd,
        adjustmentUsd: actualUsd === null ? null : actualUsd - estimatedUsd,
        receivedAt: pay?.receivedAt?.toISOString() ?? null,
        reference: pay?.reference ?? null,
        note: pay?.note ?? null,
      };
    })
    .filter((r) => r.isActive || r.days > 0 || r.actualUsd !== null);
}

/**
 * Income per ad-network registry id, for Ad Manager's eCPM — through the
 * platform's `networkKey` link, with the same month-end rule.
 */
export async function incomeByNetworkKey(range: DayRange): Promise<Map<string, number>> {
  const t = await thirdPartyIncome(range);
  const m = new Map<string, number>();
  for (const p of t.platforms) if (p.networkKey && p.usd !== 0) m.set(p.networkKey, p.usd);
  return m;
}
