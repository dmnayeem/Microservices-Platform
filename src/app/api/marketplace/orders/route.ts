import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// GET /api/marketplace/orders - Get user's orders
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") || "buyer"; // buyer or seller
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));
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

// POST /api/marketplace/orders (a legacy "buy now" path) was removed. Nothing
// called it, and it settled sales outside the real checkout
// (/api/marketplace/[id]/checkout): no licence-tier pricing, no tax, no payout
// hold, and a seller ledger reference that collided across sales.
