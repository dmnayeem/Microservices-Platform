import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePublicMarketplace } from "@/lib/public-catalog-data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        purchases: {
          include: {
            buyer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json(
      { error: "Failed to fetch listing" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body;

    // Check if listing exists
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { seller: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Every moderation verb lands in the audit log, on the seller's account.
    const auditListing = (after: { status: string; rejectionReason?: string | null }) =>
      writeAudit({
        actorId: session.user.id,
        action: `MARKETPLACE_LISTING_${String(action).toUpperCase()}`,
        entity: "MarketplaceListing",
        entityId: id,
        targetUserId: listing.sellerId,
        summary: `${String(action).charAt(0).toUpperCase()}${String(action).slice(1)} listing "${listing.title}"${reason ? ` — ${String(reason).trim()}` : ""}`,
        meta: {
          before: { status: listing.status, rejectionReason: listing.rejectionReason },
          after: { status: after.status, rejectionReason: after.rejectionReason ?? null },
          reason: reason ? String(reason).trim() : null,
        },
      });

    if (action === "approve") {
      // Approve a pending seller listing → goes live.
      const updatedListing = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: "ACTIVE",
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          rejectionReason: null,
        },
      });
      await prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: "SYSTEM",
          title: "Listing Approved",
          message: `Your listing "${listing.title}" is approved and now live on the marketplace.`,
          data: { listingId: id, approvedBy: session.user.id },
        },
      });
      await auditListing(updatedListing);
      revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
      return NextResponse.json({
        success: true,
        listing: updatedListing,
        message: "Listing approved",
      });
    } else if (action === "reject") {
      if (!reason || !String(reason).trim()) {
        return NextResponse.json(
          { error: "A rejection reason is required" },
          { status: 400 }
        );
      }
      const updatedListing = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: String(reason).trim(),
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      });
      await prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: "SYSTEM",
          title: "Listing Rejected",
          message: `Your listing "${listing.title}" was rejected. Reason: ${String(reason).trim()}`,
          data: { listingId: id, reason: String(reason).trim(), rejectedBy: session.user.id },
        },
      });
      await auditListing(updatedListing);
      revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
      return NextResponse.json({
        success: true,
        listing: updatedListing,
        message: "Listing rejected",
      });
    } else if (action === "cancel") {
      // Cancel the listing
      const updatedListing = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: "CANCELLED",
        },
      });

      // Create a notification for the seller
      await prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: "SYSTEM",
          title: "Listing Cancelled",
          message: `Your listing "${listing.title}" has been cancelled by an administrator. Reason: ${reason}`,
          data: {
            listingId: id,
            reason,
            cancelledBy: session.user.id,
          },
        },
      });

      await auditListing(updatedListing);
      revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
      return NextResponse.json({
        success: true,
        listing: updatedListing,
        message: "Listing cancelled successfully",
      });
    } else if (action === "activate") {
      // Reactivate a cancelled or expired listing
      if (listing.status === "SOLD") {
        return NextResponse.json(
          { error: "Cannot reactivate a sold listing" },
          { status: 400 }
        );
      }

      const updatedListing = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: "ACTIVE",
        },
      });

      await auditListing(updatedListing);
      revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
      return NextResponse.json({
        success: true,
        listing: updatedListing,
        message: "Listing reactivated successfully",
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error updating listing:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}
