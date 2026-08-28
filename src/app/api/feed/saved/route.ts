import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  FEED_AUTHOR_SELECT,
  FEED_POST_SELECT,
  formatFeedPost,
  type FeedViewerContext,
} from "@/lib/feed-post-shape";

/**
 * The viewer's saved posts, newest-saved first.
 *
 * Uses the same select and the same formatter as the main feed
 * (`src/lib/feed-post-shape.ts`) so these render identically in `FeedPostCard` —
 * a second copy of the mapping here is exactly how one list ends up quietly
 * missing a field the other has.
 *
 * No ads, no promoted interleaving and no reshuffle: this is the user's own
 * list, in the order they built it.
 */

const PAGE = 20;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const saved = await prisma.savedPost.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE,
    select: { postId: true },
  });
  const ids = saved.map((s) => s.postId);
  if (ids.length === 0) {
    return NextResponse.json({ posts: [], hasMore: false });
  }

  const rows = (await prisma.post.findMany({
    where: { id: { in: ids }, isHidden: false },
    select: FEED_POST_SELECT,
  })) as unknown as Parameters<typeof formatFeedPost>[0][];

  // Keep the saved order — `findMany` with `in` does not preserve it.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

  const authorIds = [...new Set(ordered.map((p) => p.userId))];
  const [authors, likes, votes, follows, grouped] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: FEED_AUTHOR_SELECT,
    }),
    prisma.like.findMany({
      where: { userId, postId: { in: ids } },
      select: { postId: true, type: true },
    }),
    prisma.vote.findMany({
      where: { userId, postId: { in: ids } },
      select: { postId: true, optionId: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId, followingId: { in: authorIds } },
      select: { followingId: true },
    }),
    prisma.like.groupBy({
      by: ["postId", "type"],
      where: { postId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const reactionCounts: Record<string, Record<string, number>> = {};
  for (const g of grouped as Array<{
    postId: string;
    type: string;
    _count: { _all: number };
  }>) {
    (reactionCounts[g.postId] ??= {})[g.type] = g._count._all;
  }

  const ctx: FeedViewerContext = {
    viewerId: userId,
    liked: new Set(likes.map((l) => l.postId)),
    myReactions: new Map(likes.map((l) => [l.postId, l.type])),
    reactionCounts,
    // Everything in this list is saved by definition.
    saved: new Set(ids),
    votes: new Map(votes.map((v) => [v.postId, v.optionId])),
    following: new Set(follows.map((f) => f.followingId)),
    // Straight through, exactly as the feed does. This used to remap the row by
    // hand — renaming `package` to `packageTier` and dropping
    // `verifiedBadgeStyle` — so the card read a field that was not there and
    // badges rendered differently here than in the feed.
    users: new Map(
      (authors as Array<{ id: string }>).map((u) => [u.id, u])
    ),
  };

  return NextResponse.json({
    posts: ordered.map((p) => formatFeedPost(p, ctx)),
    hasMore: saved.length === PAGE,
  });
}
