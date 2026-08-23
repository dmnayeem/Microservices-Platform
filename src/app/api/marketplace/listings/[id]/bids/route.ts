import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  MarketplaceBidStatus,
  MarketplaceListingStatus,
  NotificationType,
} from "@/generated/prisma";
import { z } from "zod";

/** Minimum increment over the current high bid. The larger of $10 or 5%
 *  of the current high. */
function minIncrement(currentHigh: number): number {
  return Math.max(10, Math.round(currentHigh * 0.05));
}

// GET /api/marketplace/listings/:id/bids — recent bids on a listing
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // The list is capped at 25; return the true total alongside it so the UI
    // can't render "bid history (25)" on a listing with 60 bids while admin
    // shows the real number.
    const totalBids = await prisma.marketplaceBid.count({ where: { listingId: id } });
    const bidsRaw = await prisma.marketplaceBid.findMany({
      where: { listingId: id },
      orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
      take: 25,
      include: {
        bidder: {
          select: { id: true, name: true, username: true, avatar: true },
        },
      },
    });
    const bids = bidsRaw as unknown as Array<{
      id: string;
      amount: number;
      status: string;
      message: string | null;
      createdAt: Date;
      bidderId: string;
      bidder: {
        id: string;
        name: string | null;
        username: string | null;
        avatar: string | null;
      };
    }>;
    return NextResponse.json({
      totalBids,
      bids: bids.map((b) => ({
        id: b.id,
        amount: toNum(b.amount),
        status: b.status,
        message: b.message,
        createdAt: b.createdAt,
        bidder: {
          id: b.bidder.id,
          name: b.bidder.name ?? b.bidder.username ?? "Anonymous",
          avatar: b.bidder.avatar,
        },
      })),
    });
  } catch (error) {
    console.error("List bids failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * Ceiling on a single bid. Money columns are `Decimal(18, 6)`, so anything at
 * or above 10^12 overflows the column; this sits far below that and far above
 * any real digital-goods listing. Without it `z.number().positive()` accepted
 * `1e308`.
 */
const MAX_BID = 1_000_000;

const placeBidSchema = z.object({
  amount: z.number().positive().max(MAX_BID),
  message: z.string().max(500).optional(),
});

// POST /api/marketplace/listings/:id/bids — place a bid
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(req, session.user.id, async () => {
  try {
    const { id } = await params;
    const body = await req.json();
    const v = placeBidSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const { amount, message } = v.data;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
        auctionMode: true,
        startingBid: true,
        reservePrice: true,
        buyNowPrice: true,
        auctionEndsAt: true,
        title: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This listing is no longer active" },
        { status: 400 }
      );
    }
    if (!listing.auctionMode) {
      return NextResponse.json(
        { error: "This listing isn't in auction mode" },
        { status: 400 }
      );
    }
    if (listing.sellerId === session.user.id) {
      return NextResponse.json(
        { error: "You can't bid on your own listing" },
        { status: 400 }
      );
    }
    if (listing.auctionEndsAt && listing.auctionEndsAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Auction has already ended" },
        { status: 400 }
      );
    }

    // Find current high bid (ACTIVE). Determines required minimum.
    const currentHigh = await prisma.marketplaceBid.findFirst({
      where: { listingId: id, status: MarketplaceBidStatus.ACTIVE },
      orderBy: { amount: "desc" },
    });

    const currentHighNum = currentHigh ? toNum(currentHigh.amount) : null;
    const floor =
      currentHighNum != null
        ? currentHighNum + minIncrement(currentHighNum)
        : toNum(listing.startingBid);

    if (amount < floor) {
      return NextResponse.json(
        {
          error:
            currentHigh
              ? `Bid must be at least $${floor.toLocaleString()} (current high $${toNum(currentHigh.amount).toLocaleString()} + minimum increment).`
              : `Bid must be at least the starting bid of $${(listing.startingBid ?? 0).toLocaleString()}.`,
        },
        { status: 400 }
      );
    }

    // Can the bidder actually cover this? Bids are not escrowed — funds only
    // move at settlement — so without this check a $0 account could bid any
    // amount. That was half of a working money-creation exploit (the other half
    // was the missing debit CAS in the manual close route): a collusive pair
    // bid an arbitrary figure and the seller was credited real cash for it.
    //
    // The settlement CAS in `settleAuction()` is still the authority, because
    // the balance can be spent between bidding and closing. This check exists
    // so a fantasy bid can't sit at the top of an auction and lock out the
    // genuine bidders who *can* pay.
    const bidder = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { cashBalance: true },
    });
    if (!bidder || toNum(bidder.cashBalance) < amount) {
      return NextResponse.json(
        {
          error: `You need $${amount.toLocaleString()} in your balance to bid this much. Available: $${toNum(bidder?.cashBalance ?? 0).toLocaleString()}.`,
        },
        { status: 400 }
      );
    }

    // Place the bid in a transaction:
    // 1) Mark all previous ACTIVE bids as OUTBID
    // 2) Insert this new ACTIVE bid
    // 3) Bump aggregate counters on the listing
    const [, newBid] = await prisma.$transaction([
      prisma.marketplaceBid.updateMany({
        where: { listingId: id, status: MarketplaceBidStatus.ACTIVE },
        data: { status: MarketplaceBidStatus.OUTBID },
      }),
      prisma.marketplaceBid.create({
        data: {
          listingId: id,
          bidderId: session.user.id,
          amount,
          status: MarketplaceBidStatus.ACTIVE,
          message: message ?? null,
        },
      }),
      prisma.marketplaceListing.update({
        where: { id },
        data: {
          bidsCount: { increment: 1 },
        },
      }),
    ]);

    // Recompute bidder count (distinct bidders on this listing)
    const distinctBidders = await prisma.marketplaceBid.findMany({
      where: { listingId: id },
      select: { bidderId: true },
      distinct: ["bidderId"],
    });
    await prisma.marketplaceListing.update({
      where: { id },
      data: { bidderCount: distinctBidders.length },
    });

    // Notify the previous high bidder that they've been outbid
    if (currentHigh && currentHigh.bidderId !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: currentHigh.bidderId,
          type: NotificationType.SYSTEM,
          title: "You've been outbid",
          message: `Someone bid $${amount.toLocaleString()} on "${listing.title}". Place a higher bid to stay in the running.`,
          data: { listingId: id, newBidAmount: amount },
        },
      });
    }
    // Notify the seller that a bid came in
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.SYSTEM,
        title: "New bid on your listing",
        message: `New bid of $${amount.toLocaleString()} on "${listing.title}".`,
        data: { listingId: id, bidAmount: amount },
      },
    });

    return NextResponse.json({
      bid: newBid,
      isHigh: true,
      reserveMet: listing.reservePrice == null || amount >= toNum(listing.reservePrice),
    });
  } catch (error) {
    console.error("Place bid failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
