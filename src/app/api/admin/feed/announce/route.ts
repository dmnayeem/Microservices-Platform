import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { extractMentionUsernames, resolveMentionedUsers } from "@/lib/mentions";

/**
 * POST /api/admin/feed/announce
 *
 * Create an OFFICIAL announcement post. Same payload as the regular
 * /api/feed POST, but the resulting post is flagged with
 * `isAnnouncement: true` so it pins to the top of the feed and renders
 * with the OFFICIAL badge.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "social.post"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    content?: string;
    images?: string[];
    pollOptions?: { label: string }[];
    pollEndsAt?: string;
    donationGoal?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, images, pollOptions, pollEndsAt, donationGoal } = body;

  if (!content || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Announcement content is required" },
      { status: 400 }
    );
  }
  if (content.length > 2000) {
    return NextResponse.json(
      { error: "Announcement cannot exceed 2000 characters" },
      { status: 400 }
    );
  }

  let formattedPoll:
    | { id: string; label: string; voteCount: number }[]
    | null = null;
  if (Array.isArray(pollOptions) && pollOptions.length >= 2) {
    formattedPoll = pollOptions.slice(0, 8).map((o, i) => ({
      id: `opt_${i}`,
      label: String(o.label ?? "").trim().slice(0, 100),
      voteCount: 0,
    }));
    if (formattedPoll.some((o) => !o.label)) {
      return NextResponse.json(
        { error: "Each poll option needs a label" },
        { status: 400 }
      );
    }
  }

  const post = await prisma.post.create({
    data: {
      userId: session.user.id,
      content: content.trim(),
      images: images || [],
      isPublic: true,
      isAnnouncement: true,
      pollOptions: formattedPoll ?? undefined,
      pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
      donationGoal:
        typeof donationGoal === "number" && donationGoal > 0
          ? Math.round(donationGoal)
          : null,
    },
  });

  // Mentions — same flow as a regular post.
  const usernames = extractMentionUsernames(post.content);
  if (usernames.length > 0) {
    const mentionedUsers = await resolveMentionedUsers(usernames);
    const filtered = mentionedUsers.filter((m) => m.id !== session.user!.id);
    if (filtered.length > 0) {
      await Promise.all(
        filtered.map((m) =>
          prisma.mention.create({
            data: {
              postId: post.id,
              mentionedUserId: m.id,
              mentionedById: session.user!.id,
            },
          })
        )
      );
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "ANNOUNCEMENT_POSTED",
      entity: "Post",
      entityId: post.id,
      newData: { content: post.content.slice(0, 200) },
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      level: true,
      package: { select: { slug: true, name: true } },
      isBlueVerified: true,
      role: true,
    },
  });

  return NextResponse.json({
    post: {
      id: post.id,
      content: post.content,
      images: post.images,
      isPublic: post.isPublic,
      isPinned: post.isPinned,
      isAnnouncement: post.isAnnouncement,
      isPromoted: post.isPromoted,
      promotedUntil: post.promotedUntil,
      promotedNote: post.promotedNote,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      viewsCount: 0,
      pollOptions: post.pollOptions ?? null,
      pollEndsAt: post.pollEndsAt,
      donationGoal: post.donationGoal,
      donationCollected: 0,
      groupId: post.groupId,
      myVote: null,
      createdAt: post.createdAt,
      user,
      isLiked: false,
      isOwner: true,
      isFollowingAuthor: false,
    },
    message: "Announcement posted",
  });
}
