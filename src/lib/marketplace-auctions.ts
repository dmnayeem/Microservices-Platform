import { prisma } from "@/lib/prisma";
import {
  MarketplaceBidStatus,
  MarketplaceListingStatus,
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import { resolveCommissionBps, splitPrice } from "@/lib/marketplace-commission";
import { lt, toNum, type MoneyInput } from "@/lib/money";
import {
  getPayoutHoldConfig,
  payOrHoldSeller,
  getMarketplaceTaxConfig,
  computeCommissionTax,
} from "@/lib/marketplace-selling";

export type AuctionCloseResult =
  | { listingId: string; outcome: "sold"; winnerId: string; amount: number }
  | { listingId: string; outcome: "expired"; reason: string };

export interface CloseDueAuctionsSummary {
  processed: number;
  results: AuctionCloseResult[];
  hasMore: boolean;
}

export interface AuctionListingRow {
  id: string;
  sellerId: string;
  title: string;
  assetType: string;
  saleMode: string;
  reservePrice: MoneyInput | null;
  commissionRateBps: number | null;
}

/** How many distinct bidders, highest first, may be tried before an auction is voided. */
const MAX_WINNER_FALLBACKS = 5;

const AUCTION_SELECT = {
  id: true,
  sellerId: true,
  title: true,
  assetType: true,
  saleMode: true,
  reservePrice: true,
  commissionRateBps: true,
} as const;

/**
 * Settle one already-loaded, still-ACTIVE auction listing: no bids or
 * reserve-not-met → EXPIRED; otherwise the highest bidder wins and funds move
 * (buyer debited, seller credited minus commission) in one transaction, both
 * parties notified.
 *
 * **This is the only settlement path.** The manual close endpoint used to carry
 * its own copy, and the copy had drifted into an unbounded money-creation bug:
 * it debited the winner with a plain `decrement` — no balance read anywhere in
 * the file — so a $0 account could win a $1,000,000 auction and the seller was
 * credited real withdrawable cash out of nothing. It also compared two
 * `Decimal`s with `<`, which compares their string forms. Callers do their own
 * authorisation and due-date checks and then hand the row here.
 */
export async function settleAuction(
  listing: AuctionListingRow
): Promise<AuctionCloseResult> {
  const highBid = await prisma.marketplaceBid.findFirst({
    where: { listingId: listing.id, status: MarketplaceBidStatus.ACTIVE },
    orderBy: { amount: "desc" },
  });

  // No bids at all → expire
  if (!highBid) {
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: MarketplaceListingStatus.EXPIRED },
    });
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.SYSTEM,
        title: "Auction expired — no bids",
        message: `Your auction "${listing.title}" ended without any bids.`,
        data: { listingId: listing.id },
      },
    });
    return { listingId: listing.id, outcome: "expired", reason: "No bids" };
  }

  // Reserve not met → expire
  if (listing.reservePrice != null && lt(highBid.amount, listing.reservePrice)) {
    await prisma.$transaction([
      prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: MarketplaceListingStatus.EXPIRED },
      }),
      prisma.marketplaceBid.updateMany({
        where: {
          listingId: listing.id,
          status: {
            in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID],
          },
        },
        data: { status: MarketplaceBidStatus.LOST },
      }),
    ]);
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.SYSTEM,
        title: "Auction closed — reserve not met",
        message: `Your auction "${listing.title}" closed below reserve. Highest bid: $${toNum(highBid.amount).toLocaleString()}.`,
        data: { listingId: listing.id },
      },
    });
    return {
      listingId: listing.id,
      outcome: "expired",
      reason: "Reserve not met",
    };
  }

  // Pick the winner. The highest bidder first; if they cannot cover their bid
  // (+ tax), fall back to the next-highest DIFFERENT bidder at that bidder's
  // own highest bid, as long as it still meets the reserve. This used to void
  // the whole auction the moment the top bidder was short — so one bidder
  // with an empty wallet could kill any auction by out-bidding everyone.
  const bps = await resolveCommissionBps({
    assetType: listing.assetType,
    perListingOverride: listing.commissionRateBps,
  });
  const taxCfg = await getMarketplaceTaxConfig();
  const hold = await getPayoutHoldConfig();

  const bidRows = await prisma.marketplaceBid.findMany({
    where: {
      listingId: listing.id,
      status: { in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID] },
    },
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    take: 100,
  });
  const seenBidders = new Set<string>();
  const candidates: typeof bidRows = [];
  // The ACTIVE high bid leads even if an OUTBID row ties it.
  for (const b of [highBid, ...bidRows]) {
    if (seenBidders.has(b.bidderId)) continue;
    if (b.bidderId === listing.sellerId) continue;
    if (listing.reservePrice != null && lt(b.amount, listing.reservePrice)) continue;
    seenBidders.add(b.bidderId);
    candidates.push(b);
    if (candidates.length >= MAX_WINNER_FALLBACKS) break;
  }

  let won: {
    bid: (typeof bidRows)[number];
    amount: number;
    purchase: { id: string };
  } | null = null;
  const skipped: string[] = [];

  for (const bid of candidates) {
    const amount = toNum(bid.amount);
    const { fee, sellerAmount } = splitPrice(amount, bps);
    // Tax on the commission, on top of the winning bid — the same rule the
    // other sale paths follow.
    const { tax, pct: taxPct } = computeCommissionTax(fee, taxCfg);
    const winnerTotal = Math.round((amount + tax) * 100) / 100;

    // Settle atomically. The winner debit is a CAS (`cashBalance >= total`) so
    // the platform never pays the seller from a buyer who can't cover the bid.
    let purchase: { id: string } | null;
    try {
      purchase = await prisma.$transaction(async (tx) => {
        const paid = await tx.user.updateMany({
          where: { id: bid.bidderId, cashBalance: { gte: winnerTotal } },
          data: { cashBalance: { decrement: winnerTotal } },
        });
        if (paid.count === 0) return null; // can't cover — try the next bidder

        // Claim the listing. The Inngest close and the backstop sweep can
        // both reach a due auction; only one may sell it.
        const claimed = await tx.marketplaceListing.updateMany({
          where: { id: listing.id, status: MarketplaceListingStatus.ACTIVE },
          // An auction is forced to ONE_OFF when the listing is created, so in
          // practice this always flips. Checked anyway: an edit could set
          // UNLIMITED on a listing that already had bids, and closing the
          // auction would then delete a listing still licensed to everyone.
          data:
            listing.saleMode === "UNLIMITED"
              ? { directPurchasesCount: { increment: 1 } }
              : { status: MarketplaceListingStatus.SOLD },
        });
        if (claimed.count === 0) throw new Error("AUCTION_ALREADY_SETTLED");

        const p = await tx.marketplacePurchase.create({
          data: {
            listingId: listing.id,
            buyerId: bid.bidderId,
            amount,
            fee,
            tax,
            taxPct,
            sellerAmount,
            status: "COMPLETED",
          },
        });
        await tx.marketplaceBid.update({
          where: { id: bid.id },
          data: { status: MarketplaceBidStatus.WON },
        });
        await tx.marketplaceBid.updateMany({
          where: {
            listingId: listing.id,
            id: { not: bid.id },
            status: { in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID] },
          },
          data: { status: MarketplaceBidStatus.LOST },
        });
        // Winning an auction is still just a sale: honour the payout hold.
        const held = await payOrHoldSeller(tx, {
          sellerId: listing.sellerId,
          purchaseId: p.id,
          amount: toNum(sellerAmount),
          hold,
        });
        await tx.transaction.create({
          data: {
            userId: bid.bidderId,
            type: TransactionType.PURCHASE,
            status: TransactionStatus.COMPLETED,
            amount: -winnerTotal,
            points: 0,
            description: `Auction won — "${listing.title}"`,
            reference: `marketplace_auction_${listing.id}`,
          },
        });
        // Written on release instead when the money is held.
        if (!held.held) {
          await tx.transaction.create({
            data: {
              userId: listing.sellerId,
              type: TransactionType.EARNING,
              status: TransactionStatus.COMPLETED,
              amount: sellerAmount,
              points: 0,
              description: `Auction sale — "${listing.title}"`,
              reference: `marketplace_auction_${listing.id}`,
            },
          });
        }
        return { id: p.id };
      });
    } catch (e) {
      if (e instanceof Error && e.message === "AUCTION_ALREADY_SETTLED") {
        return { listingId: listing.id, outcome: "expired", reason: "Already settled" };
      }
      throw e;
    }

    if (purchase) {
      won = { bid, amount, purchase };
      break;
    }
    skipped.push(bid.bidderId);
  }

  // Tell every bidder who won but couldn't pay that the item moved on.
  if (skipped.length > 0) {
    await prisma.notification
      .createMany({
        data: skipped.map((userId) => ({
          userId,
          type: NotificationType.SYSTEM,
          title: "Auction payment failed",
          message: `Your winning bid on "${listing.title}" couldn't be charged — your wallet didn't cover it — so the item went to the next bidder.`,
          data: { listingId: listing.id },
        })),
      })
      .catch(() => {});
  }

  // Nobody eligible could pay → void the auction (no seller payout).
  if (!won) {
    await prisma.$transaction([
      prisma.marketplaceBid.updateMany({
        where: {
          listingId: listing.id,
          status: { in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID] },
        },
        data: { status: MarketplaceBidStatus.LOST },
      }),
      prisma.marketplaceListing.updateMany({
        where: { id: listing.id, status: MarketplaceListingStatus.ACTIVE },
        data: { status: MarketplaceListingStatus.EXPIRED },
      }),
    ]);
    await prisma.notification
      .create({
        data: {
          userId: listing.sellerId,
          type: NotificationType.SYSTEM,
          title: "Auction closed — payment failed",
          message: `None of the top bidders for "${listing.title}" could cover their bid, so the sale was voided.`,
          data: { listingId: listing.id },
        },
      })
      .catch(() => {});
    return {
      listingId: listing.id,
      outcome: "expired" as const,
      reason: "No eligible bidder had enough balance",
    };
  }
  const amount = won.amount;
  const purchase = won.purchase;
  const winnerId = won.bid.bidderId;

  await Promise.all([
    prisma.notification.create({
      data: {
        userId: winnerId,
        type: NotificationType.SYSTEM,
        title: "You won the auction! 🎉",
        message: `You won "${listing.title}" with a $${amount.toLocaleString()} bid.`,
        data: { listingId: listing.id, amount, purchaseId: purchase.id },
      },
    }),
    prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.SYSTEM,
        title: "Auction closed — sold",
        message: `Your auction "${listing.title}" sold for $${amount.toLocaleString()}.`,
        data: { listingId: listing.id, amount, purchaseId: purchase.id },
      },
    }),
  ]);

  return {
    listingId: listing.id,
    outcome: "sold",
    winnerId: winnerId,
    amount,
  };
}

/**
 * Close ONE auction by id — used by the event-driven Inngest schedule that fires
 * at the listing's exact `auctionEndsAt`. No-op (returns null) if the listing
 * isn't an ACTIVE auction whose end time has passed (already closed / not due).
 */
export async function closeAuctionById(
  listingId: string
): Promise<AuctionCloseResult | null> {
  const now = new Date();
  const listing = await prisma.marketplaceListing.findFirst({
    where: {
      id: listingId,
      auctionMode: true,
      status: MarketplaceListingStatus.ACTIVE,
      auctionEndsAt: { lte: now },
    },
    select: AUCTION_SELECT,
  });
  if (!listing) return null;
  return settleAuction(listing);
}

/**
 * Settle every auction-mode listing whose `auctionEndsAt` has passed and is
 * still ACTIVE. Only acts on ACTIVE listings, so re-running is a no-op. Shared
 * by the admin manual trigger and the Inngest backstop sweep.
 */
export async function closeDueAuctions(
  limit = 50
): Promise<CloseDueAuctionsSummary> {
  const now = new Date();
  const due = await prisma.marketplaceListing.findMany({
    where: {
      auctionMode: true,
      status: MarketplaceListingStatus.ACTIVE,
      auctionEndsAt: { lte: now },
    },
    select: AUCTION_SELECT,
    take: limit, // batch size — call again to drain a backlog
  });

  const results: AuctionCloseResult[] = [];
  for (const listing of due) {
    results.push(await settleAuction(listing));
  }
  return { processed: due.length, results, hasMore: due.length === limit };
}
