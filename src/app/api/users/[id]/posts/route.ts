import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users/[id]/posts?limit=20&cursor=<postId>
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const cursor = searchParams.get("cursor");

  const posts = await prisma.post.findMany({
    where: { userId: id, isPublic: true, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      content: true,
      images: true,
      // The grid renders a text-only post on its coloured background, the same
      // one the feed gives it — without this those tiles are blank rectangles.
      backgroundStyle: true,
      isPinned: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,
      viewsCount: true,
      pollOptions: true,
      pollEndsAt: true,
      donationGoal: true,
      donationCollected: true,
      groupId: true,
      createdAt: true,
    },
  });

  // Likes by viewer
  let userLikes = new Set<string>();
  if (posts.length > 0) {
    const likes = await prisma.like.findMany({
      where: {
        userId: session.user.id,
        postId: { in: posts.map((p) => p.id) },
      },
      select: { postId: true },
    });
    userLikes = new Set(likes.map((l) => l.postId));
  }

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? slice[slice.length - 1].id : null;

  return NextResponse.json({
    posts: slice.map((p) => ({
      ...p,
      isLiked: userLikes.has(p.id),
    })),
    nextCursor,
  });
}
