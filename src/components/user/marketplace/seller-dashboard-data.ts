import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { SERVICE_ASSET_TYPE } from "@/lib/marketplace-categories";
import type { SellerListing } from "@/components/user/marketplace/seller-dashboard-view";

/**
 * A seller's own listings for the seller dashboard — products for
 * /marketplace/my, services for /services/my — plus the money still inside
 * the payout hold for those listings.
 */
export async function loadSellerDashboard(sellerId: string, area: "products" | "services") {
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      sellerId,
      assetType: area === "services" ? SERVICE_ASSET_TYPE : { not: SERVICE_ASSET_TYPE },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all purchases for these listings in one query, aggregate in memory
  const purchases = listings.length
    ? await prisma.marketplacePurchase.findMany({
        where: { listingId: { in: listings.map((l) => l.id) } },
        select: { listingId: true, sellerAmount: true },
      })
    : [];

  // Sales money still inside the payout hold. Queried unconditionally: with
  // the hold off no payout rows exist, so this is an empty aggregate and the
  // tile stays hidden.
  const heldWhere = {
    sellerId,
    status: "HELD",
    purchase: { listingId: { in: listings.map((l) => l.id) } },
  };
  const heldAgg = await prisma.marketplacePayout.aggregate({
    where: heldWhere,
    _sum: { amount: true },
    _count: { _all: true },
  });
  const nextRelease = await prisma.marketplacePayout.findFirst({
    where: heldWhere,
    orderBy: { releaseAt: "asc" },
    select: { releaseAt: true },
  });
  const pendingPayout = {
    amount: Number(heldAgg._sum.amount ?? 0),
    count: heldAgg._count._all,
    nextReleaseAt: nextRelease?.releaseAt.toISOString() ?? null,
  };

  const salesMap = new Map<string, { count: number; earned: number }>();
  for (const p of purchases) {
    const cur = salesMap.get(p.listingId) ?? { count: 0, earned: 0 };
    cur.count += 1;
    cur.earned += Number(p.sellerAmount);
    salesMap.set(p.listingId, cur);
  }

  const sellerListings: SellerListing[] = listings.map((l) => {
    const sales = salesMap.get(l.id);
    return {
      id: l.id,
      title: l.title,
      category: l.category,
      price: toNum(l.price),
      images: l.images,
      views: l.views,
      status: l.status,
      salesCount: sales?.count ?? 0,
      totalEarned: sales?.earned ?? 0,
      createdAt: l.createdAt.toISOString(),
      rejectionReason: l.rejectionReason,
      featuredUntil: l.featuredUntil?.toISOString() ?? null,
    };
  });

  return { listings: sellerListings, pendingPayout };
}
