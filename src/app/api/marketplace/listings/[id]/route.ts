import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MarketplaceListingStatus } from "@/generated/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { isAffiliateEligible, formatAffiliateReward } from "@/lib/affiliate";
import { hasPermission } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma";

// GET /api/marketplace/listings/:id - Get listing details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            avatar: true,
            level: true,
            createdAt: true,
            _count: { select: { marketplaceListings: true } },
          },
        },
        _count: { select: { purchases: true, watches: true } },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (
      listing.status !== MarketplaceListingStatus.ACTIVE &&
      listing.sellerId !== session?.user?.id
    ) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    // Increment lightweight `views` counter on every fetch. Unique-viewer
    // tracking with sessionHash dedupe lives in `/api/marketplace/listings/[id]/view`.
    await prisma.marketplaceListing.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    // Is the viewer watching this listing? Also: is the viewer an approved
    // affiliate (gates the commission figure below)?
    let isWatched = false;
    let viewerIsAffiliate = false;
    if (session?.user?.id) {
      const [w, me] = await Promise.all([
        prisma.marketplaceWatch.findUnique({
          where: { userId_listingId: { userId: session.user.id, listingId: id } },
        }),
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { affiliateJoinedAt: true },
        }),
      ]);
      isWatched = !!w;
      viewerIsAffiliate = !!me?.affiliateJoinedAt;
    }

    // NDA-gated financials: hide revenue numbers from non-owners until signed.
    const isOwner = session?.user?.id === listing.sellerId;
    const hideFinancials = listing.ndaGated && !isOwner;

    // Deliverable files are private: only the seller (owner) or a marketplace
    // admin may see the raw URLs here. Buyers receive them post-purchase via the
    // gated `/download` route — never expose them to arbitrary viewers.
    const canSeeFiles =
      isOwner ||
      (!!session?.user?.role &&
        hasPermission(session.user.role as UserRole, "marketplace.manage"));

    return NextResponse.json({
      listing: {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        richDescription: listing.richDescription,
        images: listing.images,
        screenshots: listing.screenshots,
        attachments: listing.attachments,
        files: canSeeFiles ? listing.files : [],
        category: listing.category,
        assetType: listing.assetType,
        affiliateEligible: isAffiliateEligible(
          listing.affiliateCommissionType,
          toNumOrNull(listing.affiliateCommissionValue)
        ),
        // Affiliate-only commission figure — null for non-affiliates.
        affiliateReward: viewerIsAffiliate
          ? formatAffiliateReward(
              listing.affiliateCommissionType,
              toNumOrNull(listing.affiliateCommissionValue)
            )
          : null,
        subType: listing.subType,
        details: listing.details,
        price: toNum(listing.price),
        currency: listing.currency,
        status: listing.status,
        views: listing.views + 1,
        uniqueViewers: listing.uniqueViewers,
        salesCount: listing._count.purchases,
        watchCount: listing._count.watches,
        directPurchasesCount: listing.directPurchasesCount,
        bidsCount: listing.bidsCount,
        bidderCount: listing.bidderCount,
        monthlyRevenue: hideFinancials ? null : toNumOrNull(listing.monthlyRevenue),
        monthlyProfit: hideFinancials ? null : toNumOrNull(listing.monthlyProfit),
        monthlyExpenses: hideFinancials ? null : toNumOrNull(listing.monthlyExpenses),
        monthlyTraffic: listing.monthlyTraffic,
        assetAgeMonths: listing.assetAgeMonths,
        niche: listing.niche,
        reasonsForSelling: listing.reasonsForSelling,
        whatsIncluded: listing.whatsIncluded,
        whatsNotIncluded: listing.whatsNotIncluded,
        verifiedMetrics: listing.verifiedMetrics,
        nsfw: listing.nsfw,
        ndaGated: listing.ndaGated,
        auctionMode: listing.auctionMode,
        startingBid: toNumOrNull(listing.startingBid),
        reservePrice: hideFinancials ? null : toNumOrNull(listing.reservePrice),
        buyNowPrice: toNumOrNull(listing.buyNowPrice),
        auctionEndsAt: listing.auctionEndsAt,
        isFeatured: listing.isFeatured,
        isPromoted: listing.isPromoted,
        createdAt: listing.createdAt,
        expiresAt: listing.expiresAt,
      },
      seller: {
        id: listing.seller.id,
        name: listing.seller.name,
        avatar: listing.seller.avatar,
        level: listing.seller.level,
        memberSince: listing.seller.createdAt,
        totalListings: listing.seller._count.marketplaceListings,
      },
      isOwner,
      isWatched,
    });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json(
      { error: "Failed to fetch listing" },
      { status: 500 }
    );
  }
}

// PUT /api/marketplace/listings/:id - Update listing
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Get listing and verify ownership
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.sellerId !== session.user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Extract allowed update fields
    const { title, description, images, files, price, category } = body;

    // Update listing
    const updatedListing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(images !== undefined && { images }),
        ...(files !== undefined && { files }),
        ...(price !== undefined && { price }),
        ...(category !== undefined && { category }),
      },
    });

    return NextResponse.json({
      listing: updatedListing,
      message: "Listing updated successfully",
    });
  } catch (error) {
    console.error("Error updating listing:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}

// DELETE /api/marketplace/listings/:id - Delete listing
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get listing and verify ownership
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.sellerId !== session.user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Mark as cancelled instead of hard delete
    await prisma.marketplaceListing.update({
      where: { id },
      data: { status: MarketplaceListingStatus.CANCELLED },
    });

    return NextResponse.json({
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
