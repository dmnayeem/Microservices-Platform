import "server-only";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";
import { getPointsPerUsd } from "@/lib/economy";
import { SOURCE_META, SOURCE_ORDER, type SourceKey } from "@/lib/tx-sources";
import {
  amountIsUserValue,
  direction,
  isSettled,
  magnitudePoints,
  magnitudeUsd,
  sourceOf,
  type LedgerRow,
} from "./signing";

/**
 * Ledger aggregation — by day and by source.
 *
 * Reads `Transaction` directly with no rollup table. That is a deliberate
 * choice, not an omission: the live ledger holds 142 rows, and a
 * `TransactionDailyStat` at that size would be ceremony that still has to be
 * kept correct. The `(type, createdAt)` index added alongside this is what makes
 * the per-source grouping cheap, and a rollup can be introduced later without
 * changing a single caller.
 *
 * Days are **UTC**, matching the ad reports, and the console says so — a reader
 * in UTC+6 is otherwise looking at a day that closed at six in the morning.
 */

export interface DayPoint {
  date: string;
  revenue: number;
  cost: number;
  net: number;
}

export interface SourceTotals {
  key: SourceKey;
  label: string;
  color: string;
  /** Money the platform received on rows in this bucket. */
  revenueUsd: number;
  /** Money the platform paid out. */
  costUsd: number;
  netUsd: number;
  /** Movement that is neither — user-to-user, or the same money changing unit. */
  internalUsd: number;
  points: number;
  count: number;
}

interface Range {
  from?: Date;
  to?: Date;
}

/** Tailwind swatch class → a hex the chart can actually use. */
const SWATCH_HEX: Record<string, string> = {
  "bg-indigo-500": "#6366f1",
  "bg-rose-500": "#f43f5e",
  "bg-purple-500": "#a855f7",
  "bg-fuchsia-500": "#d946ef",
  "bg-sky-500": "#0ea5e9",
  "bg-orange-500": "#f97316",
  "bg-emerald-500": "#10b981",
  "bg-red-500": "#ef4444",
  "bg-cyan-500": "#06b6d4",
  "bg-pink-500": "#ec4899",
  "bg-amber-500": "#f59e0b",
  "bg-teal-500": "#14b8a6",
  "bg-violet-500": "#8b5cf6",
  "bg-green-500": "#22c55e",
  "bg-slate-500": "#64748b",
  "bg-gray-500": "#6b7280",
};

export function sourceColor(key: SourceKey): string {
  return SWATCH_HEX[SOURCE_META[key]?.swatch ?? ""] ?? "#64748b";
}

interface LoadedRow extends LedgerRow {
  createdAt: Date;
}

/**
 * Every settled ledger row in the window.
 *
 * `PENDING` withdrawals are deliberately excluded here — that money has left
 * wallets but has not been paid out, and it is reported as an obligation
 * (`getObligations`) rather than as settled movement. Counting it in both places
 * would double it.
 */
async function loadRows(range: Range): Promise<LoadedRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      status: TransactionStatus.COMPLETED,
      ...(range.from || range.to
        ? { createdAt: { gte: range.from, lte: range.to } }
        : {}),
    },
    select: {
      type: true,
      status: true,
      reference: true,
      amount: true,
      points: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    // A hard ceiling so one enormous window cannot blow the payload limit
    // (Accelerate's P6009 is non-retryable). Far above the live 142 rows; when
    // it is ever hit, that is the signal to build the rollup.
    take: 50_000,
  });
  return rows.map((r) => ({
    type: r.type,
    status: r.status,
    reference: r.reference,
    amount: toNum(r.amount),
    points: r.points,
    createdAt: r.createdAt,
  }));
}

/**
 * The USD the platform actually moved on a row.
 *
 * Offerwall rows store the NETWORK's payout in `amount` while `points` holds
 * what the user received, so using `amount` there would report the platform's
 * income as its cost. For those, the user's point value is the real figure.
 */
function platformUsd(row: LedgerRow, pointsPerUsd: number): number {
  if (amountIsUserValue(row)) return magnitudeUsd(row);
  return magnitudePoints(row) / pointsPerUsd;
}

export async function getLedgerTotals(range: Range = {}): Promise<{
  sources: SourceTotals[];
  revenueUsd: number;
  costUsd: number;
  netUsd: number;
  rows: number;
}> {
  const [rows, pointsPerUsd] = await Promise.all([
    loadRows(range),
    getPointsPerUsd(),
  ]);

  const byKey = new Map<SourceKey, SourceTotals>();
  for (const key of SOURCE_ORDER) {
    byKey.set(key, {
      key,
      label: SOURCE_META[key].label,
      color: sourceColor(key),
      revenueUsd: 0,
      costUsd: 0,
      netUsd: 0,
      internalUsd: 0,
      points: 0,
      count: 0,
    });
  }

  for (const row of rows) {
    if (!isSettled(row)) continue;
    const bucket = byKey.get(sourceOf(row));
    if (!bucket) continue;
    const usd = platformUsd(row, pointsPerUsd);
    const d = direction(row);
    if (d === "revenue") bucket.revenueUsd += usd;
    else if (d === "cost") bucket.costUsd += usd;
    else bucket.internalUsd += usd;
    bucket.points += magnitudePoints(row);
    bucket.count += 1;
  }

  const sources = [...byKey.values()]
    .map((s) => ({ ...s, netUsd: s.revenueUsd - s.costUsd }))
    // Empty buckets are dropped rather than shown as rows of zeros — a table of
    // eighteen $0.00 lines buries the two that matter.
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    sources,
    revenueUsd: sources.reduce((s, x) => s + x.revenueUsd, 0),
    costUsd: sources.reduce((s, x) => s + x.costUsd, 0),
    netUsd: sources.reduce((s, x) => s + x.netUsd, 0),
    rows: rows.length,
  };
}

/** Zero-filled daily revenue / cost / net across the window. */
export async function getDailySeries(range: Range = {}): Promise<DayPoint[]> {
  const from = range.from ?? new Date(Date.now() - 29 * 86_400_000);
  const to = range.to ?? new Date();
  const [rows, pointsPerUsd] = await Promise.all([
    loadRows({ from, to }),
    getPointsPerUsd(),
  ]);

  const byDay = new Map<string, DayPoint>();
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  // Guard rail: a very wide range would otherwise build tens of thousands of
  // buckets that no chart can draw.
  for (let i = 0; cursor <= end && i < 800; i++) {
    const key = cursor.toISOString().slice(0, 10);
    byDay.set(key, { date: key, revenue: 0, cost: 0, net: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (!day) continue;
    const usd = platformUsd(row, pointsPerUsd);
    const d = direction(row);
    if (d === "revenue") day.revenue += usd;
    else if (d === "cost") day.cost += usd;
  }

  return [...byDay.values()].map((d) => ({ ...d, net: d.revenue - d.cost }));
}
