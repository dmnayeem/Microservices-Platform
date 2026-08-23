import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { can } from "@/lib/permissions";
import { MarketplaceListingStatus } from "@/generated/prisma";
import { settleAuction } from "@/lib/marketplace-auctions";

// POST /api/marketplace/listings/:id/close-auction
//
// Manual close, for when the auto-close cron hasn't run yet. The settlement
// itself lives in `settleAuction()` — see the note there for what this route
// used to do instead.
//
// Authorization: the listing owner OR an admin with `marketplace.manage`.
// The owner may only close once `auctionEndsAt` has passed; an admin may force
// an early close. Without that rule a seller could take a collusive bid and
// settle it on the spot, before any genuine bidder had a chance to respond.
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

    // `can()`, not the synchronous `hasPermission(role, …)`: this moves money,
    // and the role-only check ignores custom roles and per-user grants.
    const isAdmin = await can(session.user.id, "marketplace.manage");
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
    if (
      !isAdmin &&
      listing.auctionEndsAt != null &&
      listing.auctionEndsAt.getTime() > Date.now()
    ) {
      return NextResponse.json(
        {
          error: `This auction doesn't end until ${listing.auctionEndsAt.toISOString()}. It will close on its own.`,
        },
        { status: 400 }
      );
    }

    const result = await settleAuction(listing);

    if (result.outcome === "expired") {
      return NextResponse.json({
        closed: true,
        winner: null,
        reason: result.reason,
      });
    }
    return NextResponse.json({
      closed: true,
      winner: { userId: result.winnerId, amount: result.amount },
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
