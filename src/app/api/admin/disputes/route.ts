import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DisputeStatus } from "@/generated/prisma";

// GET /api/admin/disputes - Get all disputes for admin
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.disputes"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as DisputeStatus | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};
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

    // Get related data
    const purchaseIds = disputes.map((d) => d.purchaseId);
    const purchases = await prisma.marketplacePurchase.findMany({
      where: { id: { in: purchaseIds } },
      select: { id: true, amount: true, listingId: true, buyerId: true },
    });
    const purchaseMap = new Map(purchases.map((p) => [p.id, p]));

    // Get listings
    const listingIds = [...new Set(purchases.map((p) => p.listingId))];
    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, title: true, sellerId: true },
    });
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    // Get users
    const userIds = [
      ...new Set([
        ...disputes.map((d) => d.initiatorId),
        ...purchases.map((p) => p.buyerId),
        ...listings.map((l) => l.sellerId),
      ]),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      disputes: disputes.map((dispute) => {
        const purchase = purchaseMap.get(dispute.purchaseId);
        const listing = purchase ? listingMap.get(purchase.listingId) : null;
        const buyer = purchase ? userMap.get(purchase.buyerId) : null;
        const seller = listing ? userMap.get(listing.sellerId) : null;
        const initiator = userMap.get(dispute.initiatorId);

        return {
          id: dispute.id,
          purchase: {
            id: dispute.purchaseId,
            amount: purchase?.amount || 0,
            listing: {
              id: listing?.id || "",
              title: listing?.title || "Unknown",
            },
          },
          buyer: {
            id: purchase?.buyerId || "",
            name: buyer?.name || "Unknown",
            email: buyer?.email || "",
          },
          seller: {
            id: listing?.sellerId || "",
            name: seller?.name || "Unknown",
            email: seller?.email || "",
          },
          initiator: {
            id: dispute.initiatorId,
            name: initiator?.name || "Unknown",
            type: dispute.initiatorType,
          },
          reason: dispute.reason,
          description: dispute.description,
          status: dispute.status,
          assignedAdminId: dispute.assignedAdminId,
          createdAt: dispute.createdAt,
          resolvedAt: dispute.resolvedAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        open: await prisma.marketplaceDispute.count({ where: { status: DisputeStatus.OPEN } }),
        inReview: await prisma.marketplaceDispute.count({ where: { status: DisputeStatus.IN_REVIEW } }),
        escalated: await prisma.marketplaceDispute.count({ where: { status: DisputeStatus.ESCALATED } }),
        resolved: await prisma.marketplaceDispute.count({
          where: {
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
