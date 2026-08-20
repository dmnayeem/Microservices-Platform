import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";

/**
 * Batched post-view beacon.
 *
 * Replaces `POST /api/feed/[id]/view`, which ran **per post scrolled past**:
 * a `findUnique`, a two-statement `$transaction`, `awardSocialEarning` (itself
 * ~11 queries including an interactive transaction holding a `User` row lock),
 * and then a re-read. About 15 queries per post — so scrolling one 20-post page
 * cost roughly 300 queries and produced 20 notification rows.
 *
 * Here the client sends the ids it actually saw, once, and the whole batch costs
 * a handful of queries: one `createMany` (the unique index does the dedup), one
 * `updateMany` for the counters, and earnings credited only for the views that
 * were genuinely new.
 */

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const viewerId = session.user.id;

  const limited = await enforceDbRateLimit(request, "post-views", viewerId, 60, 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const ids = [...new Set(parsed.data.ids)];

  // Own posts never count as views.
  const posts = await prisma.post.findMany({
    where: { id: { in: ids }, userId: { not: viewerId } },
    select: { id: true, userId: true },
  });
  if (posts.length === 0) return NextResponse.json({ counted: 0 });

  // Work out which are genuinely new BEFORE inserting, so counters and earnings
  // are attributed exactly once. (`createMany` returns a count, not rows, so it
  // can't tell us which ids it actually inserted.)
  const seen = await prisma.postView.findMany({
    where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
    select: { postId: true },
  });
  const seenIds = new Set(seen.map((v) => v.postId));
  const freshPosts = posts.filter((p) => !seenIds.has(p.id));
  if (freshPosts.length === 0) return NextResponse.json({ counted: 0 });

  // `skipDuplicates` still guards the race where the same viewer's two tabs
  // report the same post at once — the @@unique([postId, userId]) index decides.
  const created = await prisma.postView.createMany({
    data: freshPosts.map((p) => ({ postId: p.id, userId: viewerId })),
    skipDuplicates: true,
  });
  if (created.count === 0) return NextResponse.json({ counted: 0 });

  await prisma.post.updateMany({
    where: { id: { in: freshPosts.map((p) => p.id) } },
    data: { viewsCount: { increment: 1 } },
  });

  // Earnings stay per (post owner, view) because that is what the payout rules
  // are defined on — but they are now credited for a whole scroll at once
  // instead of blocking each individual beacon.
  for (const p of freshPosts) {
    await awardSocialEarning({
      postOwnerUserId: p.userId,
      actorUserId: viewerId,
      action: "VIEW_RECEIVED",
      postId: p.id,
    }).catch(() => {});
  }

  return NextResponse.json({ counted: freshPosts.length });
}
