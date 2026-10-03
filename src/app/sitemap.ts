import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
// A listing/course approved, edited or removed revalidates these tags, so it
// shows in (or leaves) the sitemap at once instead of within the hour.
import { PUBLIC_COURSES_TAG, PUBLIC_MARKETPLACE_TAG } from "@/lib/public-catalog-data";
import { prisma } from "@/lib/prisma";
import {
  publicAudienceEpochMs,
  publicSharingEnabled,
} from "@/lib/public-post";
import { getArticles } from "@/lib/blog";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * Rebuilt at most once an hour. Each dynamic block below is ONE query that
 * selects only the address and its date, held in the data cache for the same
 * hour — a crawler fetching the sitemap never costs a database read.
 */
export const revalidate = 3600;

const HOUR = 3600;
type Row = { id: string; updatedAt: Date };
type SlugRow = Row & { slug: string | null };

/** Public marketplace listings — products, stock media and services alike. */
const listingRows = unstable_cache(
  async (): Promise<Row[]> =>
    prisma.marketplaceListing
      .findMany({
        // Same rule as the public catalogue (lib/public-catalog-data.ts).
        where: { status: "ACTIVE", nsfw: false, seller: { status: "ACTIVE" } },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 20000,
      })
      .catch(() => []),
  ["sitemap:listings:v1"],
  { revalidate: HOUR, tags: [PUBLIC_MARKETPLACE_TAG] }
);

/** Published courses, at their canonical /courses/<slug> (id when no slug). */
const courseRows = unstable_cache(
  async (): Promise<SlugRow[]> =>
    prisma.course
      .findMany({
        where: { status: "PUBLISHED", nsfw: false },
        select: { id: true, slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10000,
      })
      .catch(() => []),
  ["sitemap:courses:v1"],
  { revalidate: HOUR, tags: [PUBLIC_COURSES_TAG] }
);

/** Active brand storefronts (/marketplace/brand/<slug>). */
const brandRows = unstable_cache(
  async (): Promise<Array<{ slug: string; updatedAt: Date }>> =>
    prisma.marketplaceBrand
      .findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, take: 1000 })
      .catch(() => []),
  ["sitemap:brands:v1"],
  { revalidate: HOUR, tags: [PUBLIC_MARKETPLACE_TAG] }
);

/** Course category pages (/courses/category/<slug>). */
const categoryRows = unstable_cache(
  async (): Promise<Array<{ slug: string; updatedAt: Date }>> =>
    prisma.courseCategory
      .findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, take: 500 })
      .catch(() => []),
  ["sitemap:course-categories:v1"],
  { revalidate: HOUR, tags: [PUBLIC_COURSES_TAG] }
);

/**
 * Shared public posts. The WHERE clause is the same rule as
 * `isPubliclyVisible` in src/lib/public-post-gate.ts, and it has to stay that
 * way: listing a post that /post/[id] then refuses hands Google a page of
 * 404s, and listing one it should have refused advertises a post that is not
 * public. `isPublic` DEFAULTS to true, so `groupId: null` and the epoch (every
 * pre-picker post's author was never offered a choice) do as much work as the
 * flag. With sharing switched off, /post/[id] refuses everything — so nothing
 * is listed.
 */
const postRows = unstable_cache(
  async (epochMs: number): Promise<Row[]> =>
    prisma.post
      .findMany({
        where: {
          isPublic: true,
          createdAt: { gte: new Date(epochMs) },
          isHidden: false,
          groupId: null,
          user: { status: "ACTIVE" },
        },
        select: { id: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      })
      .catch(() => []),
  ["sitemap:posts:v1"],
  { revalidate: HOUR }
);

async function publicPosts(): Promise<Row[]> {
  const [on, epochMs] = await Promise.all([
    publicSharingEnabled().catch(() => false),
    publicAudienceEpochMs().catch(() => null),
  ]);
  return on && epochMs !== null ? postRows(epochMs) : [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const u = (p: string) => `${SITE_URL}${p}`;

  // Static marketing, trust and catalogue pages. No `lastModified`: stamping
  // them "now" on every rebuild tells Google they always changed, and it then
  // ignores lastmod for the whole site.
  const staticPaths: Array<[string, number, MetadataRoute.Sitemap[number]["changeFrequency"]]> = [
    ["", 1, "daily"],
    ["/microtask", 0.9, "weekly"],
    ["/features/marketplace", 0.9, "weekly"],
    ["/features/courses", 0.9, "weekly"],
    ["/features/affiliate", 0.8, "weekly"],
    ["/advertise", 0.8, "weekly"],
    // Not in the public menu (by request) — which makes listing it here the
    // only way a crawler ever finds it.
    ["/referral", 0.7, "weekly"],
    ["/marketplace", 0.8, "daily"],
    ["/marketplace/section/services", 0.8, "daily"],
    ["/marketplace/section/products", 0.7, "daily"],
    ["/marketplace/section/assets", 0.7, "daily"],
    ["/marketplace/section/stock", 0.6, "daily"],
    ["/courses", 0.8, "daily"],
    ["/about", 0.7, "monthly"],
    ["/help", 0.7, "monthly"],
    ["/contact", 0.6, "monthly"],
    ["/blog", 0.7, "weekly"],
    ["/careers", 0.4, "monthly"],
    ["/press", 0.4, "monthly"],
    ["/status", 0.3, "daily"],
    ["/abuse", 0.3, "yearly"],
    // Trust pages — search engines weigh them.
    ["/privacy", 0.4, "yearly"],
    ["/terms", 0.4, "yearly"],
    ["/refund", 0.4, "yearly"],
    ["/cookies", 0.3, "yearly"],
  ];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map(([p, priority, changeFrequency]) => ({
    url: p ? u(p) : `${SITE_URL}/`,
    changeFrequency,
    priority,
  }));

  const [articles, listings, courses, brands, categories, posts] = await Promise.all([
    getArticles().catch(() => []),
    listingRows(),
    courseRows(),
    brandRows(),
    categoryRows(),
    publicPosts(),
  ]);

  // Blog articles written at /admin/blog; "hide from search" and articles
  // canonical to another site stay out.
  const blogEntries: MetadataRoute.Sitemap = articles
    .filter((a) => !a.noindex && !a.canonicalUrl)
    .map((a) => ({
      url: u(`/blog/${a.slug}`),
      lastModified: new Date(a.updatedAt),
      changeFrequency: "monthly",
      priority: 0.6,
      ...(a.coverImage ? { images: [new URL(a.coverImage, SITE_URL).toString()] } : {}),
    }));

  // unstable_cache serialises to JSON, so dates come back as strings.
  const d = (v: Date | string) => new Date(v);

  const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
    url: u(`/marketplace/${l.id}`),
    lastModified: d(l.updatedAt),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const courseEntries: MetadataRoute.Sitemap = courses.map((c) => ({
    url: u(`/courses/${encodeURIComponent(c.slug || c.id)}`),
    lastModified: d(c.updatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  const brandEntries: MetadataRoute.Sitemap = brands.map((b) => ({
    url: u(`/marketplace/brand/${encodeURIComponent(b.slug)}`),
    lastModified: d(b.updatedAt),
    changeFrequency: "weekly",
    priority: 0.5,
  }));
  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: u(`/courses/category/${encodeURIComponent(c.slug)}`),
    lastModified: d(c.updatedAt),
    changeFrequency: "weekly",
    priority: 0.5,
  }));
  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: u(`/post/${p.id}`),
    lastModified: d(p.updatedAt),
    changeFrequency: "daily",
    priority: 0.4,
  }));

  return [
    ...staticEntries,
    ...blogEntries,
    ...courseEntries,
    ...listingEntries,
    ...brandEntries,
    ...categoryEntries,
    ...postEntries,
  ];
}
