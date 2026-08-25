import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
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
}

interface Range {
  from?: Date;
  to?: Date;
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
  ] = await Promise.all([
    prisma.marketplacePurchase.aggregate({
      where: created ? { createdAt: created } : {},
      _sum: { fee: true },
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
    // Ads are already surfaced elsewhere; included so one total covers everything.
    prisma.adCampaign.aggregate({
      where: { isHouse: false },
      _sum: { spentTotal: true },
      _count: true,
    }),
    prisma.subscription.aggregate({
      where: created ? { createdAt: created } : {},
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const offerwallMargin = offerwall.reduce((sum, row) => {
    const network = toNum(row.payoutAmount);
    const user = (row.userPayout ?? 0) / pointsPerUsd;
    // Never negative: paying a user more than the network paid is a loss on
    // that row, and it should show as a loss rather than be clamped away.
    return sum + (network - user);
  }, 0);

  const lotteryPoints =
    (lottery._sum.houseCutPoints ?? 0) + (lottery._sum.overflowToHouse ?? 0);

  const streams: RevenueStream[] = [
    {
      key: "marketplace",
      label: "Marketplace commission",
      usd: toNum(marketplace._sum.fee),
      count: marketplace._count,
      from: "MarketplacePurchase.fee",
      measured: marketplace._count > 0,
    },
    {
      key: "mediation",
      label: "Escrow & mediation fees",
      usd: toNum(mediation._sum.adminFee),
      count: mediation._count,
      from: "MarketplaceDeal.adminFee",
      measured: mediation._count > 0,
    },
    {
      key: "withdrawal",
      label: "Withdrawal fees",
      usd: toNum(withdrawals._sum.fee),
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
      usd: toNum(courses._sum.platformFeeUsd),
      count: courses._count,
      from: "CourseEnrollment.platformFeeUsd",
      measured: courses._count > 0,
      note: "Enrolments from before this column existed report no fee.",
    },
    {
      key: "ads",
      label: "Ad revenue",
      usd: toNum(ads._sum.spentTotal),
      count: ads._count,
      from: "AdCampaign.spentTotal (non-house, lifetime)",
      measured: ads._count > 0,
      note: "Lifetime — campaign spend has no per-day column outside AdDailyStat.",
    },
    {
      key: "subscription",
      label: "Subscriptions",
      usd: toNum(subs._sum.amount),
      count: subs._count,
      from: "Subscription.amount",
      measured: subs._count > 0,
      note: "Read from Subscription, not the ledger: plans paid offline are activated without a Transaction row.",
    },
  ];

  return {
    streams,
    totalUsd: streams.reduce((s, x) => s + x.usd, 0),
  };
}
