import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum, toNumOrNull } from "@/lib/money";
import { z } from "zod";
import { revalidatePublicMarketplace } from "@/lib/public-catalog-data";
import { readTiers } from "@/lib/marketplace-selling";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateListingSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  category: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  images: z.array(z.string().url()).optional(),
  files: z.array(z.string().url()).optional(),
  status: z.enum(["ACTIVE", "SOLD", "CANCELLED", "EXPIRED"]).optional(),
});

// GET /api/admin/marketplace/listings/[id] - Get a single listing
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.manage"))) {
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
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({
      listing: {
        ...listing,
        price: toNum(listing.price),
        monthlyRevenue: toNumOrNull(listing.monthlyRevenue),
        monthlyProfit: toNumOrNull(listing.monthlyProfit),
        monthlyExpenses: toNumOrNull(listing.monthlyExpenses),
        startingBid: toNumOrNull(listing.startingBid),
        reservePrice: toNumOrNull(listing.reservePrice),
        buyNowPrice: toNumOrNull(listing.buyNowPrice),
      },
    });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json(
      { error: "Failed to fetch listing" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/marketplace/listings/[id] - Update a listing
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if listing exists
    const existingListing = await prisma.marketplaceListing.findUnique({
      where: { id },
    });

    if (!existingListing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const validation = updateListingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const tiers = readTiers(existingListing.licenseTiers);

    // Update the listing
    const listing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.category && { category: data.category }),
        ...(data.price !== undefined && { price: data.price }),
        // Headline price = cheapest licence tier, on every write (an admin
        // price edit on a tiered listing would otherwise drift from checkout).
        ...(tiers.length > 0 && { price: tiers[0].price }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.files !== undefined && { files: data.files }),
        ...(data.status && { status: data.status }),
      },
    });

    await writeAudit({ actorId: session.user.id, action: "MARKETPLACE_LISTING_UPDATED", entity: "MarketplaceListing",
      entityId: id, targetUserId: existingListing.sellerId, summary: `Edited listing "${listing.title}"`,
      meta: { before: existingListing, after: listing } });
    revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
    return NextResponse.json({
      message: "Listing updated successfully",
      listing,
    });
  } catch (error) {
    console.error("Error updating listing:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/marketplace/listings/[id] - Delete a listing
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if listing exists
    const existingListing = await prisma.marketplaceListing.findUnique({
      where: { id },
    });

    if (!existingListing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Delete the listing
    await prisma.marketplaceListing.delete({
      where: { id },
    });
    await writeAudit({ actorId: session.user.id, action: "MARKETPLACE_LISTING_DELETED", entity: "MarketplaceListing",
      entityId: id, targetUserId: existingListing.sellerId, summary: `Deleted listing "${existingListing.title}"`,
      meta: { before: existingListing, after: null } });

    revalidatePublicMarketplace(); // public catalog pages (lib/public-catalog-data.ts)
    return NextResponse.json({
      success: true,
      message: "Listing deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting listing:", error);
    return NextResponse.json(
      { error: "Failed to delete listing" },
      { status: 500 }
    );
  }
}
