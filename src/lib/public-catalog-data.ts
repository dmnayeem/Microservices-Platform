import "server-only";
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { mediaSrc } from "@/lib/media-url";
import {
  getLicenseTiersEnabled,
  readTiers,
  getMarketplaceTaxConfig,
} from "@/lib/marketplace-selling";
import { resolveCommissionBps } from "@/lib/marketplace-commission";
import {
  ASSET_TYPE_LABEL,
  MARKETPLACE_SECTIONS,
  getFieldsFor,
} from "@/lib/marketplace-categories";
import { loadCourseLanding } from "@/lib/course-landing";
import { CATALOG_ORIGIN, CATALOG_PAGE_SIZE } from "@/lib/public-catalog";

/**
 * Cached reads behind the public marketplace and course pages.
 *
 * Class 1 in lib/cache-tags.ts: shared, and changed by sellers / tutors /
 * admins → `unstable_cache` with a tag, invalidated by `revalidatePublic*()`
 * in the write routes, plus a time-based ceiling for writes that don't call it
 * (a checkout flipping a listing to SOLD, a new review). Every function is
 * also wrapped in React `cache()` so `generateMetadata` and the page share ONE
 * read per request.
 *
 * Nothing per-viewer lives here — cart, watch, ownership and enrollment are
 * read separately, and only for a signed-in viewer.
 *
 * Everything returned is what a logged-out visitor may see. Deliverable files
 * (`files`), proof attachments, file metadata, commission overrides, reserve
 * prices, NDA-gated figures and moderation notes are never selected.
 */

export const PUBLIC_MARKETPLACE_TAG = "public-marketplace";
export const PUBLIC_COURSES_TAG = "public-courses";

/** Call after any write that changes what the public marketplace shows. */
export function revalidatePublicMarketplace(): void {
  try {
    revalidateTag(PUBLIC_MARKETPLACE_TAG, "max");
  } catch {
    /* outside a request scope (scripts) — the time ceiling still applies */
  }
}

/** Call after any write that changes what the public course pages show. */
export function revalidatePublicCourses(): void {
  try {
    revalidateTag(PUBLIC_COURSES_TAG, "max");
  } catch {
    /* outside a request scope (scripts) — the time ceiling still applies */
  }
}

const DETAIL_TTL = 300;
const INDEX_TTL = 180;

/** Absolute, logged-out-reachable URL for a stored image (og:image, JSON-LD). */
export function absoluteImage(src: string | null | undefined): string | null {
  if (!src) return null;
  const s = mediaSrc(src);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `${CATALOG_ORIGIN}${s}`;
  return null;
}

/** Statuses a guest may open. Anything else is a 404 for them. */
export const GUEST_LISTING_STATUSES = new Set(["ACTIVE", "SOLD"]);

// ─── Marketplace: one listing ─────────────────────────────────────────────

export type PublicListing = NonNullable<Awaited<ReturnType<typeof readListing>>>;

async function readListing(id: string) {
  const l = await prisma.marketplaceListing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      richDescription: true,
      category: true,
      assetType: true,
      subType: true,
      details: true,
      price: true,
      currency: true,
      images: true,
      screenshots: true,
      status: true,
      views: true,
      uniqueViewers: true,
      monthlyRevenue: true,
      monthlyProfit: true,
      monthlyExpenses: true,
      monthlyTraffic: true,
      assetAgeMonths: true,
      niche: true,
      reasonsForSelling: true,
      whatsIncluded: true,
      whatsNotIncluded: true,
      verifiedMetrics: true,
      ndaGated: true,
      nsfw: true,
      auctionMode: true,
      startingBid: true,
      buyNowPrice: true,
      auctionEndsAt: true,
      saleMode: true,
      licenseTiers: true,
      commissionRateBps: true,
      isFeatured: true,
      isPromoted: true,
      createdAt: true,
      updatedAt: true,
      brandId: true,
      seller: {
        select: {
          id: true,
          name: true,
          avatar: true,
          username: true,
          createdAt: true,
          status: true,
          _count: { select: { marketplaceListings: true } },
        },
      },
      brand: { select: { name: true, slug: true, logo: true, bio: true } },
      _count: { select: { purchases: true, watches: true } },
    },
  });
  if (!l) return null;

  const [brandListingCount, tiersEnabled, taxCfg, bps] = await Promise.all([
    l.brandId
      ? prisma.marketplaceListing.count({ where: { brandId: l.brandId, status: "ACTIVE" } })
      : Promise.resolve(0),
    getLicenseTiersEnabled(),
    getMarketplaceTaxConfig(),
    resolveCommissionBps({ assetType: l.assetType, perListingOverride: l.commissionRateBps }),
  ]);

  // Only the fields the category form defines are shown; anything else in the
  // JSON (studio task ids, prompts) is internal.
  const allowedKeys = new Set(getFieldsFor(l.assetType, l.subType).map((f) => f.key));
  const rawDetails = (l.details ?? {}) as Record<string, unknown>;
  const details = Object.fromEntries(
    Object.entries(rawDetails).filter(([k]) => allowedKeys.has(k))
  );

  const counts = (l as unknown as { _count: { purchases: number; watches: number } })._count;
  const sellerCount = (l.seller as unknown as { _count: { marketplaceListings: number } })._count;
  const nda = l.ndaGated;

  return {
    id: l.id,
    title: l.title,
    description: l.description,
    richDescription: l.richDescription,
    category: l.category,
    assetType: l.assetType,
    subType: l.subType,
    details: Object.keys(details).length ? details : null,
    price: toNum(l.price),
    currency: l.currency,
    images: l.images,
    // Proof screenshots of an NDA-gated listing would show the hidden figures.
    screenshots: nda ? [] : l.screenshots,
    // Seller proof documents stay behind the login.
    attachments: [] as string[],
    status: String(l.status),
    // Indexed only while the seller is ACTIVE — the sitemap's rule too.
    sellerActive: l.seller.status === "ACTIVE",
    views: l.views,
    uniqueViewers: l.uniqueViewers,
    watchCount: counts.watches,
    salesCount: counts.purchases,
    monthlyRevenue: nda ? null : toNumOrNull(l.monthlyRevenue),
    monthlyProfit: nda ? null : toNumOrNull(l.monthlyProfit),
    monthlyExpenses: nda ? null : toNumOrNull(l.monthlyExpenses),
    monthlyTraffic: l.monthlyTraffic,
    assetAgeMonths: l.assetAgeMonths,
    niche: l.niche,
    reasonsForSelling: l.reasonsForSelling,
    whatsIncluded: l.whatsIncluded,
    whatsNotIncluded: l.whatsNotIncluded,
    verifiedMetrics: l.verifiedMetrics,
    ndaGated: l.ndaGated,
    nsfw: l.nsfw,
    auctionMode: l.auctionMode,
    startingBid: toNumOrNull(l.startingBid),
    reservePrice: null as number | null,
    buyNowPrice: toNumOrNull(l.buyNowPrice),
    auctionEndsAt: l.auctionEndsAt ? l.auctionEndsAt.toISOString() : null,
    saleMode: l.saleMode,
    tax: { enabled: taxCfg.enabled, pct: taxCfg.pct, label: taxCfg.label, commissionBps: bps },
    licenseTiers: tiersEnabled ? readTiers(l.licenseTiers) : [],
    isFeatured: l.isFeatured,
    isPromoted: l.isPromoted,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    seller: {
      id: l.seller.id,
      name: l.seller.name,
      avatar: l.seller.avatar,
      username: l.seller.username,
      memberSince: l.seller.createdAt.toISOString(),
      totalListings: sellerCount.marketplaceListings,
    },
    brand: l.brand
      ? {
          name: l.brand.name,
          slug: l.brand.slug,
          logo: l.brand.logo,
          bio: l.brand.bio,
          listingCount: brandListingCount,
        }
      : null,
  };
}

/** One listing, any status (the page decides who may see which status). */
export const getPublicListing = cache(async (id: string) =>
  unstable_cache(() => readListing(id), ["public-listing", id], {
    revalidate: DETAIL_TTL,
    tags: [PUBLIC_MARKETPLACE_TAG],
    // No catch: a database outage must be a 5xx, never a 404 that tells a
    // crawler the listing is gone.
  })()
);

// ─── Marketplace: lists ───────────────────────────────────────────────────

// The Accelerate client types collapse relation selects; read them through this.
const rel = (r: unknown) =>
  r as { brand: { name: string } | null; seller: { name: string | null } | null };

export interface ListingCard {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string | null;
  assetType: string;
  typeLabel: string;
  niche: string | null;
  sellerName: string;
  isFeatured: boolean;
}

async function readListingPage(sectionSlug: string | null, brandSlug: string | null, page: number) {
  const section = sectionSlug ? MARKETPLACE_SECTIONS.find((s) => s.slug === sectionSlug) : null;
  let brandId: string | null = null;
  if (brandSlug) {
    const b = await prisma.marketplaceBrand.findUnique({ where: { slug: brandSlug }, select: { id: true, isActive: true } });
    if (!b || !b.isActive) return { total: 0, items: [] as ListingCard[] };
    brandId = b.id;
  }
  const where = {
    status: "ACTIVE" as const,
    nsfw: false,
    ...(section ? { assetType: { in: section.assetTypes as unknown as string[] } } : {}),
    ...(brandId ? { brandId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.marketplaceListing.count({ where }),
    prisma.marketplaceListing.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        images: true,
        assetType: true,
        niche: true,
        isFeatured: true,
        seller: { select: { name: true } },
        brand: { select: { name: true } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map(
      (r): ListingCard => ({
        id: r.id,
        title: r.title,
        description: r.description.slice(0, 300),
        price: toNum(r.price),
        image: r.images[0] ?? null,
        assetType: r.assetType,
        typeLabel: ASSET_TYPE_LABEL[r.assetType] ?? r.assetType,
        niche: r.niche,
        sellerName: rel(r).brand?.name ?? rel(r).seller?.name ?? "Seller",
        isFeatured: r.isFeatured,
      })
    ),
  };
}

/** Arguments are primitives so React `cache()` dedupes metadata + page. */
export const getPublicListingPage = cache(
  async (section: string | null, brand: string | null, page: number) =>
    unstable_cache(
      () => readListingPage(section, brand, page),
      ["public-listing-page", section ?? "", brand ?? "", String(page)],
      { revalidate: INDEX_TTL, tags: [PUBLIC_MARKETPLACE_TAG] }
    )().catch(() => ({ total: 0, items: [] as ListingCard[] }))
);

/** Per-section counts + storefronts with something on sale (one grouped read). */
export const getMarketplaceOverview = cache(async () =>
  unstable_cache(
    async () => {
      const [byType, brands] = await Promise.all([
        prisma.marketplaceListing.groupBy({
          by: ["assetType"],
          where: { status: "ACTIVE", nsfw: false },
          _count: { _all: true },
        }),
        prisma.marketplaceBrand.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          take: 24,
          select: { id: true, slug: true, name: true, logo: true },
        }),
      ]);
      const brandCounts = brands.length
        ? await prisma.marketplaceListing.groupBy({
            by: ["brandId"],
            where: { status: "ACTIVE", brandId: { in: brands.map((b) => b.id) } },
            _count: { _all: true },
          })
        : [];
      const typeCount = new Map(
        (byType as Array<{ assetType: string; _count: { _all: number } }>).map((r) => [r.assetType, r._count._all])
      );
      const bc = new Map(
        (brandCounts as Array<{ brandId: string | null; _count: { _all: number } }>).map((r) => [r.brandId, r._count._all])
      );
      return {
        sections: MARKETPLACE_SECTIONS.map((s) => ({
          slug: s.slug,
          label: s.label,
          tagline: s.tagline,
          count: s.assetTypes.reduce((a, t) => a + (typeCount.get(t) ?? 0), 0),
        })),
        storefronts: brands
          .map((b) => ({ slug: b.slug, name: b.name, logo: b.logo, listingCount: bc.get(b.id) ?? 0 }))
          .filter((b) => b.listingCount > 0),
      };
    },
    ["public-marketplace-overview"],
    { revalidate: INDEX_TTL, tags: [PUBLIC_MARKETPLACE_TAG] }
  )().catch(() => ({
    sections: MARKETPLACE_SECTIONS.map((s) => ({ slug: s.slug, label: s.label, tagline: s.tagline, count: 0 })),
    storefronts: [] as Array<{ slug: string; name: string; logo: string | null; listingCount: number }>,
  }))
);

export const getPublicBrand = cache(async (slug: string) =>
  unstable_cache(
    () =>
      prisma.marketplaceBrand.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true, logo: true, bio: true, website: true, isActive: true },
      }),
    ["public-brand", slug],
    { revalidate: DETAIL_TTL, tags: [PUBLIC_MARKETPLACE_TAG] }
  )()
);

// ─── Courses ──────────────────────────────────────────────────────────────

type Landing = NonNullable<Awaited<ReturnType<typeof loadCourseLanding>>>;

/** Turn the cache's JSON strings back into the Dates the components expect. */
function reviveLanding(d: Landing): Landing {
  const date = (v: unknown) => (v == null ? null : new Date(v as string));
  return {
    ...d,
    course: {
      ...d.course,
      discountEndsAt: date(d.course.discountEndsAt),
      publishedAt: date(d.course.publishedAt),
      lastContentUpdate: date(d.course.lastContentUpdate),
    },
    reviews: d.reviews.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
    questions: d.questions.map((q) => ({
      ...q,
      createdAt: new Date(q.createdAt),
      answeredAt: date(q.answeredAt),
    })),
  } as Landing;
}

/**
 * The course landing payload as a logged-out visitor gets it: published
 * courses only, curriculum as an outline (no lesson bodies or video URLs), no
 * viewer state, no tutor commission figures.
 */
export const getPublicCourseLanding = cache(async (slugOrId: string) => {
  const d = await unstable_cache(
    async () => {
      const x = await loadCourseLanding({ slugOrId, userId: null });
      if (!x) return null;
      return {
        ...x,
        affiliateReward: null,
        course: { ...x.course, affiliateCommissionType: null, affiliateCommissionValue: null },
      };
    },
    ["public-course-landing", slugOrId],
    { revalidate: DETAIL_TTL, tags: [PUBLIC_COURSES_TAG] }
  )();
  return d ? reviveLanding(d as unknown as Landing) : null;
});

export interface CourseCard {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  isFree: boolean;
  price: number;
  discountPrice: number | null;
  avgRating: number;
  totalReviews: number;
  enrollmentCount: number;
  totalDuration: number;
  tutorName: string | null;
  categoryName: string | null;
}

async function readCoursePage(categorySlug: string | null, page: number) {
  let categoryId: string | null = null;
  if (categorySlug) {
    const c = await prisma.courseCategory.findUnique({ where: { slug: categorySlug }, select: { id: true, isActive: true } });
    if (!c || !c.isActive) return { total: 0, items: [] as CourseCard[] };
    categoryId = c.id;
  }
  const where = { status: "PUBLISHED" as const, nsfw: false, ...(categoryId ? { categoryId } : {}) };
  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { enrollmentCount: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        thumbnail: true,
        isFree: true,
        price: true,
        discountPrice: true,
        avgRating: true,
        totalReviews: true,
        enrollmentCount: true,
        totalDuration: true,
        tutor: { select: { name: true } },
        category_rel: { select: { name: true } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map(
      (c): CourseCard => ({
        id: c.id,
        href: `/courses/${c.slug ?? c.id}`,
        title: c.title,
        subtitle: c.subtitle,
        thumbnail: c.thumbnail,
        isFree: c.isFree,
        price: toNum(c.price),
        discountPrice: toNumOrNull(c.discountPrice),
        avgRating: c.avgRating,
        totalReviews: c.totalReviews,
        enrollmentCount: c.enrollmentCount,
        totalDuration: c.totalDuration,
        tutorName: (c as unknown as { tutor: { name: string | null } | null }).tutor?.name ?? null,
        categoryName: (c as unknown as { category_rel: { name: string } | null }).category_rel?.name ?? null,
      })
    ),
  };
}

export const getPublicCoursePage = cache(async (category: string | null, page: number) =>
  unstable_cache(
    () => readCoursePage(category, page),
    ["public-course-page", category ?? "", String(page)],
    { revalidate: INDEX_TTL, tags: [PUBLIC_COURSES_TAG] }
  )().catch(() => ({ total: 0, items: [] as CourseCard[] }))
);

export const getPublicCourseCategories = cache(async () =>
  unstable_cache(
    () =>
      prisma.courseCategory.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { slug: true, name: true, description: true },
      }),
    ["public-course-categories"],
    { revalidate: INDEX_TTL, tags: [PUBLIC_COURSES_TAG] }
  )()
);

// ─── Guest status codes ───────────────────────────────────────────────────

/**
 * What the (main) layout should do for a logged-out request to a catalog
 * path, decided BEFORE anything streams.
 *
 * The (main) group has a loading.tsx, so a page's own `notFound()` lands
 * inside a Suspense boundary after the 200 has already been sent — a missing
 * listing came back as "200 + noindex". The layout sits above that boundary,
 * so resolving existence here gives crawlers a real 404 (and a real 308 for
 * the legacy /courses/<id> address). Every read is the same React-cached one
 * the page and its metadata use, so this adds no queries.
 */
export async function guestCatalogStatus(
  pathname: string
): Promise<{ ok: true } | { ok: false } | { redirect: string }> {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) return { ok: true }; // /marketplace, /courses
  const [area, a, b] = parts;
  if (area === "marketplace") {
    if (a === "section" && b) return MARKETPLACE_SECTIONS.some((s) => s.slug === b) ? { ok: true } : { ok: false };
    if (a === "brand" && b) {
      const brand = await getPublicBrand(b);
      return brand?.isActive ? { ok: true } : { ok: false };
    }
    if (a && !b) {
      const l = await getPublicListing(a);
      return l && GUEST_LISTING_STATUSES.has(l.status) ? { ok: true } : { ok: false };
    }
    return { ok: false };
  }
  if (area === "courses") {
    if (a === "category" && b) {
      const cats = await getPublicCourseCategories();
      return cats.some((c) => c.slug === b) ? { ok: true } : { ok: false };
    }
    if (a && !b) {
      const d = await getPublicCourseLanding(a);
      if (!d) return { ok: false };
      if (d.course.slug && d.course.slug !== a && a === d.course.id) return { redirect: `/courses/${d.course.slug}` };
      return { ok: true };
    }
  }
  return { ok: false };
}
