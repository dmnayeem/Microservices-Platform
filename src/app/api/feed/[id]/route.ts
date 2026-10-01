import { NextRequest, NextResponse } from "next/server";
import { validPostImages } from "@/lib/post-images";
import { firstUrl } from "@/lib/link-preview";
import { isEmbeddableVideoUrl } from "@/lib/video-url";
import { screenLinks } from "@/lib/link-safety";
import { userCanFeature } from "@/lib/packages";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicAudienceEpochMs } from "@/lib/public-post";
import { authorChosePublic, postAudience } from "@/lib/public-post-gate";

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

    // NO `isPublic` check. It used to 404 a non-owner on `isPublic: false`,
    // back when nothing ever wrote false. `isPublic` is now the author's
    // internet-audience choice, and "Members only" means exactly this route,
    // for a signed-in member — refusing it here would turn the option into
    // "only me". Logged-out reach is /post/[id]'s business, and that surface
    // goes through `isPubliclyVisible` alone.

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
    const { content, images, isPublic } = body as {
      content?: string;
      images?: string[];
      isPublic?: boolean;
    };

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
    if (content !== undefined && (typeof content !== "string" || content.length > 2000)) {
      return NextResponse.json(
        { error: "Post content cannot exceed 2000 characters" },
        { status: 400 }
      );
    }
    // Creating requires content; editing it away left a blank post behind.
    if (content !== undefined && content.trim().length === 0) {
      return NextResponse.json(
        { error: "Post content is required" },
        { status: 400 }
      );
    }
    if (images !== undefined && validPostImages(images) === null) {
      return NextResponse.json({ error: "Invalid images" }, { status: 400 });
    }

    // Phishing / malware links — the same screen as posting.
    if (typeof content === "string") {
      const links = await screenLinks(
        { texts: [content] },
        { userId: session.user.id, entityType: "post", entityId: id }
      );
      if (!links.ok) {
        return NextResponse.json({ error: links.message }, { status: 400 });
      }
    }

    // The same link gate as posting. Editing skipped it, so a user without the
    // link grant could post plain text and then edit a link in.
    const role = session.user.role;
    const isPrivileged = !!role && role !== "USER" && role !== "user";
    const newUrl = !isPrivileged && content ? firstUrl(content.trim()) : null;
    if (newUrl && newUrl !== firstUrl(post.content ?? "")) {
      const isVideo = isEmbeddableVideoUrl(newUrl);
      if (!(await userCanFeature(session.user.id, isVideo ? "shareYouTube" : "shareLinks"))) {
        return NextResponse.json(
          {
            error: isVideo
              ? "Sharing YouTube/video links isn't enabled for your account. Ask an admin to enable it."
              : "Sharing links isn't enabled for your account. Ask an admin to enable it.",
          },
          { status: 403 }
        );
      }
    }

    // The audience is editable, with one refusal: a post written BEFORE the
    // picker existed cannot be switched to Public.
    //
    // The reason is that there is nowhere to record the consent. `isPublic` on
    // an old row is a column default, and the gate distinguishes a default from
    // a choice purely by `createdAt >= epoch` — a pre-epoch row that flips the
    // boolean is indistinguishable from the thousands that never chose
    // anything, so honouring it would mean weakening the rule for all of them.
    // (`updatedAt` cannot stand in: it is `@updatedAt` and every like and view
    // counter bumps it.) Told plainly rather than silently ignored.
    const epochMs = await publicAudienceEpochMs();
    if (isPublic === true && !authorChosePublic({ isPublic: true, createdAt: post.createdAt }, epochMs)) {
      return NextResponse.json(
        {
          error:
            "Posts written before the audience picker existed stay Members only. Post it again to share it publicly.",
        },
        { status: 400 }
      );
    }

    // Update post
    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        ...(content !== undefined && { content: content.trim() }),
        ...(images !== undefined && { images }),
        // Booleans only, and never public inside a group.
        ...(typeof isPublic === "boolean" && {
          isPublic: isPublic && !post.groupId,
        }),
      },
    });

    return NextResponse.json({
      post: {
        ...updatedPost,
        audience: postAudience(updatedPost, epochMs),
      },
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
