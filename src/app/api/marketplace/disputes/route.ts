import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { DisputeReason, DisputeStatus, NotificationType } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { toNum, toNumOrNull } from "@/lib/money";
import { getDisputeWindowDays } from "@/lib/marketplace-selling";
import { ACTIVE_DISPUTE_STATUSES } from "@/lib/marketplace-payouts";

// GET /api/marketplace/disputes - Get user's disputes
//
// Filtered through the purchase relation. This used to load the id of EVERY
// purchase the user had ever made or sold into memory and pass them back as
// an `IN (...)` list — unbounded for a busy seller — and `limit` was not
// clamped at all.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = session.user.id;

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam && (Object.values(DisputeStatus) as string[]).includes(statusParam)
        ? (statusParam as DisputeStatus)
        : null;
    const role = searchParams.get("role"); // buyer, seller, or all
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));
    const skip = (page - 1) * limit;

    const purchaseFilter: Prisma.MarketplacePurchaseWhereInput =
      role === "buyer"
        ? { buyerId: me }
        : role === "seller"
        ? { listing: { sellerId: me } }
        : { OR: [{ buyerId: me }, { listing: { sellerId: me } }] };
    const scope: Prisma.MarketplaceDisputeWhereInput = { purchase: purchaseFilter };
    const where: Prisma.MarketplaceDisputeWhereInput = status
      ? { ...scope, status }
      : scope;

    const [disputes, total, open, inReview, resolved] = await Promise.all([
      prisma.marketplaceDispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.marketplaceDispute.count({ where }),
      prisma.marketplaceDispute.count({ where: { ...scope, status: DisputeStatus.OPEN } }),
      prisma.marketplaceDispute.count({ where: { ...scope, status: DisputeStatus.IN_REVIEW } }),
      prisma.marketplaceDispute.count({
        where: {
          ...scope,
          status: {
            in: [DisputeStatus.RESOLVED_BUYER, DisputeStatus.RESOLVED_SELLER, DisputeStatus.CLOSED],
          },
        },
      }),
    ]);

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
          isMyDispute: dispute.initiatorId === me,
          myRole: purchase?.buyerId === me ? "BUYER" : "SELLER",
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: { open, inReview, resolved },
    });
  } catch (error) {
    console.error("Error fetching disputes:", error);
    return NextResponse.json(
      { error: "Failed to fetch disputes" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  purchaseId: z.string().min(1),
  reason: z.nativeEnum(DisputeReason),
  description: z.string().trim().min(10).max(5000),
  evidence: z.array(z.string().url().max(2000)).max(10).optional(),
});

// POST /api/marketplace/disputes - Create a new dispute
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const v = createSchema.safeParse(await request.json().catch(() => null));
    if (!v.success) {
      return NextResponse.json(
        {
          error:
            "Pick a reason and describe the problem (at least 10 characters).",
        },
        { status: 400 }
      );
    }
    const { purchaseId, reason, description, evidence } = v.data;

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

    // Dispute window (admin-set, Marketplace → Settings).
    const windowDays = await getDisputeWindowDays();
    if (Date.now() - purchase.createdAt.getTime() > windowDays * 86_400_000) {
      return NextResponse.json(
        {
          error: `Disputes can only be opened within ${windowDays} days of the purchase.`,
        },
        { status: 400 }
      );
    }

    // Create the dispute. The duplicate check runs INSIDE the transaction,
    // after locking the purchase row: as a separate read, two clicks both saw
    // "no active dispute" and both opened one.
    const dispute = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MarketplacePurchase" WHERE "id" = ${purchaseId} FOR UPDATE`;
      const existingDispute = await tx.marketplaceDispute.findFirst({
        where: { purchaseId, status: { in: ACTIVE_DISPUTE_STATUSES } },
        select: { id: true },
      });
      if (existingDispute) throw new Error("DISPUTE_EXISTS");

      const d = await tx.marketplaceDispute.create({
        data: {
          purchaseId,
          initiatorId: session.user.id,
          initiatorType: isBuyer ? "BUYER" : "SELLER",
          reason,
          description,
          evidence: evidence ?? [],
          status: DisputeStatus.OPEN,
        },
      });

      // Initial system message
      await tx.disputeMessage.create({
        data: {
          disputeId: d.id,
          senderId: "SYSTEM",
          senderType: "SYSTEM",
          message: `Dispute opened by ${isBuyer ? "buyer" : "seller"} for order "${listing.title}". Reason: ${reason.replace(/_/g, " ")}`,
        },
      });
      return d;
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
    if (error instanceof Error && error.message === "DISPUTE_EXISTS") {
      return NextResponse.json(
        { error: "An active dispute already exists for this purchase" },
        { status: 409 }
      );
    }
    console.error("Error creating dispute:", error);
    return NextResponse.json(
      { error: "Failed to create dispute" },
      { status: 500 }
    );
  }
}
