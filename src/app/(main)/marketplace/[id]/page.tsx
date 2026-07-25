import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { ListingDetailView } from "@/components/user/marketplace/listing-detail-view";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          avatar: true,
          username: true,
          createdAt: true,
          _count: { select: { marketplaceListings: true } },
        },
      },
      _count: { select: { purchases: true, watches: true } },
    },
  });
  if (!listing) notFound();

  const isOwner = listing.sellerId === session.user.id;
  const hideFinancials = listing.ndaGated && !isOwner;

  const [isWatched, _viewBumped] = await Promise.all([
    prisma.marketplaceWatch
      .findUnique({
        where: {
          userId_listingId: { userId: session.user.id, listingId: id },
        },
      })
      .then((w) => !!w),
    // We DON'T server-side increment views here — the detail view will POST
    // to /api/marketplace/listings/[id]/view on mount, deduping by sessionHash.
    Promise.resolve(null),
  ]);
  void _viewBumped;

  type Counts = { purchases: number; watches: number };
  const counts = (listing as unknown as { _count: Counts })._count;
  const sellerCount = (
    listing.seller as unknown as { _count: { marketplaceListings: number } }
  )._count;

  return (
    <ListingDetailView
      listing={{
        id: listing.id,
        title: listing.title,
        description: listing.description,
        richDescription: listing.richDescription,
        category: listing.category,
        assetType: listing.assetType,
        subType: listing.subType,
        details: listing.details as Record<string, unknown> | null,
        price: toNum(listing.price),
        currency: listing.currency,
        images: listing.images,
        screenshots: listing.screenshots,
        attachments: listing.attachments,
        status: listing.status,
        views: listing.views,
        uniqueViewers: listing.uniqueViewers,
        watchCount: counts.watches,
        salesCount: counts.purchases,
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
        ndaGated: listing.ndaGated,
        nsfw: listing.nsfw,
        auctionMode: listing.auctionMode,
        startingBid: toNumOrNull(listing.startingBid),
        reservePrice: hideFinancials ? null : toNumOrNull(listing.reservePrice),
        buyNowPrice: toNumOrNull(listing.buyNowPrice),
        auctionEndsAt: listing.auctionEndsAt
          ? listing.auctionEndsAt.toISOString()
          : null,
        isFeatured: listing.isFeatured,
        isPromoted: listing.isPromoted,
        createdAt: listing.createdAt.toISOString(),
        seller: {
          id: listing.seller.id,
          name: listing.seller.name,
          avatar: listing.seller.avatar,
          username: listing.seller.username,
          memberSince: listing.seller.createdAt.toISOString(),
          totalListings: sellerCount.marketplaceListings,
        },
      }}
      isOwner={isOwner}
      isWatched={isWatched}
      hideFinancials={hideFinancials}
      viewerId={session.user.id}
    />
  );
}
