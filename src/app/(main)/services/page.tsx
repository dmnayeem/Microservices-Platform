import { auth } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { ServicesView } from "@/components/user/marketplace/services-view";
import { ServerAdSlot } from "@/components/user/primitives/server-ad-slot";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { JsonLd } from "@/components/seo/json-ld";
import { ListingGrid, Pagination } from "@/components/public/catalog-lists";
import { indexPageSeo } from "@/lib/public-catalog";
import { getPublicListingPage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";
import { SERVICES_SECTION, listingHref } from "@/lib/marketplace-categories";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = "Freelance Services – Hire a Freelancer";
const DESCRIPTION =
  "Hire freelancers on RevType for design, writing, development, marketing, video and more. Each service lists what is delivered, the delivery time and the included revisions.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const seo = indexPageSeo("/services", await searchParams);
  return pageMeta({
    title: seo.page > 1 ? `${TITLE} – Page ${seo.page}` : TITLE,
    description: DESCRIPTION,
    path: "/services",
    canonical: seo.canonical,
    robots: seo.robots,
    image: null,
    cardKicker: "Services",
  });
}

export default async function ServicesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) return <PublicServicesIndex searchParams={await searchParams} />;

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("marketplace")) return <FeatureLock title="Services" />;

  return <ServicesView topAd={<ServerAdSlot placement="MARKETPLACE_TOP" />} />;
}

/** Logged-out visitors and search engines: server-rendered, every card a link. */
async function PublicServicesIndex({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { page } = indexPageSeo("/services", searchParams);
  const list = await getPublicListingPage(SERVICES_SECTION.slug, null, page);

  return (
    <div className="space-y-6">
      <JsonLd
        data={[
          breadcrumbLd([{ name: "Services", path: "/services" }]),
          itemListLd(
            "Freelance services",
            list.items.map((l) => ({ path: listingHref(l), name: l.title }))
          ),
        ]}
      />
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Freelance services</h1>
        <p className="text-sm text-(--app-ink-2) max-w-2xl">
          Work delivered to order by freelancers on RevType. Each service lists what is delivered,
          the delivery time and the included revisions. Browse freely — sign in when you want to
          hire someone or message them.
        </p>
        <p className="text-xs text-(--app-ink-3) tabular-nums">
          {list.total} service{list.total === 1 ? "" : "s"}
          {page > 1 ? ` · page ${page}` : ""}
        </p>
      </header>
      <nav aria-label="Marketplace">
        <Link
          href="/marketplace"
          className="rounded-full border border-(--app-line) bg-(--app-surface) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
        >
          Looking for digital products? Visit the marketplace
        </Link>
      </nav>
      <section aria-label="Services">
        <ListingGrid items={list.items} />
      </section>
      <Pagination basePath="/services" page={page} total={list.total} />
    </div>
  );
}
