import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/feed/[id]/link-click — record a click on a link inside a post.
// Tracks BOTH total clicks (Post.linkClicksCount, spam-guarded by a short
// per-(user,post) cooldown) and unique clickers (one PostLinkClick row per user,
// mirroring PostView). Self-clicks by the post owner are excluded. Best-effort:
// the client fires this fire-and-forget when a link is opened.

// In-memory per-(user,post) cooldown for TOTAL clicks so one user can't inflate
// the count by rapid re-clicks. Per-instance only (same limitation as ad clicks
// in src/lib/ad-events.ts); unique counting is DB-enforced and exact.
const CLICK_COOLDOWN_MS = 30_000;
const lastTotalClick = new Map<string, number>();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, userId: true, linkClicksCount: true, uniqueLinkClicksCount: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  // Owner clicking their own link doesn't count.
  if (post.userId === userId) {
    return NextResponse.json({
      counted: false,
      linkClicksCount: post.linkClicksCount,
      uniqueLinkClicksCount: post.uniqueLinkClicksCount,
      reason: "self",
    });
  }

  // Unique: create the per-user row; increment the unique counter only on first.
  let uniqueDelta = 0;
  try {
    await prisma.postLinkClick.create({ data: { postId: id, userId } });
    uniqueDelta = 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already clicked before → not a new unique clicker.
    if (!msg.includes("Unique constraint") && !msg.includes("duplicate key")) {
      throw err;
    }
  }

  // Total: increment past the cooldown window only.
  const key = `${userId}:${id}`;
  const now = Date.now();
  const last = lastTotalClick.get(key) ?? 0;
  let totalDelta = 0;
  if (now - last > CLICK_COOLDOWN_MS) {
    lastTotalClick.set(key, now);
    totalDelta = 1;
  }

  if (uniqueDelta > 0 || totalDelta > 0) {
    await prisma.post.update({
      where: { id },
      data: {
        linkClicksCount: { increment: totalDelta },
        uniqueLinkClicksCount: { increment: uniqueDelta },
      },
    });
  }

  return NextResponse.json({
    counted: totalDelta > 0 || uniqueDelta > 0,
    linkClicksCount: post.linkClicksCount + totalDelta,
    uniqueLinkClicksCount: post.uniqueLinkClicksCount + uniqueDelta,
  });
}
