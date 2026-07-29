import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  SellerDashboardView,
  type SellerListing,
} from "@/components/user/marketplace/seller-dashboard-view";

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listings = await prisma.marketplaceListing.findMany({
    where: { sellerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all purchases for these listings in one query, aggregate in memory
  const purchases = listings.length
    ? await prisma.marketplacePurchase.findMany({
        where: { listingId: { in: listings.map((l) => l.id) } },
        select: { listingId: true, sellerAmount: true },
      })
    : [];

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

  return <SellerDashboardView listings={sellerListings} />;
}
