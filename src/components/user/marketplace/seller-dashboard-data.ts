import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { SERVICE_ASSET_TYPE } from "@/lib/marketplace-categories";
import type { SellerListing, SellerOrder } from "@/components/user/marketplace/seller-dashboard-view";
import { FUNDED_DEAL_STATUSES } from "@/lib/marketplace-deal";
import { ORDER_SENDER_TYPE, parseOrderBrief, type OrderBrief } from "@/lib/service-packages";

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

  const orders = area === "services" ? await loadActiveOrders(sellerId) : [];
  return { listings: sellerListings, pendingPayout, orders };
}

/**
 * The seller's service orders still in progress (paid into escrow, not yet
 * released or refunded), soonest due first.
 */
async function loadActiveOrders(sellerId: string): Promise<SellerOrder[]> {
  const serviceIds = await prisma.marketplaceListing.findMany({
    where: { sellerId, assetType: SERVICE_ASSET_TYPE },
    select: { id: true, title: true },
  });
  if (serviceIds.length === 0) return [];
  const titles = new Map(serviceIds.map((l) => [l.id, l.title]));
  const deals = await prisma.marketplaceDeal.findMany({
    where: {
      sellerId,
      status: { in: FUNDED_DEAL_STATUSES },
      listingId: { in: serviceIds.map((l) => l.id) },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      threadId: true,
      status: true,
      amount: true,
      buyerId: true,
      createdAt: true,
      listingId: true,
    },
  });
  if (deals.length === 0) return [];

  const [briefMsgs, buyers] = await Promise.all([
    prisma.marketplaceThreadMessage.findMany({
      where: { threadId: { in: deals.map((d) => d.threadId) }, senderType: ORDER_SENDER_TYPE },
      select: { body: true },
    }),
    prisma.user.findMany({
      where: { id: { in: Array.from(new Set(deals.map((d) => d.buyerId))) } },
      select: { id: true, name: true },
    }),
  ]);
  const briefs = new Map<string, OrderBrief>();
  for (const m of briefMsgs) {
    const b = parseOrderBrief(m.body);
    if (b) briefs.set(b.dealId, b);
  }
  const buyerName = new Map(buyers.map((u) => [u.id, u.name]));

  return deals
    .map((d) => {
      const b = briefs.get(d.id);
      return {
        dealId: d.id,
        threadId: d.threadId,
        title: titles.get(d.listingId) ?? "Service",
        status: d.status as SellerOrder["status"],
        amount: toNum(d.amount),
        tierName: b?.tier.name ?? null,
        dueAt: b?.dueAt ?? null,
        buyerName: buyerName.get(d.buyerId) ?? null,
        orderedAt: d.createdAt.toISOString(),
      };
    })
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
}
