import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const POPUPS_TAG = "site-popups";

/**
 * Every active popup, one cached read shared by all viewers (a minute, or until
 * an admin saves one). Filtering by viewer happens in memory afterwards, for
 * the same reason banners do it: a per-viewer query would be a cache entry per
 * profile.
 */
export const activePopups = unstable_cache(
  async () =>
    prisma.sitePopup.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ["site-popups-active"],
  { revalidate: 60, tags: [POPUPS_TAG] }
);
