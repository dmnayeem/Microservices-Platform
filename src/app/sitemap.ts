import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static marketing + feature pages.
  const staticPaths = [
    "",
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
  const [courses, listings] = await Promise.all([
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

  return [...staticEntries, ...courseEntries, ...listingEntries];
}
