import "server-only";
import { prisma } from "@/lib/prisma";
import { adPaidLotteryIds, adPaidSpotlightIds, adWalletSpendRows } from "@/lib/finance/ad-spend";
import { toNum } from "@/lib/money";
import { getPointsPerUsd } from "@/lib/economy";
import { isNetworkAdType, utcDay } from "@/lib/ad-revenue";
import { getFinanceTestUserIds, withoutUsers } from "@/lib/finance/test-users";
import { thirdPartyDaily } from "@/lib/finance/platform-income";
import { getRevenueBreakdown } from "@/lib/finance/revenue";
import { getDailySeries, getLedgerTotals } from "@/lib/finance/series";

/**
 * Money in and out per day / week / month, and the running position.
 *
 * INFLOW is platform revenue — the same 14 own streams plus third-party income
 * that `getRevenueBreakdown` totals — but dated per row, so it can be bucketed.
 * `getRevenueBreakdown` only answers "how much in this window", and calling it
 * once per bucket would be ~20 queries per day of range. The rules below are a
 * line-for-line restatement of revenue.ts (same tables, same filters, same
 * test-user exclusions, same unit conversions); the console prints the sum of
 * the periods next to the headline revenue, so if the two ever drift the page
 * says so instead of quietly disagreeing. Change one, change both.
 *
 * OUTFLOW is the ledger's settled `cost` rows — exactly `getLedgerTotals()`'s
 * `costUsd` (member payouts plus wallet payroll, penalties netted), via
 * `getDailySeries`.
 *
 * Days are UTC, like the rest of the console.
 */

export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: Array<{ id: Granularity; label: string }> = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The bucket a UTC day falls in: the day, its Monday, or the 1st of its month. */
export function bucketStart(d: Date, g: Granularity): Date {
  const x = utcDay(d);
  if (g === "week") {
    const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(x.getTime() - dow * DAY);
  }
  if (g === "month") return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
  return x;
}

function nextBucket(d: Date, g: Granularity): Date {
  if (g === "week") return new Date(d.getTime() + 7 * DAY);
  if (g === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return new Date(d.getTime() + DAY);
}

/** A sensible default for a span: daily up to a month, weekly up to ~6 months. */
export function autoGranularity(from: Date, to: Date): Granularity {
  const days = Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY) + 1;
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

/** Daily over a very long span is unreadable and slow; coarsen it. */
function clampGranularity(from: Date, to: Date, g: Granularity): Granularity {
  const days = Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY) + 1;
  if (g === "day" && days > 400) return days > 1800 ? "month" : "week";
  if (g === "week" && days > 1800) return "month";
  return g;
}

/** The first day anything that counts as money was recorded — the all-time start. */
export async function earliestMoneyDate(): Promise<Date> {
  const [tx, ad, tp, sub] = await Promise.all([
    prisma.transaction.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.adDailyStat.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    prisma.platformIncomeEntry.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    prisma.subscription.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const dates = [tx?.createdAt, ad?.date, tp?.date, sub?.createdAt].filter((d): d is Date => !!d);
  return utcDay(dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date());
}

/**
 * Platform revenue per UTC day over [from, to] — see the module note: these are
 * revenue.ts's rules, dated.
 */
export async function getRevenueByDay(from: Date, to: Date): Promise<Map<string, number>> {
  const [pointsPerUsd, testIds, pendingSubRefs] = await Promise.all([
    getPointsPerUsd(),
    getFinanceTestUserIds(),
    prisma.transaction.findMany({
      where: { status: "PENDING", reference: { startsWith: "subscription_" } },
      select: { reference: true },
      take: 5000,
    }),
  ]);
  const pendingSubIds = pendingSubRefs
    .map((t) => t.reference?.slice("subscription_".length) ?? "")
    .filter((id) => id && !id.startsWith("from_"));
  const x = <W extends object>(w: NoInfer<W>, fields: string | string[] = "userId", nullable = false): W =>
    withoutUsers<W>(w, testIds, fields, { nullable });
  const created = { gte: from, lte: to };
  // Same de-duplication as revenue.ts: spotlight wins / lottery tickets paid
  // from Ad Points or Ad Fund are in the ad-spend rows, not the legacy streams.
  const [spotWinners, settledLotteries, adSpend] = await Promise.all([
    prisma.spotlightAuction.findMany({
      where: { status: "AWARDED", awardedAt: created },
      select: { id: true, winnerUserId: true, winnerBid: true },
    }),
    prisma.lotterySettlement.findMany({ where: { settledAt: created }, select: { lotteryId: true } }),
    adWalletSpendRows({ from, to }, testIds),
  ]);
  const [adSpot, adLottery] = await Promise.all([
    adPaidSpotlightIds(spotWinners),
    adPaidLotteryIds(settledLotteries.map((l) => l.lotteryId)),
  ]);
  const ledger = (where: Record<string, unknown>) =>
    prisma.transaction.findMany({
      where: x({ type: "PURCHASE", status: "COMPLETED", createdAt: created, ...where } as never),
      select: { createdAt: true, amount: true, points: true },
      take: 50_000,
    }) as unknown as Promise<Array<{ createdAt: Date; amount: unknown; points: number | null }>>;

  const [
    marketplace,
    mediation,
    withdrawals,
    lottery,
    offerwall,
    courses,
    ads,
    subs,
    taskFees,
    badges,
    renewals,
    boosts,
    promos,
    spotlight,
    rentals,
    third,
  ] = (await Promise.all([
    prisma.marketplacePurchase.findMany({
      where: x({ createdAt: created }, ["buyerId", "listing.sellerId"]),
      select: { createdAt: true, fee: true },
    }),
    prisma.marketplaceDeal.findMany({
      where: x({ createdAt: created }, ["buyerId", "sellerId"]),
      select: { createdAt: true, adminFee: true },
    }),
    prisma.withdrawal.findMany({
      where: x({ status: "COMPLETED", createdAt: created }),
      select: { createdAt: true, fee: true },
    }),
    prisma.lotterySettlement.findMany({
      where: { settledAt: created, ...(adLottery.size ? { lotteryId: { notIn: [...adLottery] } } : {}) },
      select: { settledAt: true, houseCutPoints: true, overflowToHouse: true },
    }),
    prisma.offerwallCallback.findMany({
      where: x({ status: "APPROVED", createdAt: created }),
      select: { createdAt: true, payoutAmount: true, userPayout: true },
    }),
    prisma.courseEnrollment.findMany({
      where: x(x({ createdAt: created }), "course.tutorId", true),
      select: { createdAt: true, platformFeeUsd: true },
    }),
    prisma.adDailyStat.findMany({
      where: { date: { gte: utcDay(from), lte: utcDay(to) } },
      select: {
        date: true,
        spendUsd: true,
        ad: { select: { type: true, campaign: { select: { isHouse: true, advertiserId: true } } } },
      },
    }),
    prisma.subscription.findMany({
      where: x({
        OR: [{ isActive: true }, { endDate: { lt: new Date() } }],
        ...(pendingSubIds.length ? { id: { notIn: pendingSubIds } } : {}),
        createdAt: created,
      }),
      select: { createdAt: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: x({ type: "ADMIN_FEE", status: "COMPLETED", reference: { startsWith: "task_fee_" }, createdAt: created }),
      select: { createdAt: true, points: true },
    }),
    ledger({ reference: { startsWith: "badge_" } }),
    ledger({ reference: { startsWith: "sub_renew_" } }),
    ledger({ reference: { startsWith: "boost_" } }),
    ledger({ OR: [{ reference: { startsWith: "promo_course_" } }, { reference: { startsWith: "promo_marketplace_" } }] }),
    prisma.spotlightAuction.findMany({
      where: x(
        { status: "AWARDED", awardedAt: created, ...(adSpot.size ? { id: { notIn: [...adSpot] } } : {}) },
        "winnerUserId",
        true
      ),
      select: { awardedAt: true, winnerBid: true },
    }),
    prisma.adSlotBooking.findMany({
      where: x({ status: { in: ["ACTIVE", "ENDED"] }, advertiserId: { not: null }, startAt: created }, "advertiserId", true),
      select: { startAt: true, priceUsd: true },
    }),
    thirdPartyDaily(from, to).catch(() => null),
  ])) as unknown as [
    Array<{ createdAt: Date; fee: unknown }>,
    Array<{ createdAt: Date; adminFee: unknown }>,
    Array<{ createdAt: Date; fee: unknown }>,
    Array<{ settledAt: Date; houseCutPoints: number | null; overflowToHouse: number | null }>,
    Array<{ createdAt: Date; payoutAmount: unknown; userPayout: number | null }>,
    Array<{ createdAt: Date; platformFeeUsd: unknown }>,
    Array<{
      date: Date;
      spendUsd: unknown;
      ad: { type: string; campaign: { isHouse: boolean; advertiserId: string | null } | null } | null;
    }>,
    Array<{ createdAt: Date; amount: unknown }>,
    Array<{ createdAt: Date; points: number | null }>,
    Array<{ createdAt: Date; amount: unknown; points: number | null }>,
    Array<{ createdAt: Date; amount: unknown; points: number | null }>,
    Array<{ createdAt: Date; amount: unknown; points: number | null }>,
    Array<{ createdAt: Date; amount: unknown; points: number | null }>,
    Array<{ awardedAt: Date | null; winnerBid: number | null }>,
    Array<{ startAt: Date; priceUsd: unknown }>,
    Awaited<ReturnType<typeof thirdPartyDaily>> | null,
  ];

  const out = new Map<string, number>();
  const add = (d: Date | null | undefined, usd: number) => {
    if (!d || !Number.isFinite(usd) || usd === 0) return;
    const k = dayKey(d);
    out.set(k, (out.get(k) ?? 0) + usd);
  };
  const n = (v: unknown) => toNum(v as never);
  const skipAdvertiser = new Set(testIds);

  for (const r of marketplace) add(r.createdAt, n(r.fee));
  for (const r of mediation) add(r.createdAt, n(r.adminFee));
  for (const r of withdrawals) add(r.createdAt, n(r.fee));
  for (const r of lottery) add(r.settledAt, ((r.houseCutPoints ?? 0) + (r.overflowToHouse ?? 0)) / pointsPerUsd);
  for (const r of offerwall) add(r.createdAt, n(r.payoutAmount) - (r.userPayout ?? 0) / pointsPerUsd);
  for (const r of courses) add(r.createdAt, n(r.platformFeeUsd));
  for (const r of ads) {
    const adv = r.ad?.campaign?.advertiserId;
    if (adv && skipAdvertiser.has(adv)) continue;
    if (r.ad?.campaign?.isHouse || isNetworkAdType(r.ad?.type)) continue;
    add(r.date, n(r.spendUsd));
  }
  for (const r of subs) add(r.createdAt, n(r.amount));
  for (const r of taskFees) add(r.createdAt, Math.abs(r.points ?? 0) / pointsPerUsd);
  for (const r of badges) add(r.createdAt, Math.abs(n(r.amount)) + Math.abs(r.points ?? 0) / pointsPerUsd);
  for (const r of renewals) add(r.createdAt, Math.abs(n(r.amount)));
  // Boost `amount` is the points' USD mirror, not a second charge — points only.
  for (const r of boosts) add(r.createdAt, Math.abs(r.points ?? 0) / pointsPerUsd);
  for (const r of promos) add(r.createdAt, Math.abs(n(r.amount)) + Math.abs(r.points ?? 0) / pointsPerUsd);
  for (const r of spotlight) add(r.awardedAt, Math.abs(r.winnerBid ?? 0) / pointsPerUsd);
  for (const r of rentals) add(r.startAt, n(r.priceUsd));
  // Ad Points / Ad Fund platform spending (refunds negative).
  for (const r of adSpend) add(r.createdAt, r.usd);
  if (third) for (const d of third.days) add(new Date(`${d.date}T00:00:00.000Z`), d.usd);
  return out;
}

export interface FlowPeriod {
  /** First UTC day of the bucket, `YYYY-MM-DD`. */
  key: string;
  label: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  /** Operating position at the start / end of the bucket. */
  openingUsd: number;
  closingUsd: number;
}

export interface Flows {
  granularity: Granularity;
  from: string;
  to: string;
  periods: FlowPeriod[];
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  openingUsd: number;
  closingUsd: number;
}

function labelOf(start: Date, g: Granularity): string {
  if (g === "month") return start.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const s = start.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return g === "week" ? `Wk of ${s}` : s;
}

/**
 * Inflow / outflow / net per bucket, with the operating position carried
 * forward: opening = everything earned minus everything paid out before
 * `from` (all of the ledger and revenue streams, same rules), closing =
 * opening + inflow − outflow.
 */
export async function getFlows(opts: { from: Date; to: Date; granularity: Granularity }): Promise<Flows> {
  const from = utcDay(opts.from);
  const to = opts.to;
  const granularity = clampGranularity(from, to, opts.granularity);
  const before = new Date(from.getTime() - 1);

  const [revByDay, costSeries, openRev, openCost] = await Promise.all([
    getRevenueByDay(from, to),
    getDailySeries({ from, to }),
    getRevenueBreakdown({ to: before }).catch(() => null),
    getLedgerTotals({ to: before }).catch(() => null),
  ]);
  const openingUsd = (openRev?.totalUsd ?? 0) - (openCost?.costUsd ?? 0);

  const buckets: FlowPeriod[] = [];
  const index = new Map<string, FlowPeriod>();
  const last = utcDay(to);
  for (let b = bucketStart(from, granularity), i = 0; b <= last && i < 2000; b = nextBucket(b, granularity), i++) {
    const p: FlowPeriod = { key: dayKey(b), label: labelOf(b, granularity), inflowUsd: 0, outflowUsd: 0, netUsd: 0, openingUsd: 0, closingUsd: 0 };
    buckets.push(p);
    index.set(p.key, p);
  }
  const bucketFor = (day: string) => {
    const k = dayKey(bucketStart(new Date(`${day}T00:00:00.000Z`), granularity));
    // Anything dated after the last bucket (e.g. a month-end adjustment) lands
    // in the last one rather than vanishing from the totals.
    return index.get(k) ?? (day > (buckets[buckets.length - 1]?.key ?? "") ? buckets[buckets.length - 1] : undefined);
  };
  for (const [day, usd] of revByDay) {
    const p = bucketFor(day);
    if (p) p.inflowUsd += usd;
  }
  for (const d of costSeries) {
    const p = bucketFor(d.date);
    if (p) p.outflowUsd += d.cost;
  }

  let running = openingUsd;
  for (const p of buckets) {
    p.netUsd = p.inflowUsd - p.outflowUsd;
    p.openingUsd = running;
    running += p.netUsd;
    p.closingUsd = running;
  }
  const inflowUsd = buckets.reduce((s, p) => s + p.inflowUsd, 0);
  const outflowUsd = buckets.reduce((s, p) => s + p.outflowUsd, 0);
  return {
    granularity,
    from: dayKey(from),
    to: dayKey(to),
    periods: buckets,
    inflowUsd,
    outflowUsd,
    netUsd: inflowUsd - outflowUsd,
    openingUsd,
    closingUsd: running,
  };
}

/* ── Withdrawals ────────────────────────────────────────────────────────── */

export const WITHDRAWAL_STATUS_META: Record<string, { label: string; hint: string; color: string }> = {
  PENDING: { label: "Pending", hint: "requested, awaiting review", color: "#f59e0b" },
  PROCESSING: { label: "Processing", hint: "approved, payment being sent", color: "#0ea5e9" },
  COMPLETED: { label: "Paid", hint: "money sent", color: "#10b981" },
  REJECTED: { label: "Rejected", hint: "refused — refunded to the wallet", color: "#ef4444" },
  CANCELLED: { label: "Cancelled", hint: "withdrawn by the member — refunded", color: "#64748b" },
};

export interface WithdrawalSummary {
  byStatus: Array<{ status: string; count: number; amountUsd: number; netUsd: number; feeUsd: number }>;
  byMethod: Array<{
    method: string;
    count: number;
    amountUsd: number;
    paidCount: number;
    paidNetUsd: number;
    openCount: number;
    openUsd: number;
  }>;
  totalCount: number;
  totalAmountUsd: number;
}

/**
 * Withdrawals REQUESTED in the window (by `createdAt`), by status and by
 * payment method. `amountUsd` is what left the wallet; `netUsd` what is sent
 * after the fee. Finance test users excluded.
 */
export async function getWithdrawalSummary(range: { from?: Date; to?: Date }): Promise<WithdrawalSummary> {
  const testIds = await getFinanceTestUserIds();
  const where = withoutUsers(
    range.from || range.to ? { createdAt: { gte: range.from, lte: range.to } } : {},
    testIds
  );
  const groups = (await prisma.withdrawal.groupBy({
    by: ["status", "method"],
    where,
    _sum: { amount: true, netAmount: true, fee: true },
    _count: { _all: true },
  })) as unknown as Array<{
    status: string;
    method: string;
    _sum: { amount: unknown; netAmount: unknown; fee: unknown };
    _count: { _all: number };
  }>;

  const st = new Map<string, WithdrawalSummary["byStatus"][number]>();
  const me = new Map<string, WithdrawalSummary["byMethod"][number]>();
  for (const s of Object.keys(WITHDRAWAL_STATUS_META)) st.set(s, { status: s, count: 0, amountUsd: 0, netUsd: 0, feeUsd: 0 });
  for (const g of groups) {
    const amount = toNum(g._sum.amount as never);
    const net = toNum(g._sum.netAmount as never);
    const fee = toNum(g._sum.fee as never);
    const c = g._count._all;
    const s = st.get(g.status) ?? { status: g.status, count: 0, amountUsd: 0, netUsd: 0, feeUsd: 0 };
    s.count += c;
    s.amountUsd += amount;
    s.netUsd += net;
    s.feeUsd += fee;
    st.set(g.status, s);
    const m = me.get(g.method) ?? { method: g.method, count: 0, amountUsd: 0, paidCount: 0, paidNetUsd: 0, openCount: 0, openUsd: 0 };
    m.count += c;
    m.amountUsd += amount;
    if (g.status === "COMPLETED") {
      m.paidCount += c;
      m.paidNetUsd += net;
    } else if (g.status === "PENDING" || g.status === "PROCESSING") {
      m.openCount += c;
      m.openUsd += net;
    }
    me.set(g.method, m);
  }
  const byStatus = [...st.values()];
  return {
    byStatus,
    byMethod: [...me.values()].sort((a, b) => b.amountUsd - a.amountUsd),
    totalCount: byStatus.reduce((n, s) => n + s.count, 0),
    totalAmountUsd: byStatus.reduce((n, s) => n + s.amountUsd, 0),
  };
}

/* ── Company-book expenses ──────────────────────────────────────────────── */

/**
 * Company expenses PAID in the window, by category, by payment date — net of
 * their tax part, the rule Company books' P&L uses. Separate from the outflow
 * above: these are the company's own bills (rent, tools, salaries paid outside
 * the wallet), not money paid to members.
 */
export async function getCompanyExpensesByCategory(range: { from?: Date; to?: Date }): Promise<{
  categories: Array<{ categoryId: string; name: string; color: string | null; usd: number; count: number }>;
  totalUsd: number;
}> {
  const rows = (await prisma.financeEntry.groupBy({
    by: ["categoryId"],
    where: {
      kind: "EXPENSE",
      status: "PAID",
      ...(range.from || range.to ? { paidAt: { gte: range.from, lte: range.to } } : {}),
    },
    _sum: { amountUsd: true, taxAmountUsd: true },
    _count: { _all: true },
  })) as unknown as Array<{ categoryId: string; _sum: { amountUsd: unknown; taxAmountUsd: unknown }; _count: { _all: number } }>;
  const cats = rows.length
    ? await prisma.financeCategory.findMany({
        where: { id: { in: rows.map((r) => r.categoryId) } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const categories = rows
    .map((r) => ({
      categoryId: r.categoryId,
      name: byId.get(r.categoryId)?.name ?? "Unknown",
      color: byId.get(r.categoryId)?.color ?? null,
      usd: toNum(r._sum.amountUsd as never) - toNum(r._sum.taxAmountUsd as never),
      count: r._count._all,
    }))
    .sort((a, b) => b.usd - a.usd);
  return { categories, totalUsd: categories.reduce((n, c) => n + c.usd, 0) };
}
