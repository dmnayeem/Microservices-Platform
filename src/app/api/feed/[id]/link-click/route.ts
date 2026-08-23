import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dbRateLimit } from "@/lib/rate-limit-db";

// POST /api/feed/[id]/link-click — record a click on a link inside a post.
// Tracks BOTH total clicks (Post.linkClicksCount, spam-guarded by a short
// per-(user,post) cooldown) and unique clickers (one PostLinkClick row per user,
// mirroring PostView). Self-clicks by the post owner are excluded. Best-effort:
// the client fires this fire-and-forget when a link is opened.

// Per-(user, post) cooldown on TOTAL clicks, so one person can't inflate the
// count by re-clicking.
//
// This used to be a module-level `Map`. On serverless that is per-instance, so
// two requests landing on two instances both passed the cooldown and the count
// was inflatable in a loop — and the Map itself grew without bound on a warm
// instance. `dbRateLimit` is the shared, DB-backed limiter (the same one the
// money routes use); its unique index on (bucket, window) makes the check
// atomic across instances. The comment here used to point at ad-events.ts as
// having the same limitation — ad-events was fixed to a DB-backed bucket and
// this one was left behind.
const CLICK_COOLDOWN_MS = 30_000;

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

  // Total: count once per cooldown window. The limiter fails OPEN, so a
  // database blip over-counts rather than dropping a genuine click.
  const window = await dbRateLimit(`postlink:${userId}:${id}`, 1, CLICK_COOLDOWN_MS);
  const totalDelta = window.count === 1 ? 1 : 0;

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
