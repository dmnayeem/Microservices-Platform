import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { hasPermission, type UserRole } from "@/lib/rbac";
import {
  MarketplaceBidStatus,
  MarketplaceListingStatus,
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import {
  resolveCommissionBps,
  splitPrice,
} from "@/lib/marketplace-commission";

// POST /api/marketplace/listings/:id/close-auction
// Settles a closed auction:
//  - The current ACTIVE high bid wins (if at-or-above reserve)
//  - Other ACTIVE/OUTBID bids are marked LOST
//  - A MarketplacePurchase is created and balances settled
//  - The listing flips to SOLD
//
// Authorization: the listing owner OR an admin with `marketplace.manage`
// can call this. Use the latter as a manual close in case the auto-close
// cron isn't running yet.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
        title: true,
        assetType: true,
        auctionMode: true,
        auctionEndsAt: true,
        reservePrice: true,
        commissionRateBps: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const role = session.user.role as UserRole | undefined;
    const isAdmin = hasPermission(role, "marketplace.manage");
    if (!isAdmin && session.user.id !== listing.sellerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!listing.auctionMode) {
      return NextResponse.json(
        { error: "Not an auction listing" },
        { status: 400 }
      );
    }
    if (listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: `Listing is already ${listing.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    const highBid = await prisma.marketplaceBid.findFirst({
      where: { listingId: id, status: MarketplaceBidStatus.ACTIVE },
      orderBy: { amount: "desc" },
    });

    // No bids → just mark expired
    if (!highBid) {
      await prisma.marketplaceListing.update({
        where: { id },
        data: { status: MarketplaceListingStatus.EXPIRED },
      });
      return NextResponse.json({
        closed: true,
        winner: null,
        reason: "No bids received",
      });
    }

    // Reserve not met → mark expired, notify
    if (listing.reservePrice != null && highBid.amount < listing.reservePrice) {
      await prisma.$transaction([
        prisma.marketplaceListing.update({
          where: { id },
          data: { status: MarketplaceListingStatus.EXPIRED },
        }),
        prisma.marketplaceBid.updateMany({
          where: {
            listingId: id,
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
          message: `Your auction "${listing.title}" closed below reserve. Highest bid: $${highBid.amount.toLocaleString()}.`,
          data: { listingId: id },
        },
      });
      return NextResponse.json({
        closed: true,
        winner: null,
        reason: "Reserve not met",
        highBid: toNum(highBid.amount),
      });
    }

    // We have a winner — settle the sale
    const amount = toNum(highBid.amount);
    const bps = await resolveCommissionBps({
      assetType: listing.assetType,
      perListingOverride: listing.commissionRateBps,
    });
    const { fee, sellerAmount } = splitPrice(amount, bps);

    const [purchase] = await prisma.$transaction([
      prisma.marketplacePurchase.create({
        data: {
          listingId: id,
          buyerId: highBid.bidderId,
          amount,
          fee,
          sellerAmount,
          status: "COMPLETED",
        },
      }),
      prisma.marketplaceBid.update({
        where: { id: highBid.id },
        data: { status: MarketplaceBidStatus.WON },
      }),
      prisma.marketplaceBid.updateMany({
        where: {
          listingId: id,
          id: { not: highBid.id },
          status: {
            in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID],
          },
        },
        data: { status: MarketplaceBidStatus.LOST },
      }),
      prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: MarketplaceListingStatus.SOLD,
        },
      }),
      prisma.user.update({
        where: { id: highBid.bidderId },
        data: { cashBalance: { decrement: amount } },
      }),
      prisma.user.update({
        where: { id: listing.sellerId },
        data: {
          cashBalance: { increment: sellerAmount },
          totalEarnings: { increment: sellerAmount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: highBid.bidderId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -amount,
          points: 0,
          description: `Auction won — "${listing.title}"`,
          reference: `marketplace_auction_${id}`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: listing.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          amount: sellerAmount,
          points: 0,
          description: `Auction sale — "${listing.title}"`,
          reference: `marketplace_auction_${id}`,
        },
      }),
    ]);

    await Promise.all([
      prisma.notification.create({
        data: {
          userId: highBid.bidderId,
          type: NotificationType.SYSTEM,
          title: "You won the auction! 🎉",
          message: `You won "${listing.title}" with a $${amount.toLocaleString()} bid.`,
          data: { listingId: id, amount, purchaseId: purchase.id },
        },
      }),
      prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: NotificationType.SYSTEM,
          title: "Auction closed — sold",
          message: `Your auction "${listing.title}" sold for $${amount.toLocaleString()}.`,
          data: { listingId: id, amount, purchaseId: purchase.id },
        },
      }),
    ]);

    return NextResponse.json({
      closed: true,
      winner: { userId: highBid.bidderId, amount },
      purchaseId: purchase.id,
    });
  } catch (error) {
    // A concurrent double-close / retry reuses reference `marketplace_auction_<id>`
    // → P2002 on (userId, reference). The first close already settled; treat this
    // one as a no-op success instead of double-settling.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ closed: true, duplicate: true });
    }
    console.error("Close auction failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
