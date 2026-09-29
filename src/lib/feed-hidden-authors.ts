import { prisma } from "@/lib/prisma";

/**
 * Ids of BANNED / SUSPENDED accounts, whose posts must not surface in feed
 * lists. Feeds used to filter only `Post.isHidden`, so banning a spammer left
 * every one of their posts in everyone's feed.
 *
 * Why an id list and not a `user: { status: … }` relation filter: the main-feed
 * pool query orders ~500 rows by `lastActivityAt`; a relation filter turns that
 * into a semi-join against the whole User table on every request. This list is
 * small, read through the `User.status` index, cached by Accelerate for a
 * minute, and sorted so the feed queries that embed it keep a stable cache key.
 *
 * Applied as `userId: { notIn: ids }`. Fails open (empty list) — a failed read
 * must never blank the feed.
 */
export async function hiddenAuthorIds(): Promise<string[]> {
  try {
    const rows = await prisma.user.findMany({
      where: { status: { in: ["BANNED", "SUSPENDED"] } },
      select: { id: true },
      orderBy: { id: "asc" },
      cacheStrategy: { ttl: 60, swr: 120 },
    });
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}
