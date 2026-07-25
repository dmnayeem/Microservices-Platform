import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisputeReason, DisputeStatus, NotificationType } from "@/generated/prisma";
import { toNum, toNumOrNull } from "@/lib/money";

// GET /api/marketplace/disputes - Get user's disputes
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as DisputeStatus | null;
    const role = searchParams.get("role"); // buyer, seller, or all
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Get user's purchases (as buyer) and sales (as seller)
    const [userPurchases, userListings] = await Promise.all([
      prisma.marketplacePurchase.findMany({
        where: { buyerId: session.user.id },
        select: { id: true },
      }),
      prisma.marketplaceListing.findMany({
        where: { sellerId: session.user.id },
        select: { id: true, purchases: { select: { id: true } } },
      }),
    ]);

    const buyerPurchaseIds = userPurchases.map((p) => p.id);
    const sellerPurchaseIds = userListings.flatMap((l) =>
      l.purchases.map((p) => p.id)
    );

    // Build query based on role filter
    let purchaseIds: string[] = [];
    if (role === "buyer") {
      purchaseIds = buyerPurchaseIds;
    } else if (role === "seller") {
      purchaseIds = sellerPurchaseIds;
    } else {
      purchaseIds = [...new Set([...buyerPurchaseIds, ...sellerPurchaseIds])];
    }

    const where: Record<string, unknown> = {
      purchaseId: { in: purchaseIds },
    };

    if (status) {
      where.status = status;
    }

    // Get disputes
    const disputes = await prisma.marketplaceDispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const total = await prisma.marketplaceDispute.count({ where });

    // Get related purchase and listing info
    const relatedPurchaseIds = disputes.map((d) => d.purchaseId);
    const purchases = await prisma.marketplacePurchase.findMany({
      where: { id: { in: relatedPurchaseIds } },
      select: {
        id: true,
        amount: true,
        listingId: true,
        buyerId: true,
      },
    });
    const purchaseMap = new Map(purchases.map((p) => [p.id, p]));

    // Get listings
    const listingIds = [...new Set(purchases.map((p) => p.listingId))];
    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds } },
      select: {
        id: true,
        title: true,
        images: true,
        sellerId: true,
      },
    });
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    // Get user info for initiators
    const userIds = [...new Set(disputes.map((d) => d.initiatorId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      disputes: disputes.map((dispute) => {
        const purchase = purchaseMap.get(dispute.purchaseId);
        const listing = purchase ? listingMap.get(purchase.listingId) : null;
        const initiator = userMap.get(dispute.initiatorId);

        return {
          id: dispute.id,
          purchase: {
            id: dispute.purchaseId,
            amount: toNum(purchase?.amount),
            listing: {
              id: listing?.id || "",
              title: listing?.title || "Unknown",
              image: listing?.images?.[0] || null,
            },
          },
          initiator: {
            id: dispute.initiatorId,
            name: initiator?.name || "Unknown",
            avatar: initiator?.avatar,
            type: dispute.initiatorType,
          },
          reason: dispute.reason,
          description: dispute.description,
          evidence: dispute.evidence,
          status: dispute.status,
          resolution: dispute.resolution,
          resolvedAmount: toNumOrNull(dispute.resolvedAmount),
          createdAt: dispute.createdAt,
          resolvedAt: dispute.resolvedAt,
          isMyDispute: dispute.initiatorId === session.user.id,
          myRole: buyerPurchaseIds.includes(dispute.purchaseId)
            ? "BUYER"
            : "SELLER",
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        open: await prisma.marketplaceDispute.count({
          where: { purchaseId: { in: purchaseIds }, status: DisputeStatus.OPEN },
        }),
        inReview: await prisma.marketplaceDispute.count({
          where: {
            purchaseId: { in: purchaseIds },
            status: DisputeStatus.IN_REVIEW,
          },
        }),
        resolved: await prisma.marketplaceDispute.count({
          where: {
            purchaseId: { in: purchaseIds },
            status: { in: [DisputeStatus.RESOLVED_BUYER, DisputeStatus.RESOLVED_SELLER, DisputeStatus.CLOSED] },
          },
        }),
      },
    });
  } catch (error) {
    console.error("Error fetching disputes:", error);
    return NextResponse.json(
      { error: "Failed to fetch disputes" },
      { status: 500 }
    );
  }
}

// POST /api/marketplace/disputes - Create a new dispute
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { purchaseId, reason, description, evidence } = body;

    // Validate required fields
    if (!purchaseId || !reason || !description) {
      return NextResponse.json(
        { error: "Purchase ID, reason, and description are required" },
        { status: 400 }
      );
    }

    // Validate reason
    if (!Object.values(DisputeReason).includes(reason)) {
      return NextResponse.json({ error: "Invalid dispute reason" }, { status: 400 });
    }

    // Get the purchase
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Get listing to check seller
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: purchase.listingId },
      select: { id: true, title: true, sellerId: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Check if user is buyer or seller
    const isBuyer = purchase.buyerId === session.user.id;
    const isSeller = listing.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "You are not authorized to dispute this purchase" },
        { status: 403 }
      );
    }

    // Check if dispute already exists for this purchase
    const existingDispute = await prisma.marketplaceDispute.findFirst({
      where: {
        purchaseId,
        status: { notIn: [DisputeStatus.CLOSED, DisputeStatus.RESOLVED_BUYER, DisputeStatus.RESOLVED_SELLER] },
      },
    });

    if (existingDispute) {
      return NextResponse.json(
        { error: "An active dispute already exists for this purchase" },
        { status: 400 }
      );
    }

    // Create the dispute
    const dispute = await prisma.marketplaceDispute.create({
      data: {
        purchaseId,
        initiatorId: session.user.id,
        initiatorType: isBuyer ? "BUYER" : "SELLER",
        reason: reason as DisputeReason,
        description,
        evidence: evidence || [],
        status: DisputeStatus.OPEN,
      },
    });

    // Create initial system message
    await prisma.disputeMessage.create({
      data: {
        disputeId: dispute.id,
        senderId: "SYSTEM",
        senderType: "SYSTEM",
        message: `Dispute opened by ${isBuyer ? "buyer" : "seller"} for order "${listing.title}". Reason: ${reason.replace(/_/g, " ")}`,
      },
    });

    // Notify the other party
    const otherPartyId = isBuyer ? listing.sellerId : purchase.buyerId;
    await prisma.notification.create({
      data: {
        userId: otherPartyId,
        type: NotificationType.SYSTEM,
        title: "Dispute Filed Against Your Order",
        message: `A dispute has been filed for "${listing.title}". Reason: ${reason.replace(/_/g, " ")}. Please respond within 48 hours.`,
        data: {
          disputeId: dispute.id,
          purchaseId,
          listingTitle: listing.title,
          reason,
        },
      },
    });

    return NextResponse.json({
      dispute: {
        id: dispute.id,
        purchaseId: dispute.purchaseId,
        reason: dispute.reason,
        description: dispute.description,
        status: dispute.status,
        createdAt: dispute.createdAt,
      },
      message: "Dispute created successfully. The other party has been notified.",
    });
  } catch (error) {
    console.error("Error creating dispute:", error);
    return NextResponse.json(
      { error: "Failed to create dispute" },
      { status: 500 }
    );
  }
}
