import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { usd } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { ArrowLeft, Globe, Package } from "lucide-react";
import { ASSET_TYPE_LABEL } from "@/lib/marketplace-categories";

export const dynamic = "force-dynamic";

/**
 * Public storefront for one brand — "show me everything this company sells".
 *
 * Deactivating a brand hides the storefront but leaves its listings reachable
 * by their own URLs, because a buyer who already paid still needs the listing
 * page to download from.
 */
export default async function BrandStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("marketplace")) return <FeatureLock title="Marketplace" />;

  const { slug } = await params;
  const brand = await prisma.marketplaceBrand.findUnique({ where: { slug } });
  if (!brand || !brand.isActive) notFound();

  const listings = await prisma.marketplaceListing.findMany({
    where: { brandId: brand.id, status: "ACTIVE" },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      price: true,
      images: true,
      assetType: true,
      niche: true,
    },
  });

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-6xl mx-auto">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-(--app-ink-3) hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Marketplace
      </Link>

      <section className="glass rounded-xl p-5 flex items-start gap-4">
        <Avatar src={brand.logo} size={64} fallbackText={brand.name.charAt(0).toUpperCase()} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white">{brand.name}</h1>
          {brand.bio && <p className="text-sm text-(--app-ink-2) mt-1">{brand.bio}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] text-(--app-ink-3)">
            <span className="inline-flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              {listings.length} listing{listings.length === 1 ? "" : "s"}
            </span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-white"
              >
                <Globe className="w-3.5 h-3.5" />
                Website
              </a>
            )}
          </div>
        </div>
      </section>

      {listings.length === 0 ? (
        <p className="text-sm text-(--app-ink-3)">Nothing on sale from this store yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/marketplace/${l.id}`}
              className="glass rounded-xl overflow-hidden hover:ring-1 hover:ring-(--app-accent) transition"
            >
              <div className="aspect-square bg-black/30">
                {l.images[0] ? (
                  <SmartImage
                    src={l.images[0]}
                    alt={l.title}
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-(--app-ink-3) text-xs">
                    No preview
                  </div>
                )}
              </div>
              <div className="p-3 space-y-1">
                <p className="text-[11px] text-(--app-ink-3)">
                  {ASSET_TYPE_LABEL[l.assetType] ?? l.assetType}
                  {l.niche ? ` · ${l.niche}` : ""}
                </p>
                <p className="text-sm font-medium text-white line-clamp-2">{l.title}</p>
                <p className="text-sm font-bold text-(--app-accent-ink)">
                  {usd(toNum(l.price))}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
