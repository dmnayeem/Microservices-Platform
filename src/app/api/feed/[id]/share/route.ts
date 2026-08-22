import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { z } from "zod";
import { recordUserAction } from "@/lib/goal-progress";

const schema = z.object({
  channel: z.string().max(40).optional(),
});

// POST /api/feed/[id]/share — record a unique share per (postId, sharerId).
// First share per (post, user) increments sharesCount and awards social earnings.
// Subsequent shares from the same user just refresh the channel field.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sharerId = session.user.id;

  const raw = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const channel = parsed.data.channel ?? null;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, userId: true, sharesCount: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // First share or repeat?
  const existing = await prisma.postShare.findUnique({
    where: { postId_userId: { postId: id, userId: sharerId } },
    select: { id: true },
  });

  if (existing) {
    // Update channel only — no double-count, no double-award
    if (channel) {
      await prisma.postShare.update({
        where: { postId_userId: { postId: id, userId: sharerId } },
        data: { channel },
      });
    }
    return NextResponse.json({
      shared: true,
      isFirst: false,
      sharesCount: post.sharesCount,
    });
  }

  // First share — atomic create + counter bump
  try {
    await prisma.$transaction([
      prisma.postShare.create({
        data: { postId: id, userId: sharerId, channel },
      }),
      prisma.post.update({
        where: { id },
        data: { sharesCount: { increment: 1 } },
      }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Race: another concurrent request just created the row — treat as repeat.
    if (msg.includes("Unique constraint") || msg.includes("duplicate key")) {
      return NextResponse.json({
        shared: true,
        isFirst: false,
        sharesCount: post.sharesCount,
      });
    }
    throw err;
  }

  await Promise.all([
    // Award recipient (post owner) and optionally actor (sharer)
    awardSocialEarning({
      postOwnerUserId: post.userId,
      actorUserId: sharerId,
      action: "SHARE_RECEIVED",
      postId: id,
    }),
    // Event progress. Only reached on a FIRST share (a repeat share returns
    // early above), and sharing your own post never counts.
    post.userId === sharerId
      ? Promise.resolve()
      : recordUserAction({
          userId: sharerId,
          action: "feed_share",
          targetId: id,
        }),
  ]);

  const updated = await prisma.post.findUnique({
    where: { id },
    select: { sharesCount: true },
  });

  return NextResponse.json({
    shared: true,
    isFirst: true,
    sharesCount: updated?.sharesCount ?? post.sharesCount + 1,
  });
}
