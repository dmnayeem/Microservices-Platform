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

export type AuctionCloseResult =
  | { listingId: string; outcome: "sold"; winnerId: string; amount: number }
  | { listingId: string; outcome: "expired"; reason: string };

export interface CloseDueAuctionsSummary {
  processed: number;
  results: AuctionCloseResult[];
  hasMore: boolean;
}

interface AuctionListingRow {
  id: string;
  sellerId: string;
  title: string;
  assetType: string;
  reservePrice: MoneyInput | null;
  commissionRateBps: number | null;
}

const AUCTION_SELECT = {
  id: true,
  sellerId: true,
  title: true,
  assetType: true,
  reservePrice: true,
  commissionRateBps: true,
} as const;

/**
 * Settle one already-loaded, still-ACTIVE, past-end auction listing: no bids or
 * reserve-not-met → EXPIRED; otherwise the highest bidder wins and funds move
 * (buyer debited, seller credited minus commission) in one transaction, both
 * parties notified.
 */
async function settleAuction(
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

  // Pick winner — same settlement path as the manual close endpoint
  const amount = toNum(highBid.amount);
  const bps = await resolveCommissionBps({
    assetType: listing.assetType,
    perListingOverride: listing.commissionRateBps,
  });
  const { fee, sellerAmount } = splitPrice(amount, bps);

  // Settle atomically. The winner debit is a CAS (`cashBalance >= amount`) so the
  // platform never pays the seller from a buyer who can't cover the bid. If the
  // winner is short, void the sale: mark all bids LOST + close the listing unsold.
  const purchase = await prisma.$transaction(async (tx) => {
    const paid = await tx.user.updateMany({
      where: { id: highBid.bidderId, cashBalance: { gte: amount } },
      data: { cashBalance: { decrement: amount } },
    });
    if (paid.count === 0) return null; // winner can't cover — abort settlement

    const p = await tx.marketplacePurchase.create({
      data: {
        listingId: listing.id,
        buyerId: highBid.bidderId,
        amount,
        fee,
        sellerAmount,
        status: "COMPLETED",
      },
    });
    await tx.marketplaceBid.update({
      where: { id: highBid.id },
      data: { status: MarketplaceBidStatus.WON },
    });
    await tx.marketplaceBid.updateMany({
      where: {
        listingId: listing.id,
        id: { not: highBid.id },
        status: { in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID] },
      },
      data: { status: MarketplaceBidStatus.LOST },
    });
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: MarketplaceListingStatus.SOLD },
    });
    await tx.user.update({
      where: { id: listing.sellerId },
      data: {
        cashBalance: { increment: sellerAmount },
        totalEarnings: { increment: sellerAmount },
      },
    });
    await tx.transaction.create({
      data: {
        userId: highBid.bidderId,
        type: TransactionType.PURCHASE,
        status: TransactionStatus.COMPLETED,
        amount: -amount,
        points: 0,
        description: `Auction won — "${listing.title}"`,
        reference: `marketplace_auction_${listing.id}`,
      },
    });
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
    return p;
  });

  // Winner couldn't pay → void the auction (no seller payout).
  if (!purchase) {
    await prisma.$transaction([
      prisma.marketplaceBid.updateMany({
        where: {
          listingId: listing.id,
          status: { in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID] },
        },
        data: { status: MarketplaceBidStatus.LOST },
      }),
      prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: MarketplaceListingStatus.EXPIRED },
      }),
    ]);
    await prisma.notification
      .create({
        data: {
          userId: listing.sellerId,
          type: NotificationType.SYSTEM,
          title: "Auction closed — payment failed",
          message: `The winning bidder for "${listing.title}" couldn't cover the bid, so the sale was voided.`,
          data: { listingId: listing.id },
        },
      })
      .catch(() => {});
    return {
      listingId: listing.id,
      outcome: "expired" as const,
      reason: "Winner had insufficient balance",
    };
  }

  await Promise.all([
    prisma.notification.create({
      data: {
        userId: highBid.bidderId,
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
    winnerId: highBid.bidderId,
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
