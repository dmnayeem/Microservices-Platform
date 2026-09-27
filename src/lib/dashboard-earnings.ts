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
