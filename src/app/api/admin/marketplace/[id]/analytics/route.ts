import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";

// GET /api/admin/marketplace/:id/analytics
// Aggregates the per-listing engagement funnel:
//   views → unique viewers → watches → bids → offers → purchases
// Plus a 14-day daily view chart from MarketplaceListingView.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "marketplace.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        assetType: true,
        subType: true,
        status: true,
        price: true,
        views: true,
        uniqueViewers: true,
        bidsCount: true,
        bidderCount: true,
        directPurchasesCount: true,
        auctionMode: true,
        auctionEndsAt: true,
        isFeatured: true,
        featuredUntil: true,
        isPromoted: true,
        promotedUntil: true,
        verifiedMetrics: true,
        createdAt: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // 14-day daily view series
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const viewRows = await prisma.marketplaceListingView.findMany({
      where: { listingId: id, viewedAt: { gte: since } },
      select: { viewedAt: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const v of viewRows) {
      const key = v.viewedAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const viewsByDay = Array.from(buckets.entries()).map(([date, views]) => ({
      date,
      views,
    }));

    // Aggregate counts on related models — direct counts since the listing has them stored
    const [watchCount, offerCount, distinctOfferers, purchaseCount, bidStatusBreakdown] =
      await Promise.all([
        prisma.marketplaceWatch.count({ where: { listingId: id } }),
        prisma.marketplaceOffer.count({ where: { listingId: id } }),
        prisma.marketplaceOffer.findMany({
          where: { listingId: id },
          distinct: ["buyerId"],
          select: { buyerId: true },
        }),
        prisma.marketplacePurchase.count({ where: { listingId: id } }),
        prisma.marketplaceBid.groupBy({
          by: ["status"],
          where: { listingId: id },
          _count: { _all: true },
        }),
      ]);

    const bidByStatus = Object.fromEntries(
      (bidStatusBreakdown as unknown as Array<{
        status: string;
        _count: { _all: number };
      }>).map((r) => [r.status, r._count._all])
    ) as Record<string, number>;

    // Recent offers + bids (10 each) for review
    const [recentBids, recentOffers] = await Promise.all([
      prisma.marketplaceBid.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          bidder: { select: { id: true, name: true, username: true, avatar: true } },
        },
      }),
      prisma.marketplaceOffer.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          buyer: { select: { id: true, name: true, username: true, avatar: true } },
        },
      }),
    ]);

    return NextResponse.json({
      listing,
      totals: {
        views: listing.views,
        uniqueViewers: listing.uniqueViewers,
        watches: watchCount,
        bids: listing.bidsCount,
        distinctBidders: listing.bidderCount,
        offers: offerCount,
        distinctOfferers: distinctOfferers.length,
        purchases: purchaseCount,
      },
      bidByStatus,
      viewsByDay,
      recentBids: (recentBids as unknown as Array<{
        id: string;
        amount: number;
        status: string;
        createdAt: Date;
        bidder: {
          id: string;
          name: string | null;
          username: string | null;
          avatar: string | null;
        };
      }>).map((b) => ({
        id: b.id,
        amount: toNum(b.amount),
        status: b.status,
        createdAt: b.createdAt,
        bidder: {
          id: b.bidder.id,
          name: b.bidder.name ?? b.bidder.username ?? "Anonymous",
          avatar: b.bidder.avatar,
        },
      })),
      recentOffers: (recentOffers as unknown as Array<{
        id: string;
        amount: number;
        status: string;
        counterAmount: number | null;
        createdAt: Date;
        buyer: {
          id: string;
          name: string | null;
          username: string | null;
          avatar: string | null;
        };
      }>).map((o) => ({
        id: o.id,
        amount: toNum(o.amount),
        counterAmount: toNumOrNull(o.counterAmount),
        status: o.status,
        createdAt: o.createdAt,
        buyer: {
          id: o.buyer.id,
          name: o.buyer.name ?? o.buyer.username ?? "Anonymous",
          avatar: o.buyer.avatar,
        },
      })),
    });
  } catch (error) {
    console.error("Marketplace analytics failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
