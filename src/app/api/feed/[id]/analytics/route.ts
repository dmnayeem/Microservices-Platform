import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/feed/[id]/analytics — owner-only post analytics + 7-day view sparkline.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      viewsCount: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,
      linkClicksCount: true,
      uniqueLinkClicksCount: true,
      donationCollected: true,
      socialEarnings: true,
      createdAt: true,
    },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Donations count
  const donationsCount = await prisma.donation.count({
    where: { postId: id },
  });

  // 7-day view sparkline — bucket PostView.viewedAt by day
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);
  const recentViews = await prisma.postView.findMany({
    where: { postId: id, viewedAt: { gte: sevenDaysAgo } },
    select: { viewedAt: true },
  });
  const buckets: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setUTCDate(d.getUTCDate() + i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const v of recentViews) {
    const k = v.viewedAt.toISOString().slice(0, 10);
    if (k in buckets) buckets[k] += 1;
  }
  const sparkline = Object.entries(buckets).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    post: {
      id: post.id,
      createdAt: post.createdAt,
      viewsCount: post.viewsCount,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      sharesCount: post.sharesCount,
      linkClicksCount: post.linkClicksCount,
      uniqueLinkClicksCount: post.uniqueLinkClicksCount,
      donationsCount,
      donationsCollected: post.donationCollected,
      socialEarnings: post.socialEarnings,
    },
    sparkline,
  });
}
