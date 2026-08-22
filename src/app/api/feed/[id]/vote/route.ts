import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { z } from "zod";
import { recordUserAction } from "@/lib/goal-progress";

const schema = z.object({
  optionId: z.string().min(1),
});

interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, pollOptions: true, pollEndsAt: true },
  });
  if (!post || !post.pollOptions) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }
  if (post.pollEndsAt && post.pollEndsAt < new Date()) {
    return NextResponse.json({ error: "Poll has ended" }, { status: 400 });
  }

  const options = post.pollOptions as unknown as PollOption[];
  if (!options.some((o) => o.id === v.data.optionId)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  const existing = await prisma.vote.findUnique({
    where: {
      postId_userId: { postId: id, userId: session.user.id },
    },
  });

  await prisma.$transaction(async (tx) => {
    let updated = options.map((o) => ({ ...o }));
    if (existing) {
      // Decrement previous, increment new
      updated = updated.map((o) =>
        o.id === existing.optionId
          ? { ...o, voteCount: Math.max(0, o.voteCount - 1) }
          : o
      );
      await tx.vote.update({
        where: { id: existing.id },
        data: { optionId: v.data.optionId },
      });
    } else {
      await tx.vote.create({
        data: {
          postId: id,
          userId: session.user.id,
          optionId: v.data.optionId,
        },
      });
    }
    updated = updated.map((o) =>
      o.id === v.data.optionId ? { ...o, voteCount: o.voteCount + 1 } : o
    );
    await tx.post.update({
      where: { id },
      data: { pollOptions: updated },
    });
  });

  const refreshed = await prisma.post.findUnique({
    where: { id },
    select: { pollOptions: true, userId: true },
  });

  // Social earning + event progress — only on FIRST vote per user (not when
  // changing vote), and never on your own poll.
  if (!existing && refreshed) {
    await Promise.all([
      awardSocialEarning({
        postOwnerUserId: refreshed.userId,
        actorUserId: session.user.id,
        action: "VOTE_RECEIVED",
        postId: id,
      }),
      refreshed.userId === session.user.id
        ? Promise.resolve()
        : recordUserAction({
            userId: session.user.id,
            action: "feed_vote",
            targetId: id,
          }),
    ]);
  }

  return NextResponse.json({
    success: true,
    pollOptions: refreshed?.pollOptions,
    myVote: v.data.optionId,
  });
}
