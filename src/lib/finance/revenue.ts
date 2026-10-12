import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { adRevenueWindow } from "@/lib/ad-revenue";
import { getPointsPerUsd } from "@/lib/economy";
import { getFinanceTestUserIds, withoutUsers } from "@/lib/finance/test-users";
import { thirdPartyIncome } from "@/lib/finance/platform-income";

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
  /**
   * `platform` — the platform's own income, measured by the app.
   * `third_party` — what an outside company (AdSense, Adsterra…) paid, typed in
   * by finance at /admin/finance/platform-income. Shown as two separate groups.
   */
  group: "platform" | "third_party";
}

export interface RevenueBreakdown {
  streams: RevenueStream[];
  totalUsd: number;
  /** Sum of the `group: "platform"` streams. */
  platformUsd: number;
  /** Sum of the `group: "third_party"` streams (incl. month-end adjustments). */
  thirdPartyUsd: number;
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
  const [pointsPerUsd, testIds, pendingSubRefs] = await Promise.all([
    getPointsPerUsd(),
    getFinanceTestUserIds(),
    // Off-platform plan requests still awaiting verification carry a PENDING
    // `subscription_<id>` ledger row. Their term can run out while they sit in
    // the queue, which used to make the end-date rule below count them as paid.
    prisma.transaction.findMany({
      where: { status: "PENDING", reference: { startsWith: "subscription_" } },
      select: { reference: true },
      take: 5000,
    }),
  ]);
  const pendingSubIds = pendingSubRefs
    .map((t) => t.reference?.slice("subscription_".length) ?? "")
    .filter((id) => id && !id.startsWith("from_"));
  // Finance test users are excluded from every stream: their purchases, fees
  // and ad spend are test money. `x` adds the exclusion on the named column(s).
  const x = <W extends object>(w: NoInfer<W>, fields: string | string[] = "userId", nullable = false): W =>
    withoutUsers<W>(w, testIds, fields, { nullable });

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
      where: x(created ? { createdAt: created } : {}, ["buyerId", "listing.sellerId"]),
      _sum: { fee: true, tax: true },
      _count: true,
    }),
    prisma.marketplaceDeal.aggregate({
      where: x(created ? { createdAt: created } : {}, ["buyerId", "sellerId"]),
      _sum: { adminFee: true },
      _count: true,
    }),
    // Only completed payouts: the fee on a pending withdrawal has not been
    // earned yet, and a rejected one is refunded in full.
    prisma.withdrawal.aggregate({
      where: x({ status: "COMPLETED", ...(created ? { createdAt: created } : {}) }),
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
      where: x({ status: "APPROVED", ...(created ? { createdAt: created } : {}) }),
      select: { payoutAmount: true, userPayout: true },
    }),
    prisma.courseEnrollment.aggregate({
      where: x(x(created ? { createdAt: created } : {}), "course.tutorId", true),
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
    adRevenueWindow(range.from ?? new Date(0), range.to ?? new Date(), {
      excludeAdvertiserIds: testIds,
    }),
    // Subscriptions bought off-platform are created `isActive: false` and only
    // flip to true when an admin verifies the payment — so summing every row
    // counted money nobody has been paid yet as revenue. Rejections are
    // deleted, but a request sitting in the verification queue was not.
    // Expired subscriptions are also `isActive: false`, and those DID pay, so
    // the discriminator is the term rather than the flag: a row is counted once
    // it is active, or once its term has run.
    prisma.subscription.aggregate({
      where: x({
        OR: [{ isActive: true }, { endDate: { lt: new Date() } }],
        ...(pendingSubIds.length ? { id: { notIn: pendingSubIds } } : {}),
        ...(created ? { createdAt: created } : {}),
      }),
      _sum: { amount: true },
      _count: true,
    }),
    // The buyer task commission. Written as `ADMIN_FEE` with `amount: 0` and
    // the fee in `points` — so it has been recorded since the buyer system
    // shipped and summed by nothing, which is the exact bug this file exists
    // to stop. It has no column of its own; the ledger row IS the record.
    prisma.transaction.aggregate({
      where: x({
        type: "ADMIN_FEE",
        status: "COMPLETED",
        reference: { startsWith: "task_fee_" },
        ...(created ? { createdAt: created } : {}),
      }),
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

  // Blue badge + badge-style sales (lib/badges-server). Paid from the wallet
  // in cash or points; every sale is one PURCHASE row whose reference starts
  // with "badge_". Signs are not trusted (abs), points convert at the rate.
  const badgeSales = (await prisma.transaction.aggregate({
    where: x({
      type: "PURCHASE",
      status: "COMPLETED",
      reference: { startsWith: "badge_" },
      ...(created ? { createdAt: created } : {}),
    }),
    _sum: { amount: true, points: true },
    _count: true,
  })) as unknown as SumCount<{ amount: unknown; points: number | null }>;
  const badgeUsd =
    Math.abs(toNum(badgeSales._sum.amount as never)) +
    Math.abs(badgeSales._sum.points ?? 0) / pointsPerUsd;

  // Plan auto-renewals (lib/subscription-expiry). A renewal extends the SAME
  // Subscription row, so `Subscription.amount` above counts only the first
  // term — every renewal charge was money taken and never reported. Each one
  // is a PURCHASE ledger row `sub_renew_*`. Older rows were written negative,
  // newer ones positive: the sign is not trusted, each side is summed apart.
  const renewWhere = (amount: { gt: number } | { lt: number }) =>
    x({
      type: "PURCHASE" as const,
      status: "COMPLETED" as const,
      reference: { startsWith: "sub_renew_" },
      amount,
      ...(created ? { createdAt: created } : {}),
    });
  const [renewPos, renewNeg] = (await Promise.all([
    prisma.transaction.aggregate({ where: renewWhere({ gt: 0 }), _sum: { amount: true }, _count: true }),
    prisma.transaction.aggregate({ where: renewWhere({ lt: 0 }), _sum: { amount: true }, _count: true }),
  ])) as unknown as [SumCount<{ amount: unknown }>, SumCount<{ amount: unknown }>];
  const renewUsd =
    Math.abs(toNum(renewPos._sum.amount as never)) + Math.abs(toNum(renewNeg._sum.amount as never));
  const renewCount = renewPos._count + renewNeg._count;

  const lotteryPoints =
    (lottery._sum.houseCutPoints ?? 0) + (lottery._sum.overflowToHouse ?? 0);

  // Paid features that were charged and never reported (2026-10-13):
  // post boosts, Spotlight wins, own-product promotions, ad-space rentals.
  //
  // Post boost: points only. `amount` on these rows is the points' USD value,
  // NOT a second (cash) charge — summing both would count every boost twice.
  // Promotions (course / marketplace listing): cash OR points, one or the
  // other per row (the unused side is 0). Signs are not trusted (abs).
  const [boosts, promos, spotlight, rentals] = (await Promise.all([
    prisma.transaction.aggregate({
      where: x({ type: "PURCHASE", status: "COMPLETED", reference: { startsWith: "boost_" }, ...(created ? { createdAt: created } : {}) }),
      _sum: { points: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: x({
        type: "PURCHASE",
        status: "COMPLETED",
        OR: [{ reference: { startsWith: "promo_course_" } }, { reference: { startsWith: "promo_marketplace_" } }],
        ...(created ? { createdAt: created } : {}),
      }),
      _sum: { amount: true, points: true },
      _count: true,
    }),
    // Spotlight: only the WINNING bid is income — every other bid is held and
    // refunded in full. Dated on the award.
    prisma.spotlightAuction.aggregate({
      where: x({ status: "AWARDED", ...(created ? { awardedAt: created } : {}) }, "winnerUserId", true),
      _sum: { winnerBid: true },
      _count: true,
    }),
    // Ad-space rentals: a booking an advertiser paid for (ACTIVE, or ENDED
    // after running). Read from the booking, not the invoice, so a rental paid
    // off-app and activated by hand counts too and an invoice can never count
    // it twice. The platform's own bookings (no advertiser) are not income.
    // Dated on the start of the rented period.
    prisma.adSlotBooking.aggregate({
      where: x(
        { status: { in: ["ACTIVE", "ENDED"] }, advertiserId: { not: null }, ...(created ? { startAt: created } : {}) },
        "advertiserId",
        true
      ),
      _sum: { priceUsd: true },
      _count: true,
    }),
  ])) as unknown as [
    SumCount<{ points: number | null }>,
    SumCount<{ amount: unknown; points: number | null }>,
    SumCount<{ winnerBid: number | null }>,
    SumCount<{ priceUsd: unknown }>,
  ];
  const boostPoints = Math.abs(boosts._sum.points ?? 0);
  const promoUsd = Math.abs(toNum(promos._sum.amount as never)) + Math.abs(promos._sum.points ?? 0) / pointsPerUsd;
  const spotlightPoints = Math.abs(spotlight._sum.winnerBid ?? 0);

  // Third-party companies (AdSense, Adsterra, Monetag, Amazon…), typed in by
  // finance per day — lib/finance/platform-income, which also applies the
  // month-end payout. The "ads" stream excludes network inventory, so nothing
  // is counted on both sides.
  const third = await thirdPartyIncome(range).catch(() => null);

  const own: Omit<RevenueStream, "group">[] = [
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
      usd: toNum(subs._sum.amount as never) + renewUsd,
      count: subs._count + renewCount,
      from: "Subscription.amount + Transaction PURCHASE `sub_renew_*`",
      measured: subs._count + renewCount > 0,
      note: "First terms are read from Subscription, not the ledger (plans paid offline are activated without a COMPLETED purchase row until approved); auto-renewal charges are read from their `sub_renew_*` ledger rows.",
    },
    {
      key: "badges",
      label: "Blue badges",
      usd: badgeUsd,
      count: badgeSales._count,
      from: "Transaction PURCHASE badge_*",
      measured: badgeSales._count > 0,
      note: "Blue badge and badge-style sales, paid from the wallet (points at the published rate).",
    },
    {
      key: "boosts",
      label: "Post boosts",
      usd: boostPoints / pointsPerUsd,
      count: boosts._count,
      from: "Transaction PURCHASE boost_* (points)",
      measured: boosts._count > 0,
      note: `${boostPoints.toLocaleString()} points at ${pointsPerUsd.toLocaleString()}/USD.`,
    },
    {
      key: "spotlight",
      label: "Spotlight (winning bids)",
      usd: spotlightPoints / pointsPerUsd,
      count: spotlight._count,
      from: "SpotlightAuction.winnerBid (AWARDED)",
      measured: spotlight._count > 0,
      note: `${spotlightPoints.toLocaleString()} points at ${pointsPerUsd.toLocaleString()}/USD. Losing bids are refunded and never count.`,
    },
    {
      key: "promotions",
      label: "Promotions (courses & listings)",
      usd: promoUsd,
      count: promos._count,
      from: "Transaction PURCHASE promo_course_* / promo_marketplace_*",
      measured: promos._count > 0,
    },
    {
      key: "adrentals",
      label: "Ad space rentals",
      usd: toNum(rentals._sum.priceUsd as never),
      count: rentals._count,
      from: "AdSlotBooking.priceUsd (ACTIVE / ENDED, advertiser-paid)",
      measured: rentals._count > 0,
    },
  ];
  const streams: RevenueStream[] = own.map((st) => ({ ...st, group: "platform" as const }));

  // One stream per third-party company with income in the range, plus one for
  // the month-end payout corrections, so every total traces back to a name.
  if (third) {
    for (const pl of third.platforms) {
      if (pl.days === 0) continue;
      streams.push({
        key: `tp_${pl.id}`,
        label: pl.name,
        usd: pl.estimatedUsd,
        count: pl.days,
        from: `Platform income — ${pl.type} (entered daily by finance)`,
        measured: true,
        group: "third_party",
      });
    }
    if (third.adjustmentUsd !== 0) {
      streams.push({
        key: "tp_adjustment",
        label: "Month-end payout adjustment",
        usd: third.adjustmentUsd,
        count: third.platforms.filter((pl) => pl.adjustmentUsd !== 0).length,
        from: "PlatformPayout minus that month's daily figures",
        measured: true,
        note: "Actual payout minus the daily figures for the same month, dated on the month's last day.",
        group: "third_party",
      });
    }
  }

  const platformUsd = streams.filter((st) => st.group === "platform").reduce((n, st) => n + st.usd, 0);
  const thirdPartyUsd = streams.filter((st) => st.group === "third_party").reduce((n, st) => n + st.usd, 0);
  return {
    streams,
    platformUsd,
    thirdPartyUsd,
    totalUsd: platformUsd + thirdPartyUsd,
    taxCollectedUsd: toNum(marketplace._sum.tax as never),
  };
}
