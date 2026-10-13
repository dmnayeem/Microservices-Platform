import { isPointsEarned, magnitudePoints } from "@/lib/finance/signing";
import { pointSourceOf, POINT_SOURCE_META, type PointSource } from "@/lib/finance/points-source";

/**
 * The user's own earnings, summarised from ONE read of their last 30 days of
 * ledger (the dashboard's single transaction query). Same rules as the admin
 * finance console — `isPointsEarned` / `magnitudePoints`, never the sign of
 * `amount` — so a user's "earned today" and the admin's agree.
 */

export interface LedgerRowIn {
  type: string;
  status: string | null;
  reference: string | null;
  amount: unknown;
  points: number | null;
  createdAt: Date;
}

export interface EarningsSummary {
  today: number;
  week: number;
  month: number;
  /** Last 7 UTC days, oldest first. */
  days: Array<{ date: string; label: string; points: number }>;
  /** Last 30 days, largest first. */
  sources: Array<{ source: PointSource; label: string; swatch: string; points: number }>;
  /** My Team commission + referral bonuses, last 30 days. */
  teamPoints: number;
}

// Labels as a user reads them — the admin names describe bookkeeping.
const USER_LABEL: Partial<Record<PointSource, string>> = {
  admin_grant: "Bonus",
  other: "Other",
  referral: "My Team",
  // The admin name reads as "paid to watch ads"; members are paid for work.
  browse: "Browsing bonus",
};

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function summarizeEarnings(rows: LedgerRowIn[], now = new Date()): EarningsSummary {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekStart = todayStart - 6 * DAY;
  const perDay = new Map<string, number>();
  const bySource = new Map<PointSource, number>();
  let today = 0;
  let week = 0;
  let month = 0;
  let teamPoints = 0;

  for (const row of rows) {
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
    const at = row.createdAt.getTime();
    month += pts;
    if (at >= weekStart) {
      week += pts;
      perDay.set(ymd(row.createdAt), (perDay.get(ymd(row.createdAt)) ?? 0) + pts);
    }
    if (at >= todayStart) today += pts;
    const src = pointSourceOf(r);
    bySource.set(src, (bySource.get(src) ?? 0) + pts);
    if (src === "referral" || src === "referral_bonus") teamPoints += pts;
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + i * DAY);
    const key = ymd(d);
    return {
      date: key,
      label: i === 6 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      points: perDay.get(key) ?? 0,
    };
  });

  const sources = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, points]) => ({
      source,
      label: USER_LABEL[source] ?? POINT_SOURCE_META[source].label,
      swatch: POINT_SOURCE_META[source].swatch,
      points,
    }));

  return { today, week, month, days, sources, teamPoints };
}

// ─────────────────────────────────────────────────────────────────────────────
// Earnings by source over a chosen range — the member's own breakdown
// (/api/me/earnings). Same rules as above: `isPointsEarned` decides what counts,
// `magnitudePoints` how much, `pointSourceOf` where it came from. Days are UTC,
// like every other day boundary on the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export type BreakdownRange = "today" | "7d" | "30d" | "custom";

/** The longest custom range the API will read in one go. */
export const MAX_RANGE_DAYS = 366;

export interface EarningsBreakdown {
  range: BreakdownRange;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  from: string;
  to: string;
  totalPoints: number;
  /** Ledger rows that counted as earnings. */
  totalRows: number;
  /** Largest first. `pct` is a share of `totalPoints`, 0–100. */
  sources: Array<{
    source: PointSource;
    label: string;
    swatch: string;
    points: number;
    count: number;
    pct: number;
  }>;
  /** Hourly for a one-day range, daily otherwise. Oldest first. */
  trend: Array<{ key: string; label: string; points: number }>;
  bucket: "hour" | "day";
  /** True when the row cap was hit and the oldest rows were not read. */
  truncated: boolean;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The UTC window for a range: `[start, end)`. `null` for a malformed or
 * oversized custom range — the caller answers 400 rather than guessing.
 */
export function resolveRange(
  range: string | null | undefined,
  fromStr: string | null | undefined,
  toStr: string | null | undefined,
  now = new Date()
): { range: BreakdownRange; start: Date; end: Date } | null {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = new Date(todayStart + DAY);
  switch (range ?? "30d") {
    case "today":
      return { range: "today", start: new Date(todayStart), end };
    case "7d":
      return { range: "7d", start: new Date(todayStart - 6 * DAY), end };
    case "30d":
      return { range: "30d", start: new Date(todayStart - 29 * DAY), end };
    case "custom": {
      if (!fromStr || !toStr || !YMD.test(fromStr) || !YMD.test(toStr)) return null;
      const s = Date.parse(`${fromStr}T00:00:00Z`);
      const e = Date.parse(`${toStr}T00:00:00Z`) + DAY;
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
      if ((e - s) / DAY > MAX_RANGE_DAYS) return null;
      return { range: "custom", start: new Date(s), end: new Date(e) };
    }
    default:
      return null;
  }
}

export function breakdownEarnings(
  rows: LedgerRowIn[],
  win: { range: BreakdownRange; start: Date; end: Date },
  truncated = false
): EarningsBreakdown {
  const startMs = win.start.getTime();
  const endMs = win.end.getTime();
  const bucket: "hour" | "day" = endMs - startMs <= DAY ? "hour" : "day";
  const step = bucket === "hour" ? 3_600_000 : DAY;
  const keyOf = (ms: number) => {
    const iso = new Date(ms).toISOString();
    return bucket === "hour" ? iso.slice(0, 13) : iso.slice(0, 10);
  };

  const perBucket = new Map<string, number>();
  const bySource = new Map<PointSource, { points: number; count: number }>();
  let totalPoints = 0;
  let totalRows = 0;

  for (const row of rows) {
    const at = row.createdAt.getTime();
    if (at < startMs || at >= endMs) continue;
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
    totalPoints += pts;
    totalRows += 1;
    const k = keyOf(at);
    perBucket.set(k, (perBucket.get(k) ?? 0) + pts);
    const src = pointSourceOf(r);
    const cur = bySource.get(src) ?? { points: 0, count: 0 };
    cur.points += pts;
    cur.count += 1;
    bySource.set(src, cur);
  }

  const trend: EarningsBreakdown["trend"] = [];
  for (let ms = startMs; ms < endMs; ms += step) {
    const d = new Date(ms);
    trend.push({
      key: keyOf(ms),
      label:
        bucket === "hour"
          ? `${String(d.getUTCHours()).padStart(2, "0")}:00`
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      points: perBucket.get(keyOf(ms)) ?? 0,
    });
  }

  const sources = [...bySource.entries()]
    .sort((a, b) => b[1].points - a[1].points)
    .map(([source, v]) => ({
      source,
      label: USER_LABEL[source] ?? POINT_SOURCE_META[source].label,
      swatch: POINT_SOURCE_META[source].swatch,
      points: v.points,
      count: v.count,
      pct: totalPoints ? Math.round((v.points / totalPoints) * 1000) / 10 : 0,
    }));

  return {
    range: win.range,
    from: ymd(win.start),
    to: ymd(new Date(endMs - DAY)),
    totalPoints,
    totalRows,
    sources,
    trend,
    bucket,
    truncated,
  };
}
