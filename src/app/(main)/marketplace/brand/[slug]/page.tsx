import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { Avatar } from "@/components/user/primitives/avatar";
import { ArrowLeft, Globe, Package } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { ListingGrid, Pagination } from "@/components/public/catalog-lists";
import { canonicalUrl, indexPageSeo, plainSummary } from "@/lib/public-catalog";
import { absoluteImage, getPublicBrand, getPublicListingPage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";

/**
 * Public storefront for one brand — "show me everything this company sells".
 * Readable logged out (cached reads, real links); signed-in users get the
 * same page inside the app.
 *
 * Deactivating a brand hides the storefront but leaves its listings reachable
 * by their own URLs, because a buyer who already paid still needs the listing
 * page to download from.
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getPublicBrand(slug);
  if (!brand || !brand.isActive) notFound();
  const seo = indexPageSeo(`/marketplace/brand/${slug}`, await searchParams);
  const title = `${brand.name} – Store${seo.page > 1 ? ` – Page ${seo.page}` : ""}`;
  const description =
    plainSummary(brand.bio) || `Everything ${brand.name} sells on the RevType marketplace.`;
  // The logo only when it is one of our stored files — an external logo is
  // never hot-linked; the brand card is used instead.
  return pageMeta({
    title,
    description,
    path: `/marketplace/brand/${slug}`,
    canonical: seo.canonical,
    robots: seo.robots,
    image: brand.logo ?? null,
    imageAlt: brand.name,
    cardKicker: "Marketplace store",
  });
}

export default async function BrandStorefrontPage({ params, searchParams }: Props) {
  const session = await auth();
  if (session?.user?.id) {
    const { enabled } = await getEffectiveFeatures(session.user.id);
    if (!enabled.has("marketplace")) return <FeatureLock title="Marketplace" />;
  }

  const { slug } = await params;
  const brand = await getPublicBrand(slug);
  if (!brand || !brand.isActive) notFound();

  const base = `/marketplace/brand/${slug}`;
  const { page } = indexPageSeo(base, await searchParams);
  const list = await getPublicListingPage(null, slug, page);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-6xl mx-auto">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: brand.name,
            url: canonicalUrl(base),
            ...(brand.logo && absoluteImage(brand.logo) ? { logo: absoluteImage(brand.logo) } : {}),
            ...(brand.bio ? { description: plainSummary(brand.bio, 500) } : {}),
            ...(brand.website ? { sameAs: [brand.website] } : {}),
          },
          breadcrumbLd([
            { name: "Marketplace", path: "/marketplace" },
            { name: brand.name, path: base },
          ]),
          itemListLd(
            `${brand.name} listings`,
            list.items.map((l) => ({ path: `/marketplace/${l.id}`, name: l.title }))
          ),
        ]}
      />
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-(--app-ink-3) hover:text-(--app-ink)"
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
              {list.total} listing{list.total === 1 ? "" : "s"}
            </span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-(--app-ink)"
              >
                <Globe className="w-3.5 h-3.5" />
                {brand.name} website
              </a>
            )}
          </div>
        </div>
      </section>

      <ListingGrid items={list.items} />
      <Pagination basePath={base} page={page} total={list.total} />
    </div>
  );
}
