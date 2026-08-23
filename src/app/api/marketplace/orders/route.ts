import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import {
  MarketplaceListingStatus,
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

// Platform fee percentage
const PLATFORM_FEE_PERCENT = 5;

// GET /api/marketplace/orders - Get user's orders
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") || "buyer"; // buyer or seller
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build query based on role
    const where: Record<string, unknown> =
      role === "seller"
        ? { listing: { sellerId: session.user.id } }
        : { buyerId: session.user.id };

    const [purchases, total] = await Promise.all([
      prisma.marketplacePurchase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.marketplacePurchase.count({ where }),
    ]);

    // Get listing info
    const listingIds = [...new Set(purchases.map((p) => p.listingId))];
    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds } },
      select: {
        id: true,
        title: true,
        images: true,
        price: true,
        sellerId: true,
      },
    });
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    // Get buyer and seller info
    const buyerIds = [...new Set(purchases.map((p) => p.buyerId))];
    const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
    const userIds = [...new Set([...buyerIds, ...sellerIds])];

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Format purchases
    const formattedPurchases = purchases.map((purchase) => {
      const listing = listingMap.get(purchase.listingId);
      return {
        id: purchase.id,
        listing: listing
          ? {
              id: listing.id,
              title: listing.title,
              image: listing.images[0] || null,
              price: toNum(listing.price),
            }
          : null,
        amount: toNum(purchase.amount),
        fee: toNum(purchase.fee),
        sellerAmount: toNum(purchase.sellerAmount),
        status: purchase.status,
        createdAt: purchase.createdAt,
        buyer: role === "seller" ? userMap.get(purchase.buyerId) : undefined,
        seller: role === "buyer" && listing ? userMap.get(listing.sellerId) : undefined,
      };
    });

    return NextResponse.json({
      purchases: formattedPurchases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}

// POST /api/marketplace/orders - Create a purchase
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { listingId } = body;

    if (!listingId) {
      return NextResponse.json(
        { error: "Listing ID is required" },
        { status: 400 }
      );
    }

    // Get listing
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        seller: {
          select: { id: true, name: true },
        },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This listing is not available for purchase" },
        { status: 400 }
      );
    }

    // Can't buy own listing
    if (listing.sellerId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot purchase your own listing" },
        { status: 400 }
      );
    }

    // Check buyer balance
    const buyer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pointsBalance: true },
    });

    const pointsPerUsd = await getPointsPerUsd();
    const priceNum = toNum(listing.price);
    const totalCost = Math.ceil(priceNum * pointsPerUsd); // Convert to points
    const fee = priceNum * (PLATFORM_FEE_PERCENT / 100);
    const sellerAmount = priceNum - fee;

    if (!buyer || buyer.pointsBalance < totalCost) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    // Interactive, not the array form: the array form runs every statement
    // unconditionally, so neither the buyer's balance nor the listing's
    // availability could be re-checked once the transaction had opened. Both
    // checks above are outside it — two concurrent buys passed both and the
    // same listing was sold twice, from a balance that only covered one.
    const purchase = await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: session.user.id, pointsBalance: { gte: totalCost } },
        data: { pointsBalance: { decrement: totalCost } },
      });
      if (paid.count === 0) throw new Error("INSUFFICIENT_BALANCE");

      const claimed = await tx.marketplaceListing.updateMany({
        where: { id: listingId, status: MarketplaceListingStatus.ACTIVE },
        data: { status: MarketplaceListingStatus.SOLD },
      });
      if (claimed.count === 0) throw new Error("LISTING_TAKEN");

      const p = await tx.marketplacePurchase.create({
        data: {
          listingId,
          buyerId: session.user.id,
          amount: listing.price,
          fee,
          sellerAmount,
          status: "COMPLETED",
        },
      });
      await tx.user.update({
        where: { id: listing.sellerId },
        data: {
          pointsBalance: { increment: Math.ceil(sellerAmount * pointsPerUsd) },
          totalEarnings: { increment: sellerAmount },
        },
      });
      await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          points: -totalCost,
          amount: -listing.price,
          description: `Purchased: ${listing.title}`,
          reference: `purchase_${listingId}`,
          metadata: { listingId },
        },
      });
      await tx.transaction.create({
        data: {
          userId: listing.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points: Math.ceil(sellerAmount * pointsPerUsd),
          amount: sellerAmount,
          description: `Sale: ${listing.title}`,
          reference: `sale_${listingId}`,
          metadata: {
            listingId,
            buyerId: session.user.id,
            platformFee: fee,
          },
        },
      });
      return p;
    });

    // Notify seller
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.WALLET,
        title: "Item Sold!",
        message: `Your listing "${listing.title}" has been purchased for ${usd(listing.price)}.`,
        data: { purchaseId: purchase.id, listingId },
      },
    });

    return NextResponse.json({
      purchase: {
        id: purchase.id,
        amount: toNum(purchase.amount),
        status: purchase.status,
        createdAt: purchase.createdAt,
      },
      message: "Purchase completed successfully",
    });
  } catch (error) {
    // Retry/double-submit reuses reference `purchase_<listingId>`/`sale_<listingId>`
    // → P2002; the order already settled, so report success not a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ duplicate: true, message: "Purchase already completed" });
    }
    // Raised by the compare-and-sets above. Nothing was charged either way —
    // the whole transaction rolled back.
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        {
          error:
            "Your balance changed while this was going through, so nothing was charged. Check your wallet and try again.",
        },
        { status: 402 }
      );
    }
    if (error instanceof Error && error.message === "LISTING_TAKEN") {
      return NextResponse.json(
        { error: "This listing was just purchased by someone else." },
        { status: 409 }
      );
    }
    console.error("Error creating purchase:", error);
    return NextResponse.json(
      { error: "Failed to complete purchase" },
      { status: 500 }
    );
  }
}
