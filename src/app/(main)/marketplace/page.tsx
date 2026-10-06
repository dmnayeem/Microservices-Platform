import { auth } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { prisma } from "@/lib/prisma";
import { MarketplaceView } from "@/components/user/marketplace/marketplace-view";
import { ServerAdSlot } from "@/components/user/primitives/server-ad-slot";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { JsonLd } from "@/components/seo/json-ld";
import { Avatar } from "@/components/user/primitives/avatar";
import { ListingGrid, Pagination } from "@/components/public/catalog-lists";
import { indexPageSeo } from "@/lib/public-catalog";
import { getMarketplaceOverview, getPublicListingPage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = "Marketplace – Digital Products, Assets & Services";
const DESCRIPTION =
  "Buy stock photos, video and music, ebooks and templates, websites, domains and apps, or order a service — from sellers on RevType.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const seo = indexPageSeo("/marketplace", await searchParams);
  return pageMeta({
    title: seo.page > 1 ? `${TITLE} – Page ${seo.page}` : TITLE,
    description: DESCRIPTION,
    path: "/marketplace",
    canonical: seo.canonical,
    robots: seo.robots,
    image: null,
    cardKicker: "Marketplace",
  });
}

export default async function MarketplacePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) return <PublicMarketplaceIndex searchParams={await searchParams} />;

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

  return (
    <MarketplaceView
      storefronts={storefronts}
      topAd={<ServerAdSlot placement="MARKETPLACE_TOP" />}
    />
  );
}

/**
 * What a logged-out visitor and a search engine get: the same catalog,
 * server-rendered from cached reads, every card a real link.
 */
async function PublicMarketplaceIndex({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { page } = indexPageSeo("/marketplace", searchParams);
  const [overview, list] = await Promise.all([
    getMarketplaceOverview(),
    getPublicListingPage(null, null, page),
  ]);

  return (
    <div className="space-y-8">
      <JsonLd
        data={[
          breadcrumbLd([{ name: "Marketplace", path: "/marketplace" }]),
          itemListLd(
            "Marketplace listings",
            list.items.map((l) => ({ path: `/marketplace/${l.id}`, name: l.title }))
          ),
        ]}
      />
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Marketplace</h1>
        <p className="text-sm text-(--app-ink-2) max-w-2xl">
          Digital products, digital assets and services from sellers on RevType. Browse freely —
          sign in when you want to buy, order or message a seller.
        </p>
      </header>

      <section aria-labelledby="mp-sections" className="space-y-3">
        <h2 id="mp-sections" className="text-lg font-bold text-white">Browse by category</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {overview.sections.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/marketplace/section/${s.slug}`}
                className="glass rounded-xl p-4 block h-full hover:ring-1 hover:ring-(--app-accent) transition"
              >
                <span className="block text-sm font-bold text-white">{s.label}</span>
                <span className="block text-xs text-(--app-ink-3) mt-1">{s.tagline}</span>
                <span className="block text-[11px] text-(--app-ink-3) mt-2 tabular-nums">
                  {s.count} listing{s.count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {overview.storefronts.length > 0 && (
        <section aria-labelledby="mp-stores" className="space-y-3">
          <h2 id="mp-stores" className="text-lg font-bold text-white">Storefronts</h2>
          <ul className="flex flex-wrap gap-2">
            {overview.storefronts.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/marketplace/brand/${b.slug}`}
                  className="glass rounded-xl px-3 py-2 inline-flex items-center gap-2 hover:ring-1 hover:ring-(--app-accent)"
                >
                  <Avatar src={b.logo} size={28} fallbackText={b.name.charAt(0).toUpperCase()} />
                  <span className="text-sm font-medium text-white">{b.name}</span>
                  <span className="text-[11px] text-(--app-ink-3) tabular-nums">{b.listingCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mp-latest" className="space-y-3">
        <h2 id="mp-latest" className="text-lg font-bold text-white">
          Latest listings{page > 1 ? ` — page ${page}` : ""}
        </h2>
        <ListingGrid items={list.items} headingLevel={3} />
        <Pagination basePath="/marketplace" page={page} total={list.total} />
      </section>
    </div>
  );
}
