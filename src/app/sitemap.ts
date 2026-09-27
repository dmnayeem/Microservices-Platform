import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import {
  publicAudienceEpochMs,
  publicSharingEnabled,
} from "@/lib/public-post";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static marketing + feature pages.
  const staticPaths = [
    "",
    "/microtask",
    "/advertise",
    // Not in the public menu (by request) — which makes listing it here the
    // only way a crawler ever finds it.
    "/referral",
    "/features/marketplace",
    "/features/courses",
    "/features/affiliate",
    "/about",
    "/careers",
    "/press",
    "/help",
    "/contact",
    "/blog",
    "/courses",
    "/marketplace",
  ];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));

  // Dynamic: published courses + active listings. Best-effort — a DB blip must
  // not break the sitemap.
  const [courses, listings, posts] = await Promise.all([
    prisma.course
      .findMany({
        where: { status: "PUBLISHED", slug: { not: null } },
        select: { slug: true, updatedAt: true },
        take: 5000,
      })
      .catch(() => [] as { slug: string | null; updatedAt: Date }[]),
    prisma.marketplaceListing
      .findMany({
        where: { status: "ACTIVE" },
        select: { id: true, updatedAt: true },
        take: 5000,
      })
      .catch(() => [] as { id: string; updatedAt: Date }[]),
    // Public feed posts. The WHERE clause here is the same rule as
    // `isPubliclyVisible` in src/lib/public-post-gate.ts, and it has to stay
    // that way: listing a post in the sitemap that /post/[id] then refuses
    // hands Google a page of 404s, and listing one it should have refused would
    // invite a crawler to a post that is not public. `isPublic` DEFAULTS to
    // true, so `groupId: null` is doing as much work here as the flag is.
    // …and the same master switch, for the same reason. `/post/[id]` returns
    // null for every post while sharing is off, so listing them here would hand
    // Google five thousand 404s and advertise the addresses of posts nobody
    // agreed to publish.
    Promise.all([publicSharingEnabled(), publicAudienceEpochMs()]).then(
      ([on, epochMs]) =>
        on && epochMs !== null
        ? prisma.post
            .findMany({
              where: {
                isPublic: true,
                // The epoch, restated as a WHERE. `isPublic` DEFAULTS to true,
                // so without this every pre-picker post — none of whose authors
                // were ever offered a choice — would be handed to Google.
                createdAt: { gte: new Date(epochMs) },
                isHidden: false,
                groupId: null,
                user: { status: "ACTIVE" },
              },
              select: { id: true, updatedAt: true },
              orderBy: { createdAt: "desc" },
              take: 5000,
            })
            .catch(() => [] as { id: string; updatedAt: Date }[])
        : ([] as { id: string; updatedAt: Date }[])
    ),
  ]);

  const courseEntries: MetadataRoute.Sitemap = courses
    .filter((c): c is { slug: string; updatedAt: Date } => !!c.slug)
    .map((c) => ({
      url: `${SITE_URL}/courses/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
    url: `${SITE_URL}/marketplace/${l.id}`,
    lastModified: l.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/post/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: "daily",
    priority: 0.4,
  }));

  return [...staticEntries, ...courseEntries, ...listingEntries, ...postEntries];
}
