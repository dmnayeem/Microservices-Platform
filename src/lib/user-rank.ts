/**
 * Compute a user's rank on the XP leaderboard.
 *
 * Rank = 1 + count of users whose xp is strictly greater than this user's xp.
 * Ties are broken implicitly (a tied user is ranked the same as everyone else
 * with their xp, since none have strictly greater xp).
 *
 * Cached for 60 seconds per (userId, xpBucket) — leaderboard positions move
 * slowly enough that a one-minute staleness is invisible to the user.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

async function rawComputeRank(xp: number): Promise<number> {
  const ahead = await prisma.user.count({
    where: { xp: { gt: xp }, status: "ACTIVE" },
  });
  return ahead + 1;
}

/**
 * Returns the user's rank on the XP leaderboard.
 *
 * Pass `xp` so the cache key reflects the current xp bucket. When the user's
 * xp changes, a fresh cache entry is created automatically; the previous one
 * just expires harmlessly within 60s.
 */
export async function getXpRank(userId: string, xp: number): Promise<number> {
  // Bucket xp to keep cache hit rate sane while still being responsive.
  // 50-XP buckets at low ranks, doubling up at higher xp.
  const bucket = Math.floor(xp / 50);
  // The key must NOT include userId: rawComputeRank depends only on `xp`, so
  // including it fragmented one shared result into one entry per user — turning
  // a single cached full-table count into one count per viewer per minute.
  const cached = unstable_cache(
    () => rawComputeRank(xp),
    ["user-xp-rank", String(bucket)],
    { revalidate: 60 }
  );
  return cached();
}

// The XP curve itself lives in the client-safe `@/lib/level` (this module pulls
// in prisma + next/cache, so client components can't import it). Re-exported so
// existing server-side imports keep working.
export { calculateXpForLevel, levelProgress } from "@/lib/level";
