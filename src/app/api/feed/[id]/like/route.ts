import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { recordUserAction } from "@/lib/goal-progress";
import { toReactionType } from "@/lib/reactions";

// POST /api/feed/:id/like - Like a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Liking credits points via awardSocialEarning, so an unthrottled
    // like/unlike loop is a points-farming exploit as well as a write storm on
    // Post.likesCount. 60/min is far above human rates.
    const limited = await enforceDbRateLimit(
      request,
      "like",
      session.user.id,
      60,
      60_000
    );
    if (limited) return limited;

    const { id } = await params;
    // Which emoji. Anything unrecognised (or absent, e.g. an older client)
    // becomes a plain 👍, so this stays backward-compatible with callers that
    // just POST an empty body.
    const body = await request.json().catch(() => ({}));
    const type = toReactionType((body as { type?: unknown })?.type);

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: {
          userId: session.user.id,
          postId: id,
        },
      },
    });

    // Changing which emoji you picked is NOT a new reaction.
    //
    // The credit below (`awardSocialEarning`) and the event progress are keyed
    // on the post, precisely so unlike-then-relike cannot pay twice — which is
    // also why the DELETE handler deliberately doesn't decrement. Reactions have
    // to respect the same rule: switching between five emojis in a loop would
    // otherwise be a points printer. So a switch updates the row and returns,
    // touching no counter and crediting nothing.
    if (existingLike) {
      if (existingLike.type === type) {
        return NextResponse.json({
          liked: true,
          reaction: type,
          likesCount: post.likesCount,
          changed: false,
        });
      }
      await prisma.like.update({
        where: { postId_userId: { postId: id, userId: session.user.id } },
        data: { type },
      });
      return NextResponse.json({
        liked: true,
        reaction: type,
        likesCount: post.likesCount,
        changed: true,
      });
    }

    // First reaction from this user on this post — this is the one that counts.
    await prisma.like.create({
      data: {
        userId: session.user.id,
        postId: id,
        type,
      },
    });

    // Return the counter's OWN post-increment value. Reading a separate live
    // count here meant the number the liker saw could differ from the
    // denormalized `likesCount` the feed list renders on the next load.
    const { likesCount } = await prisma.post.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    });

    await Promise.all([
      // Social earning hook — recipient (owner) and optionally actor (liker)
      awardSocialEarning({
        postOwnerUserId: post.userId,
        actorUserId: session.user.id,
        action: "LIKE_RECEIVED",
        postId: id,
      }),
      // Event progress. Costs nothing when no active event wants likes.
      // Liking your own post never counts, and the dedup key is the POST — so
      // unlike-then-relike can't credit twice (which is also why the DELETE
      // handler below deliberately doesn't decrement).
      post.userId === session.user.id
        ? Promise.resolve()
        : recordUserAction({
            userId: session.user.id,
            action: "feed_like",
            targetId: id,
          }),
    ]);

    return NextResponse.json({
      liked: true,
      reaction: type,
      likesCount,
      changed: true,
    });
  } catch (error) {
    console.error("Error liking post:", error);
    return NextResponse.json(
      { error: "Failed to like post" },
      { status: 500 }
    );
  }
}

// DELETE /api/feed/:id/like - Unlike a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if like exists
    const like = await prisma.like.findUnique({
      where: {
        postId_userId: {
          userId: session.user.id,
          postId: id,
        },
      },
    });

    if (!like) {
      return NextResponse.json(
        { error: "Not liked" },
        { status: 400 }
      );
    }

    // Delete like
    await prisma.like.delete({
      where: {
        postId_userId: {
          userId: session.user.id,
          postId: id,
        },
      },
    });

    // Same here — one write, and its own result is what the client renders.
    // Clamped at 0 so a stale double-unlike can't drive the counter negative.
    const updated = await prisma.post.update({
      where: { id },
      data: { likesCount: { decrement: 1 } },
      select: { likesCount: true },
    });
    const likesCount = Math.max(0, updated.likesCount);

    return NextResponse.json({
      liked: false,
      likesCount,
    });
  } catch (error) {
    console.error("Error unliking post:", error);
    return NextResponse.json(
      { error: "Failed to unlike post" },
      { status: 500 }
    );
  }
}
