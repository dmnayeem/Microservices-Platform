import { canonicalUrl, CATALOG_ORIGIN, plainSummary } from "./public-catalog";

/**
 * schema.org builders for the public marketplace and course pages.
 *
 * Pure functions over plain data so scripts/verify-public-catalog.ts can run
 * them without a database. Rules that matter for rich results:
 *  - aggregateRating / review only when REAL reviews exist (never invented);
 *  - absolute URLs everywhere (images go through the public /api/media proxy);
 *  - SERVICE listings are a Service with an Offer, not a Product.
 */

type Ld = Record<string, unknown>;

const ORG: Ld = { "@type": "Organization", name: "RevType", url: CATALOG_ORIGIN };

export function breadcrumbLd(items: Array<{ name: string; path: string }>): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: canonicalUrl(it.path),
    })),
  };
}

export interface ListingLdInput {
  id: string;
  title: string;
  description: string;
  assetType: string;
  categoryLabel: string;
  price: number;
  currency: string;
  status: string;
  /** Absolute image URLs. */
  images: string[];
  seller: { name: string; isBrand: boolean; url?: string | null };
  createdAt: string;
}

export function listingLd(l: ListingLdInput): Ld {
  const url = canonicalUrl(`/marketplace/${l.id}`);
  const offer: Ld = {
    "@type": "Offer",
    url,
    price: Number(l.price.toFixed(2)),
    priceCurrency: (l.currency || "USD").toUpperCase(),
    availability:
      l.status === "ACTIVE" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    seller: {
      "@type": l.seller.isBrand ? "Organization" : "Person",
      name: l.seller.name,
      ...(l.seller.url ? { url: l.seller.url } : {}),
    },
  };
  const description = plainSummary(l.description, 5000) || undefined;

  if (l.assetType === "SERVICE") {
    return {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${url}#service`,
      name: l.title,
      description,
      url,
      serviceType: l.categoryLabel,
      areaServed: "Worldwide",
      ...(l.images.length ? { image: l.images } : {}),
      provider: offer.seller,
      offers: offer,
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: l.title,
    description,
    url,
    sku: l.id,
    category: l.categoryLabel,
    ...(l.images.length ? { image: l.images } : {}),
    offers: offer,
  };
}

export interface CourseLdInput {
  path: string;
  title: string;
  description: string;
  language: string;
  isFree: boolean;
  price: number;
  /** Absolute image URLs. */
  images: string[];
  tutorName: string | null;
  category: string | null;
  skillLevel: string | null;
  totalDuration: number;
  avgRating: number;
  /** Number of real reviews in the database. */
  reviewCount: number;
  reviews: Array<{ author: string; rating: number; body: string | null; date: string }>;
  datePublished: string | null;
}

export function courseLd(c: CourseLdInput): Ld {
  const url = canonicalUrl(c.path);
  const instructor = c.tutorName ? { "@type": "Person", name: c.tutorName } : undefined;
  const offer: Ld = {
    "@type": "Offer",
    url,
    category: c.isFree ? "Free" : "Paid",
    price: c.isFree ? 0 : Number(c.price.toFixed(2)),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  };
  const hours = Math.max(1, Math.round(c.totalDuration / 60));
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: c.title,
    description: plainSummary(c.description, 5000) || c.title,
    url,
    inLanguage: c.language || "en",
    ...(c.images.length ? { image: c.images } : {}),
    provider: ORG,
    ...(instructor ? { instructor } : {}),
    ...(c.category ? { about: c.category } : {}),
    ...(c.skillLevel ? { educationalLevel: c.skillLevel } : {}),
    ...(c.datePublished ? { datePublished: c.datePublished } : {}),
    isAccessibleForFree: c.isFree,
    offers: offer,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      courseWorkload: `PT${hours}H`,
      ...(instructor ? { instructor } : {}),
    },
    ...(c.reviewCount > 0 && c.avgRating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(c.avgRating.toFixed(1)),
            reviewCount: c.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
          review: c.reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.author },
            datePublished: r.date,
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.body ? { reviewBody: plainSummary(r.body, 1000) } : {}),
          })),
        }
      : {}),
  };
}

/** ItemList for an index / category page — the order the visitor sees. */
export function itemListLd(name: string, urls: Array<{ path: string; name: string }>): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: urls.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: canonicalUrl(u.path),
      name: u.name,
    })),
  };
}
