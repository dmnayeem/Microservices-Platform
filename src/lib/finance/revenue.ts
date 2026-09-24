import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { adRevenueWindow } from "@/lib/ad-revenue";
import { getPointsPerUsd } from "@/lib/economy";

/**
 * What the platform actually earns, from the columns that already record it.
 *
 * Five of these were being captured and **never added up anywhere**:
 *
 * - `MarketplacePurchase.fee` — no `SUM` of it existed in the codebase.
 *   `/admin/marketplace` shows gross GMV and calls it revenue.
 * - `Withdrawal.fee` — never summed; visible only one row at a time.
 * - `LotterySettlement.houseCutPoints` — the whole table was **read by no
 *   application code at all**, despite its own schema comment saying "finance
 *   reporting reads THIS table".
 * - The offerwall margin — `OfferwallCallback.payoutAmount` (what the network
 *   pays the platform) against `userPayout` (points handed to the user) — never
 *   compared.
 * - The course commission — computed on every sale and written only into
 *   `Transaction.metadata`, with no column until now.
 *
 * Each stream reports `measured: false` when nothing has happened yet, so the
 * console can say "no activity" instead of presenting `$0.00` as a finding.
 * Those are different statements and a finance admin needs to tell them apart.
 */

export interface RevenueStream {
  key: string;
  label: string;
  usd: number;
  /** How many underlying rows produced it — 0 means nothing has happened. */
  count: number;
  /** Where the figure comes from, shown in the UI so a total can be audited. */
  from: string;
  /** False when there is no data at all, as opposed to a real zero. */
  measured: boolean;
  /** Set when the figure is reconstructed rather than read from a column. */
  note?: string;
}

export interface RevenueBreakdown {
  streams: RevenueStream[];
  totalUsd: number;
  /**
   * Tax charged on marketplace commission and collected from buyers.
   *
   * Deliberately NOT a stream and NOT part of `totalUsd`: it is money held
   * for a tax authority, not income. Reporting it alongside revenue is how a
   * platform ends up spending what it owes.
   */
  taxCollectedUsd: number;
}

interface Range {
  from?: Date;
  to?: Date;
}

/** Prisma `aggregate` result shape, restated — see the note at the call site. */
interface SumCount<S> {
  _sum: S;
  _count: number;
}

const within = (r: Range) =>
  r.from || r.to
    ? { gte: r.from ?? undefined, lte: r.to ?? undefined }
    : undefined;

export async function getRevenueBreakdown(range: Range = {}): Promise<RevenueBreakdown> {
  const created = within(range);
  const pointsPerUsd = await getPointsPerUsd();

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
  ] = (await Promise.all([
    prisma.marketplacePurchase.aggregate({
      where: created ? { createdAt: created } : {},
      _sum: { fee: true, tax: true },
      _count: true,
    }),
    prisma.marketplaceDeal.aggregate({
      where: created ? { createdAt: created } : {},
      _sum: { adminFee: true },
      _count: true,
    }),
    // Only completed payouts: the fee on a pending withdrawal has not been
    // earned yet, and a rejected one is refunded in full.
    prisma.withdrawal.aggregate({
      where: { status: "COMPLETED", ...(created ? { createdAt: created } : {}) },
      _sum: { fee: true },
      _count: true,
    }),
    prisma.lotterySettlement.aggregate({
      where: created ? { settledAt: created } : {},
      _sum: { houseCutPoints: true, overflowToHouse: true },
      _count: true,
    }),
    // The margin is per-row: what the network paid minus what the user got.
    prisma.offerwallCallback.findMany({
      where: { status: "APPROVED", ...(created ? { createdAt: created } : {}) },
      select: { payoutAmount: true, userPayout: true },
    }),
    prisma.courseEnrollment.aggregate({
      where: created ? { createdAt: created } : {},
      _sum: { platformFeeUsd: true },
      _count: true,
    }),
    // Ads. Windowed through `adRevenueWindow`, which sums AdDailyStat day rows,
    // because `AdCampaign.spentTotal` is LIFETIME — reading it here meant the
    // date filter above every other line on this screen silently did nothing to
    // the ad line, so a one-week view showed a year of ad revenue beside a
    // week of everything else and the total was neither.
    //
    // With no `from`, an epoch start makes the window effectively lifetime, so
    // the unfiltered screen still shows what it always did. The same house and
    // network exclusions the ad panels use apply here, or this would report the
    // platform's own house inventory billing itself as income.
    adRevenueWindow(range.from ?? new Date(0), range.to ?? new Date()),
    // Subscriptions bought off-platform are created `isActive: false` and only
    // flip to true when an admin verifies the payment — so summing every row
    // counted money nobody has been paid yet as revenue. Rejections are
    // deleted, but a request sitting in the verification queue was not.
    // Expired subscriptions are also `isActive: false`, and those DID pay, so
    // the discriminator is the term rather than the flag: a row is counted once
    // it is active, or once its term has run.
    prisma.subscription.aggregate({
      where: {
        OR: [{ isActive: true }, { endDate: { lt: new Date() } }],
        ...(created ? { createdAt: created } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    // The buyer task commission. Written as `ADMIN_FEE` with `amount: 0` and
    // the fee in `points` — so it has been recorded since the buyer system
    // shipped and summed by nothing, which is the exact bug this file exists
    // to stop. It has no column of its own; the ledger row IS the record.
    prisma.transaction.aggregate({
      where: {
        type: "ADMIN_FEE",
        status: "COMPLETED",
        reference: { startsWith: "task_fee_" },
        ...(created ? { createdAt: created } : {}),
      },
      _sum: { points: true },
      _count: true,
    }),
    // Nine aggregates in one tuple: past a handful of entries Prisma's generics
    // collapse to `{}` and every `_sum` below becomes a type error. The shapes
    // are restated, which is the documented workaround in this codebase.
  ])) as unknown as [
    SumCount<{ fee: unknown; tax: unknown }>,
    SumCount<{ adminFee: unknown }>,
    SumCount<{ fee: unknown }>,
    SumCount<{ houseCutPoints: number | null; overflowToHouse: number | null }>,
    Array<{ payoutAmount: unknown; userPayout: number | null }>,
    SumCount<{ platformFeeUsd: unknown }>,
    Awaited<ReturnType<typeof adRevenueWindow>>,
    SumCount<{ amount: unknown }>,
    SumCount<{ points: number | null }>,
  ];

  const offerwallMargin = offerwall.reduce((sum, row) => {
    const network = toNum(row.payoutAmount as never);
    const user = (row.userPayout ?? 0) / pointsPerUsd;
    // Never negative: paying a user more than the network paid is a loss on
    // that row, and it should show as a loss rather than be clamped away.
    return sum + (network - user);
  }, 0);

  const taskFeePoints = Math.abs(taskFees._sum.points ?? 0);

  const lotteryPoints =
    (lottery._sum.houseCutPoints ?? 0) + (lottery._sum.overflowToHouse ?? 0);

  const streams: RevenueStream[] = [
    {
      key: "marketplace",
      label: "Marketplace commission",
      usd: toNum(marketplace._sum.fee as never),
      count: marketplace._count,
      from: "MarketplacePurchase.fee",
      measured: marketplace._count > 0,
    },
    {
      key: "mediation",
      label: "Escrow & mediation fees",
      usd: toNum(mediation._sum.adminFee as never),
      count: mediation._count,
      from: "MarketplaceDeal.adminFee",
      measured: mediation._count > 0,
    },
    {
      key: "withdrawal",
      label: "Withdrawal fees",
      usd: toNum(withdrawals._sum.fee as never),
      count: withdrawals._count,
      from: "Withdrawal.fee (completed only)",
      measured: withdrawals._count > 0,
    },
    {
      key: "lottery",
      label: "Lottery house cut",
      usd: lotteryPoints / pointsPerUsd,
      count: lottery._count,
      from: "LotterySettlement.houseCutPoints + overflowToHouse",
      measured: lottery._count > 0,
      note: `${lotteryPoints.toLocaleString()} points at ${pointsPerUsd.toLocaleString()}/USD`,
    },
    {
      key: "offerwall",
      label: "Offerwall margin",
      usd: offerwallMargin,
      count: offerwall.length,
      from: "OfferwallCallback: network payout − user payout",
      measured: offerwall.length > 0,
      note: "Reconstructed per row; the platform's share is not stored directly.",
    },
    {
      key: "course",
      label: "Course commission",
      usd: toNum(courses._sum.platformFeeUsd as never),
      count: courses._count,
      from: "CourseEnrollment.platformFeeUsd",
      measured: courses._count > 0,
      note: "Enrolments from before this column existed report no fee.",
    },
    {
      key: "ads",
      label: "Ad revenue",
      usd: ads.usd,
      // Billable clicks, not campaigns: revenue here is charged per click, so
      // the count beside the money should be the thing that produced it.
      count: ads.clicks,
      from: "AdDailyStat.spendUsd (non-house, non-network, windowed)",
      // Impressions, not clicks — a window with traffic and no clicks is
      // measured and genuinely zero, which is different from having no data.
      measured: ads.impressions > 0,
      note: "Honours the date filter. House and network inventory excluded.",
    },
    {
      key: "taskfee",
      label: "Buyer task commission",
      usd: taskFeePoints / pointsPerUsd,
      count: taskFees._count,
      from: "Transaction ADMIN_FEE `task_fee_*` (points)",
      measured: taskFees._count > 0,
      note:
        `${taskFeePoints.toLocaleString()} points at ${pointsPerUsd.toLocaleString()}/USD. ` +
        "Reads $0 while `buyer.fee_percent` is 0 — that is a rate the owner has not set, not a missing figure.",
    },
    {
      key: "subscription",
      label: "Subscriptions",
      usd: toNum(subs._sum.amount as never),
      count: subs._count,
      from: "Subscription.amount",
      measured: subs._count > 0,
      note: "Read from Subscription, not the ledger: plans paid offline are activated without a Transaction row.",
    },
  ];

  return {
    streams,
    totalUsd: streams.reduce((s, x) => s + x.usd, 0),
    taxCollectedUsd: toNum(marketplace._sum.tax as never),
  };
}
