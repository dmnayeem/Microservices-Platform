import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { MarketplaceView } from "@/components/user/marketplace/marketplace-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";

export default async function MarketplacePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("marketplace")) return <FeatureLock title="Marketplace" />;

  // Storefronts that actually have something on sale. A shop with nothing in
  // it is a dead end, and listing it would send buyers to an empty page.
  const brands = await prisma.marketplaceBrand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: 24,
    select: { slug: true, name: true, logo: true, id: true },
  });
  const counts = await Promise.all(
    brands.map((b) =>
      prisma.marketplaceListing.count({
        where: { brandId: b.id, status: "ACTIVE" },
      })
    )
  );
  const storefronts = brands
    .map((b, i) => ({
      slug: b.slug,
      name: b.name,
      logo: b.logo,
      listingCount: counts[i],
    }))
    .filter((s) => s.listingCount > 0);

  return <MarketplaceView storefronts={storefronts} />;
}
