import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { JsonLd } from "@/components/seo/json-ld";
import { ListingGrid, Pagination } from "@/components/public/catalog-lists";
import { getSection, MARKETPLACE_SECTIONS } from "@/lib/marketplace-categories";
import { indexPageSeo } from "@/lib/public-catalog";
import { getPublicListingPage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";

/**
 * A marketplace category landing page (/marketplace/section/<slug>) — one of
 * the four trades in MARKETPLACE_SECTIONS. Public, server-rendered from a
 * cached read; the same page for guests and signed-in users.
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Short, factual intros — what is sold in the section and how it is sold. */
const INTRO: Record<string, { title: string; body: string }> = {
  stock: {
    title: "Stock Photos, Video & Music",
    body: "Royalty-licensed photos, footage and audio. Each item is licensed to every buyer who wants it, so it stays on sale after you buy, and the file is yours to download from your orders.",
  },
  products: {
    title: "Ebooks, Templates & Digital Products",
    body: "Ebooks, templates and other downloads. Buy once and download from your orders; the seller can keep selling the same product to other buyers.",
  },
  assets: {
    title: "Websites, Domains, Apps & Accounts for Sale",
    body: "Domains, websites, apps, SaaS products and accounts. Each one is sold once and transferred to the buyer, with the seller's figures, terms and what is included listed on the page.",
  },
  services: {
    title: "Freelance Services",
    body: "Work delivered to order by sellers on RevType. Each service lists what is delivered, the turnaround and the included revisions; order it with your RevType wallet.",
  },
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const section = getSection(slug);
  if (!section) notFound();
  const intro = INTRO[slug] ?? { title: section.label, body: section.tagline };
  const seo = indexPageSeo(`/marketplace/section/${slug}`, await searchParams);
  // "– Marketplace" only while the whole title (with " | RevType") fits 60.
  const head = intro.title.length <= 36 ? `${intro.title} – Marketplace` : intro.title;
  const title = `${head}${seo.page > 1 ? ` – Page ${seo.page}` : ""}`;
  const description = intro.body.length > 155 ? `${intro.body.slice(0, 152).replace(/\s+\S*$/, "")}…` : intro.body;
  return pageMeta({
    title,
    description,
    path: `/marketplace/section/${slug}`,
    canonical: seo.canonical,
    robots: seo.robots,
    image: null,
    cardKicker: "Marketplace",
  });
}

export default async function MarketplaceSectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const section = getSection(slug);
  if (!section) notFound();

  const session = await auth();
  if (session?.user?.id) {
    const { enabled } = await getEffectiveFeatures(session.user.id);
    if (!enabled.has("marketplace")) return <FeatureLock title="Marketplace" />;
  }

  const base = `/marketplace/section/${slug}`;
  const { page } = indexPageSeo(base, await searchParams);
  const list = await getPublicListingPage(slug, null, page);
  const intro = INTRO[slug] ?? { title: section.label, body: section.tagline };

  return (
    <div className="space-y-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Marketplace", path: "/marketplace" },
            { name: section.label, path: base },
          ]),
          itemListLd(
            intro.title,
            list.items.map((l) => ({ path: `/marketplace/${l.id}`, name: l.title }))
          ),
        ]}
      />
      <nav aria-label="Breadcrumb">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)"
        >
          <ChevronLeft className="w-4 h-4" />
          Marketplace
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{intro.title}</h1>
        <p className="text-sm text-(--app-ink-2) max-w-2xl">{intro.body}</p>
        <p className="text-xs text-(--app-ink-3) tabular-nums">
          {list.total} listing{list.total === 1 ? "" : "s"}
          {page > 1 ? ` · page ${page}` : ""}
        </p>
      </header>

      <nav aria-label="Other categories" className="flex flex-wrap gap-2">
        {MARKETPLACE_SECTIONS.filter((s) => s.slug !== slug).map((s) => (
          <Link
            key={s.slug}
            href={`/marketplace/section/${s.slug}`}
            className="rounded-full border border-(--app-line) bg-(--app-surface) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <section aria-label={`${section.label} listings`}>
        <ListingGrid items={list.items} />
      </section>
      <Pagination basePath={base} page={page} total={list.total} />
    </div>
  );
}
