import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/feed/:id - Get single post with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    // Get post
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const isOwner = post.userId === session?.user?.id;

    // Check if post is private and user doesn't own it
    if (!post.isPublic && !isOwner) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Moderator-hidden content must not be readable at its permalink either.
    // Every other surface filters `isHidden: false` — the feed list, the pulse
    // endpoint, the cached count — but this route checked only `isPublic`, so a
    // post hidden for harassment or a scam stayed fully accessible, comments
    // included, to anyone holding the link. The author still sees their own.
    if (post.isHidden && !isOwner) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // A post inside a PRIVATE group is readable only by its members. Group
    // membership is checked when POSTING but was never checked when reading.
    if (post.groupId && !isOwner) {
      const group = await prisma.group.findUnique({
        where: { id: post.groupId },
        select: { type: true },
      });
      if (group?.type === "PRIVATE") {
        const member = session?.user?.id
          ? await prisma.groupMember.findFirst({
              where: { groupId: post.groupId, userId: session.user.id },
              select: { id: true },
            })
          : null;
        if (!member) {
          return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }
      }
    }

    // Get user info
    const postUser = await prisma.user.findUnique({
      where: { id: post.userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        level: true,
        package: { select: { slug: true, name: true } },
      },
    });

    // Get comments
    const comments = await prisma.comment.findMany({
      where: { postId: id, isHidden: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get comment users
    const commentUserIds = [...new Set(comments.map((c) => c.userId))];
    const commentUsers = await prisma.user.findMany({
      where: { id: { in: commentUserIds } },
      select: { id: true, name: true, avatar: true },
    });
    const commentUserMap = new Map(commentUsers.map((u) => [u.id, u]));

    // Check if current user has liked the post
    let isLiked = false;
    if (session?.user?.id) {
      const like = await prisma.like.findFirst({
        where: { postId: id, userId: session.user.id },
      });
      isLiked = !!like;
    }

    return NextResponse.json({
      post: {
        id: post.id,
        content: post.content,
        images: post.images,
        isPublic: post.isPublic,
        isPinned: post.isPinned,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        sharesCount: post.sharesCount,
        createdAt: post.createdAt,
        user: postUser,
        isLiked,
        isOwner: session?.user?.id === post.userId,
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          user: commentUserMap.get(c.userId),
          isOwner: session?.user?.id === c.userId,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500 }
    );
  }
}

// PUT /api/feed/:id - Update post
export async function PUT(
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
    const { content, images, isPublic } = body;

    // Get post and verify ownership
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Validate content
    if (content && content.length > 2000) {
      return NextResponse.json(
        { error: "Post content cannot exceed 2000 characters" },
        { status: 400 }
      );
    }

    // Update post
    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        ...(content !== undefined && { content: content.trim() }),
        ...(images !== undefined && { images }),
        ...(isPublic !== undefined && { isPublic }),
      },
    });

    return NextResponse.json({
      post: updatedPost,
      message: "Post updated successfully",
    });
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

// DELETE /api/feed/:id - Delete post
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

    // Get post and verify ownership
    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Delete post (cascade will delete comments and likes)
    await prisma.post.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}
