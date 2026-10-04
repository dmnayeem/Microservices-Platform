import "server-only";
import { unstable_cache } from "next/cache";
// A listing/course approved, edited or removed revalidates these tags, so it
// shows in (or leaves) the sitemap at once instead of within the hour.
import { PUBLIC_COURSES_TAG, PUBLIC_MARKETPLACE_TAG } from "@/lib/public-catalog-data";
import { prisma } from "@/lib/prisma";
import { publicAudienceEpochMs, publicSharingEnabled } from "@/lib/public-post";
import { getArticles } from "@/lib/blog";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * The sitemap, split by section.
 *
 * /sitemap.xml is an INDEX of one sitemap per section (/sitemaps/<name>.xml),
 * so Search Console reports how many pages each section has and how many are
 * indexed — one flat file of 45 URLs said neither. The URL Google was given
 * stays /sitemap.xml.
 *
 * Each dynamic block is ONE query selecting only the address and its date,
 * held in the data cache for an hour — a crawler fetching the sitemap never
 * costs a database read.
 */

export const SITEMAP_SECTIONS = ["pages", "blog", "marketplace", "courses", "posts"] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: ChangeFreq;
  priority?: number;
  images?: string[];
}

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

const u = (p: string) => (p ? `${SITE_URL}${p}` : `${SITE_URL}/`);
// unstable_cache serialises to JSON, so dates come back as strings.
const d = (v: Date | string) => new Date(v);

/**
 * Static marketing, trust and catalogue pages. No `lastModified`: stamping
 * them "now" on every rebuild tells Google they always changed, and it then
 * ignores lastmod for the whole site.
 */
function staticEntries(paths: Array<[string, number, ChangeFreq]>): SitemapEntry[] {
  return paths.map(([p, priority, changeFrequency]) => ({ url: u(p), changeFrequency, priority }));
}

export async function sitemapSection(section: SitemapSection): Promise<SitemapEntry[]> {
  switch (section) {
    case "pages":
      return staticEntries([
        ["", 1, "daily"],
        ["/microtask", 0.9, "weekly"],
        ["/features/marketplace", 0.9, "weekly"],
        ["/features/courses", 0.9, "weekly"],
        ["/features/affiliate", 0.8, "weekly"],
        ["/advertise", 0.8, "weekly"],
        // Not in the public menu (by request) — which makes listing it here
        // the only way a crawler ever finds it.
        ["/referral", 0.7, "weekly"],
        ["/about", 0.7, "monthly"],
        ["/help", 0.7, "monthly"],
        ["/contact", 0.6, "monthly"],
        ["/careers", 0.4, "monthly"],
        ["/press", 0.4, "monthly"],
        ["/status", 0.3, "daily"],
        ["/abuse", 0.3, "yearly"],
        // Trust pages — search engines weigh them.
        ["/privacy", 0.4, "yearly"],
        ["/terms", 0.4, "yearly"],
        ["/refund", 0.4, "yearly"],
        ["/cookies", 0.3, "yearly"],
      ]);

    case "blog": {
      // Blog articles written at /admin/blog; "hide from search" and articles
      // canonical to another site stay out.
      const articles = await getArticles().catch(() => []);
      return [
        ...staticEntries([["/blog", 0.7, "weekly"]]),
        ...articles
          .filter((a) => !a.noindex && !a.canonicalUrl)
          .map((a) => ({
            url: u(`/blog/${a.slug}`),
            lastModified: d(a.updatedAt),
            changeFrequency: "monthly" as const,
            priority: 0.6,
            ...(a.coverImage ? { images: [new URL(a.coverImage, SITE_URL).toString()] } : {}),
          })),
      ];
    }

    case "marketplace": {
      const [listings, brands] = await Promise.all([listingRows(), brandRows()]);
      return [
        ...staticEntries([
          ["/marketplace", 0.8, "daily"],
          ["/marketplace/section/services", 0.8, "daily"],
          ["/marketplace/section/products", 0.7, "daily"],
          ["/marketplace/section/assets", 0.7, "daily"],
          ["/marketplace/section/stock", 0.6, "daily"],
        ]),
        ...listings.map((l) => ({
          url: u(`/marketplace/${l.id}`),
          lastModified: d(l.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
        ...brands.map((b) => ({
          url: u(`/marketplace/brand/${encodeURIComponent(b.slug)}`),
          lastModified: d(b.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
      ];
    }

    case "courses": {
      const [courses, categories] = await Promise.all([courseRows(), categoryRows()]);
      return [
        ...staticEntries([["/courses", 0.8, "daily"]]),
        ...courses.map((c) => ({
          url: u(`/courses/${encodeURIComponent(c.slug || c.id)}`),
          lastModified: d(c.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        })),
        ...categories.map((c) => ({
          url: u(`/courses/category/${encodeURIComponent(c.slug)}`),
          lastModified: d(c.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
      ];
    }

    case "posts": {
      const [on, epochMs] = await Promise.all([
        publicSharingEnabled().catch(() => false),
        publicAudienceEpochMs().catch(() => null),
      ]);
      const posts = on && epochMs !== null ? await postRows(epochMs) : [];
      return posts.map((p) => ({
        url: u(`/post/${p.id}`),
        lastModified: d(p.updatedAt),
        changeFrequency: "daily" as const,
        priority: 0.4,
      }));
    }
  }
}

export function isSitemapSection(v: string): v is SitemapSection {
  return (SITEMAP_SECTIONS as readonly string[]).includes(v);
}

export function sitemapSectionUrl(section: SitemapSection): string {
  return `${SITE_URL}/sitemaps/${section}.xml`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const iso = (v: Date | undefined) => (v && !Number.isNaN(v.getTime()) ? v.toISOString() : null);

export function renderUrlset(entries: SitemapEntry[]): string {
  const hasImages = entries.some((e) => e.images?.length);
  const body = entries
    .map((e) => {
      const lm = iso(e.lastModified);
      return [
        "<url>",
        `<loc>${esc(e.url)}</loc>`,
        lm ? `<lastmod>${lm}</lastmod>` : "",
        e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : "",
        e.priority !== undefined ? `<priority>${e.priority}</priority>` : "",
        ...(e.images ?? []).map((i) => `<image:image><image:loc>${esc(i)}</image:loc></image:image>`),
        "</url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` +
    (hasImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : "") +
    `>\n${body}\n</urlset>\n`
  );
}

export function renderIndex(items: Array<{ loc: string; lastModified?: Date }>): string {
  const body = items
    .map((i) => {
      const lm = iso(i.lastModified);
      return `<sitemap>\n<loc>${esc(i.loc)}</loc>${lm ? `\n<lastmod>${lm}</lastmod>` : ""}\n</sitemap>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  );
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  // Shared caches may hold it for the hour the data is cached anyway.
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
};
