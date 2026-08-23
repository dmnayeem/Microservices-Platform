import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { extractMentionUsernames, resolveMentionedUsers } from "@/lib/mentions";
import { recordUserAction } from "@/lib/goal-progress";
import { deleteCommentCascade } from "@/lib/content-delete";

// GET /api/feed/:id/comments - Get post comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Get comments
    const [commentsList, total] = await Promise.all([
      prisma.comment.findMany({
        where: { postId: id, isHidden: false },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.comment.count({ where: { postId: id, isHidden: false } }),
    ]);

    // Get users for comments
    const userIds = [...new Set(commentsList.map((c) => c.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        avatar: true,
        level: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      comments: commentsList.map((c) => ({
        id: c.id,
        content: c.content,
        parentId: c.parentId,
        createdAt: c.createdAt,
        user: userMap.get(c.userId),
        isOwner: session?.user?.id === c.userId,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/feed/:id/comments - Add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, parentId } = body as { content?: string; parentId?: string };

    // Validate content
    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      );
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: "Comment cannot exceed 500 characters" },
        { status: 400 }
      );
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Validate parentId if provided
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.postId !== id) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 400 }
        );
      }
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        postId: id,
        userId: session.user.id,
        content: content.trim(),
        parentId: parentId ?? null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            level: true,
          },
        },
      },
    });

    // Update comment count + bump freshness so a newly-commented post
    // resurfaces in the smart feed ("new comment → back to top").
    await prisma.post.update({
      where: { id },
      data: { commentsCount: { increment: 1 }, lastActivityAt: new Date() },
    });

    await Promise.all([
      // Social earning — recipient (owner) and optionally actor (commenter)
      awardSocialEarning({
        postOwnerUserId: post.userId,
        actorUserId: session.user.id,
        action: "COMMENT_RECEIVED",
        postId: id,
      }),
      // Event progress — deduped per POST, not per comment, so 100 comments on
      // one post count once. Commenting on your own post never counts.
      post.userId === session.user.id
        ? Promise.resolve()
        : recordUserAction({
            userId: session.user.id,
            action: "feed_comment",
            targetId: id,
          }),
    ]);

    // Mentions in this comment
    const usernames = extractMentionUsernames(content);
    if (usernames.length > 0) {
      const mentionedUsers = await resolveMentionedUsers(usernames);
      // Don't notify/earn if user mentions themselves or the post owner (post owner already got COMMENT_RECEIVED)
      const filtered = mentionedUsers.filter(
        (m) => m.id !== session.user!.id
      );
      if (filtered.length > 0) {
        // One insert for every mention, not one per mention.
        await prisma.mention.createMany({
          data: filtered.map((m) => ({
            commentId: comment.id,
            postId: id,
            mentionedUserId: m.id,
            mentionedById: session.user!.id,
          })),
          skipDuplicates: true,
        });
        // Credit concurrently instead of sequentially: awardSocialEarning is
        // ~13 queries, so a comment mentioning 5 people used to serialize 65+
        // round-trips while the commenter waited. Each is independent and
        // idempotent (unique `reference`), so failures are per-mention.
        await Promise.all(
          filtered.map((m) =>
            awardSocialEarning({
              postOwnerUserId: m.id,
              actorUserId: session.user!.id,
              action: "MENTION_RECEIVED",
              postId: id,
            }).catch(() => {})
          )
        );
      }
    }

    return NextResponse.json({
      comment: {
        id: comment.id,
        content: comment.content,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        user: comment.user,
        isOwner: true,
      },
      message: "Comment added successfully",
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/feed/:id/comments - Delete a comment (by comment ID in query)
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
    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json(
        { error: "Comment ID required" },
        { status: 400 }
      );
    }

    // Get comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.postId !== id) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (comment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Delete the comment AND its replies, and correct the count by how many
    // actually went. `Comment.parentId` has no `onDelete`, so a plain delete
    // nulled the children instead of removing them — replies were silently
    // promoted to top-level comments on the same post, while `commentsCount`
    // dropped by 1 no matter how many comments vanished from the thread.
    const outcome = await deleteCommentCascade(commentId);
    if (!outcome.ok) {
      return NextResponse.json(
        { error: "Failed to delete comment" },
        { status: outcome.reason === "not_found" ? 404 : 500 }
      );
    }

    return NextResponse.json({
      message: "Comment deleted successfully",
      repliesRemoved: outcome.extra,
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
