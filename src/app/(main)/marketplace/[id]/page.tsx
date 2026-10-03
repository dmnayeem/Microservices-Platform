import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { usd } from "@/lib/utils";
import {
  getLicenseTiersEnabled,
  readTiers,
  getMarketplaceTaxConfig,
} from "@/lib/marketplace-selling";
import { resolveCommissionBps } from "@/lib/marketplace-commission";
import { ListingDetailView } from "@/components/user/marketplace/listing-detail-view";
import { JsonLd } from "@/components/seo/json-ld";
import { ASSET_TYPE_LABEL, sectionForAssetType } from "@/lib/marketplace-categories";
import { canonicalUrl, plainSummary } from "@/lib/public-catalog";
import {
  getPublicListing,
  absoluteImage,
  GUEST_LISTING_STATUSES,
  type PublicListing,
} from "@/lib/public-catalog-data";
import { breadcrumbLd, listingLd } from "@/lib/public-catalog-schema";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

/**
 * A marketplace listing. Public: a logged-out visitor and a search engine get
 * the whole listing (gallery, description, price, terms, seller) from a
 * cached read with every action turned into "sign in"; a signed-in viewer gets
 * exactly the page they always had, with their own watch / owner state.
 */

type Props = { params: Promise<{ id: string }> };

function categoryLabel(l: Pick<PublicListing, "assetType" | "category">): string {
  return ASSET_TYPE_LABEL[l.assetType] ?? l.category ?? "Marketplace";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await getPublicListing(id);
  // notFound() here, not only in the page: metadata resolves before the
  // response starts streaming, so the status is a real 404 rather than a 200
  // with a noindex tag.
  if (!l) notFound();
  if (!GUEST_LISTING_STATUSES.has(l.status) && !(await auth())?.user?.id) notFound();

  const path = `/marketplace/${id}`;
  const title = `${l.title} – ${categoryLabel(l)}`;
  const description = plainSummary(l.description || l.richDescription) || undefined;
  // Only a live, approved listing is indexed. Sold ones stay reachable for the
  // people who bought them but drop out of search; anything else (pending,
  // rejected, cancelled) is never shown to a guest at all.
  const indexable = l.status === "ACTIVE" && !l.nsfw;
  return pageMeta({
    title,
    description,
    path,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    // The cover, cropped to 1200×630 (lib/seo/og-image.ts); no cover → the
    // branded card with the title and price.
    image: l.images[0] ?? null,
    imageAlt: l.title,
    cardKicker: `${categoryLabel(l)} · ${usd(l.price)}`,
  });
}

function structuredData(l: PublicListing) {
  const section = sectionForAssetType(l.assetType);
  const path = `/marketplace/${l.id}`;
  return [
    listingLd({
      id: l.id,
      title: l.title,
      description: l.description || l.richDescription || l.title,
      assetType: l.assetType,
      categoryLabel: categoryLabel(l),
      price: l.price,
      currency: l.currency,
      status: l.status,
      images: l.images.map((s) => absoluteImage(s)).filter((s): s is string => !!s),
      seller: l.brand
        ? { name: l.brand.name, isBrand: true, url: canonicalUrl(`/marketplace/brand/${l.brand.slug}`) }
        : { name: l.seller.name || "RevType seller", isBrand: false },
      createdAt: l.createdAt,
    }),
    breadcrumbLd([
      { name: "Marketplace", path: "/marketplace" },
      ...(section ? [{ name: section.label, path: `/marketplace/section/${section.slug}` }] : []),
      { name: l.title, path },
    ]),
  ];
}

export default async function ListingDetailPage({ params }: Props) {
  const session = await auth();
  const { id } = await params;

  // ── Logged-out visitor: the cached public listing ─────────────────────────
  if (!session?.user?.id) {
    const l = await getPublicListing(id);
    if (!l || !GUEST_LISTING_STATUSES.has(l.status)) notFound();
    return (
      <>
        <JsonLd data={structuredData(l)} />
        <ListingDetailView
          listing={l}
          isOwner={false}
          isWatched={false}
          hideFinancials={l.ndaGated}
          viewerId=""
          guest
        />
      </>
    );
  }

  // ── Signed in: unchanged ──────────────────────────────────────────────────

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
      brand: { select: { name: true, slug: true, logo: true, bio: true } },
      _count: { select: { purchases: true, watches: true } },
    },
  });
  if (!listing) notFound();

  // Counted separately: `_count` on the brand relation is not surfaced by the
  // generated client for this model, and a silently-dropped include would show
  // every storefront as empty.
  const brandListingCount = listing.brandId
    ? await prisma.marketplaceListing.count({
        where: { brandId: listing.brandId, status: "ACTIVE" },
      })
    : 0;

  // Tiers are only offered while the admin has the feature on. Reading them
  // here rather than in the client keeps a switched-off feature completely
  // invisible instead of shipping prices the checkout would refuse.
  const tiersEnabled = await getLicenseTiersEnabled();
  // The buyer is charged price + tax on the commission, so the listing page
  // has to quote the total. Resolving the rate here keeps the arithmetic in
  // one place with the checkout that enforces it.
  const taxCfg = await getMarketplaceTaxConfig();
  const listingBps = await resolveCommissionBps({
    assetType: listing.assetType,
    perListingOverride: listing.commissionRateBps,
  });

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

  // Structured data from the same cached public read the metadata used.
  const pub = await getPublicListing(id);

  return (
    <>
      {pub && <JsonLd data={structuredData(pub)} />}
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
        saleMode: listing.saleMode,
        tax: { enabled: taxCfg.enabled, pct: taxCfg.pct, label: taxCfg.label, commissionBps: listingBps },
        licenseTiers: tiersEnabled ? readTiers(listing.licenseTiers) : [],
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
        brand: listing.brand
          ? {
              name: listing.brand.name,
              slug: listing.brand.slug,
              logo: listing.brand.logo,
              bio: listing.brand.bio,
              listingCount: brandListingCount,
            }
          : null,
      }}
        isOwner={isOwner}
        isWatched={isWatched}
        hideFinancials={hideFinancials}
        viewerId={session.user.id}
      />
    </>
  );
}
