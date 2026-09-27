import { prisma } from "@/lib/prisma";

export interface TrendingHashtag {
  tag: string; // includes leading "#"
  count: number;
}

// Shown when no hashtags exist in recent posts yet (demo/fallback).
const DEMO_HASHTAGS: TrendingHashtag[] = [
  { tag: "#RevType", count: 128 },
  { tag: "#PassiveIncome", count: 96 },
  { tag: "#DailyMission", count: 74 },
  { tag: "#Referrals", count: 61 },
  { tag: "#SideHustle", count: 52 },
  { tag: "#Crypto", count: 40 },
];

/**
 * Derive trending hashtags by scanning recent public posts' content. There is no
 * hashtag index, so this is a cheap best-effort over the latest ~150 posts.
 * Falls back to demo tags when the community hasn't used hashtags yet.
 */
export async function getTrendingHashtags(limit = 6): Promise<TrendingHashtag[]> {
  try {
    const posts = await prisma.post.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 150,
      select: { content: true },
      // Trending changes slowly — serve from Accelerate cache.
      cacheStrategy: { ttl: 300, swr: 600 },
    });
    const counts = new Map<string, number>();
    for (const p of posts) {
      const found = p.content.match(/#[\p{L}\p{N}_]{2,50}/gu);
      if (!found) continue;
      for (const raw of found) {
        const tag = raw.toLowerCase();
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    if (sorted.length > 0) return sorted;
  } catch {
    /* fall through to demo */
  }
  return DEMO_HASHTAGS.slice(0, limit);
}
