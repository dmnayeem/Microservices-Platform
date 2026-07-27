import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { awardSocialEarning } from "@/lib/social-earning";
import { getEffectivePackage, userCanFeature } from "@/lib/packages";
import { extractMentionUsernames, resolveMentionedUsers } from "@/lib/mentions";
import { isValidPostBackground } from "@/lib/post-backgrounds";
import { fetchLinkPreview, firstUrl } from "@/lib/link-preview";
import { isEmbeddableVideoUrl } from "@/lib/video-url";
import type { Prisma } from "@/generated/prisma/client";

// GET /api/feed - Get feed posts
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const userId = searchParams.get("userId"); // For user profile posts
    const groupId = searchParams.get("groupId"); // For group-filtered feed
    const tag = searchParams.get("tag"); // Hashtag feed (without leading '#')
    const search = searchParams.get("search"); // Free-text content search
    const skip = (page - 1) * limit;

    // Build query
    const where: Record<string, unknown> = {
      isPublic: true,
      isHidden: false, // agency-moderator soft-hidden posts never surface
    };

    if (userId) {
      where.userId = userId;
    }
    if (groupId) {
      where.groupId = groupId;
    }
    // Hashtag / free-text filters. There's no hashtag index, so this is a
    // case-insensitive substring match against post content ("#tag" for tags).
    if (tag) {
      const clean = tag.replace(/^#/, "").slice(0, 50);
      if (clean) {
        where.content = { contains: `#${clean}`, mode: "insensitive" };
      }
    } else if (search) {
      const q = search.trim().slice(0, 100);
      if (q) {
        where.content = { contains: q, mode: "insensitive" };
      }
    }

    // Get posts. Sort priority:
    //   1. Announcements (admin OFFICIAL posts) — top of feed
    //   2. User-paid Boost (isPinned)
    //   3. Recency
    // Promoted posts are NOT pulled in here; they're merged in below so we
    // can interleave them every ~4 organic posts and respect promotedUntil.
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { ...where, isAnnouncement: false, isPromoted: false },
        orderBy: [
          { isPinned: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    // Announcements + active promoted posts — only on page 1, prepended
    // and interleaved respectively. On page 2+ the user has already seen
    // them so we skip to keep the feed feeling fresh.
    const now = new Date();
    type FeedPost = (typeof posts)[number];
    let announcements: FeedPost[] = [];
    let promoted: FeedPost[] = [];
    if (page === 1 && !userId && !groupId && !tag && !search) {
      [announcements, promoted] = await Promise.all([
        prisma.post.findMany({
          where: { ...where, isAnnouncement: true },
          orderBy: [{ createdAt: "desc" }],
          take: 5,
        }),
        prisma.post.findMany({
          where: {
            ...where,
            isPromoted: true,
            OR: [{ promotedUntil: null }, { promotedUntil: { gt: now } }],
          },
          orderBy: [{ createdAt: "desc" }],
          take: 5,
        }),
      ]);
    }

    // Combine for downstream lookups (users, likes, votes). We include
    // announcements + promoted in the union so badges/likes/votes resolve
    // for them too.
    const allPosts = [...announcements, ...posts, ...promoted];

    // Get post users
    const userIds = [...new Set(allPosts.map((p) => p.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        level: true,
        package: { select: { slug: true, name: true } },
        isBlueVerified: true,
        verifiedBadgeStyle: true,
        role: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Check if current user has liked each post
    let userLikes: Set<string> = new Set();
    let followingSet: Set<string> = new Set();
    if (session?.user?.id) {
      const likes = await prisma.like.findMany({
        where: {
          userId: session.user.id,
          postId: { in: allPosts.map((p) => p.id) },
        },
        select: { postId: true },
      });
      userLikes = new Set(likes.map((l) => l.postId));

      // Which post-authors does the viewer already follow?
      if (userIds.length > 0) {
        const follows = await prisma.follow.findMany({
          where: {
            followerId: session.user.id,
            followingId: { in: userIds },
          },
          select: { followingId: true },
        });
        followingSet = new Set(follows.map((f) => f.followingId));
      }
    }

    // Capture user's votes for polls
    let userVoteMap = new Map<string, string>();
    if (session?.user?.id) {
      const votes = await prisma.vote.findMany({
        where: {
          userId: session.user.id,
          postId: { in: allPosts.map((p) => p.id) },
        },
        select: { postId: true, optionId: true },
      });
      userVoteMap = new Map(votes.map((v) => [v.postId, v.optionId]));
    }

    type FormattablePost = (typeof allPosts)[number];
    const formatPost = (post: FormattablePost) => ({
      id: post.id,
      content: post.content,
      images: post.images,
      backgroundStyle: post.backgroundStyle,
      isPublic: post.isPublic,
      isPinned: post.isPinned,
      isAnnouncement: post.isAnnouncement,
      isPromoted: post.isPromoted,
      promotedUntil: post.promotedUntil,
      promotedNote: post.promotedNote,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      sharesCount: post.sharesCount,
      viewsCount: post.viewsCount,
      pollOptions: post.pollOptions ?? null,
      pollEndsAt: post.pollEndsAt,
      donationGoal: post.donationGoal,
      donationCollected: post.donationCollected,
      linkPreview: post.linkPreview ?? null,
      groupId: post.groupId,
      myVote: userVoteMap.get(post.id) ?? null,
      createdAt: post.createdAt,
      user: userMap.get(post.userId),
      isLiked: userLikes.has(post.id),
      isOwner: session?.user?.id === post.userId,
      isFollowingAuthor: followingSet.has(post.userId),
    });

    // Interleave: announcements at top → organic posts with one promoted
    // injected every ~4 entries.
    const organic = posts.map(formatPost);
    const promotedFormatted = promoted.map(formatPost);
    const interleaved: ReturnType<typeof formatPost>[] = [];
    let promoIdx = 0;
    organic.forEach((p, i) => {
      interleaved.push(p);
      if (promoIdx < promotedFormatted.length && (i + 1) % 4 === 0) {
        interleaved.push(promotedFormatted[promoIdx++]);
      }
    });
    // Any leftover promoted posts go at the end of the page.
    while (promoIdx < promotedFormatted.length) {
      interleaved.push(promotedFormatted[promoIdx++]);
    }

    const formattedPosts = [
      ...announcements.map(formatPost),
      ...interleaved,
    ];

    return NextResponse.json({
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching feed:", error);
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 500 }
    );
  }
}

// POST /api/feed - Create a new post
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      content,
      images,
      isPublic,
      pollOptions,
      pollEndsAt,
      donationGoal,
      groupId,
      backgroundStyle,
      disableLinkPreview,
    } = body as {
      content?: string;
      images?: string[];
      isPublic?: boolean;
      pollOptions?: { label: string }[];
      pollEndsAt?: string;
      donationGoal?: number;
      groupId?: string | null;
      backgroundStyle?: string | null;
      disableLinkPreview?: boolean;
    };

    // Facebook-style colored background — only valid for text-only posts.
    const resolvedBackground =
      backgroundStyle &&
      isValidPostBackground(backgroundStyle) &&
      (!Array.isArray(images) || images.length === 0)
        ? backgroundStyle
        : null;

    // Validate content
    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Post content is required" },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return NextResponse.json(
        { error: "Post content cannot exceed 2000 characters" },
        { status: 400 }
      );
    }

    // Link/video sharing is an admin-granted capability for normal users. A URL
    // in the post requires shareLinks (plain link) or shareYouTube (YouTube/
    // Vimeo/video). Privileged roles (admins/staff) bypass this gate.
    const role = session.user.role;
    const isPrivileged = !!role && role !== "USER" && role !== "user";
    if (!isPrivileged) {
      const urlInContent = firstUrl(content.trim());
      if (urlInContent) {
        const isVideo = isEmbeddableVideoUrl(urlInContent);
        const need = isVideo ? "shareYouTube" : "shareLinks";
        if (!(await userCanFeature(session.user.id, need))) {
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
    }

    // Per-plan daily post limit (-1 = unlimited).
    const pkg = await getEffectivePackage(session.user.id);
    const dailyPostLimit = pkg?.dailyPostLimit ?? -1;
    if (dailyPostLimit !== -1) {
      // Use UTC day boundary to match how every other daily counter here
      // (AI usage, mission logs) keys its day — avoids a server-timezone skew.
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const postsToday = await prisma.post.count({
        where: { userId: session.user.id, createdAt: { gte: dayStart } },
      });
      if (postsToday >= dailyPostLimit) {
        return NextResponse.json(
          {
            error: `Daily post limit reached (${dailyPostLimit}/day). Try again tomorrow.`,
          },
          { status: 429 }
        );
      }
    }

    // Build poll structure if provided
    let formattedPoll: { id: string; label: string; voteCount: number }[] | null =
      null;
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

    // If posting to a group, ensure user is a member
    if (groupId) {
      const member = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId: session.user.id },
        },
      });
      if (!member) {
        return NextResponse.json(
          { error: "You must be a group member to post here" },
          { status: 403 }
        );
      }
    }

    // Create post
    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content: content.trim(),
        images: images || [],
        backgroundStyle: resolvedBackground,
        isPublic: isPublic !== false,
        pollOptions: formattedPoll ?? undefined,
        pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
        donationGoal:
          typeof donationGoal === "number" && donationGoal > 0
            ? Math.round(donationGoal)
            : null,
        groupId: groupId ?? null,
      },
    });

    // Social earning — author gets daily post-create bonus (capped 1×/day via reference)
    await awardSocialEarning({
      postOwnerUserId: session.user.id,
      actorUserId: session.user.id,
      action: "POST_CREATE",
      postId: post.id,
    });

    // Mentions in the post body
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
        for (const m of filtered) {
          await awardSocialEarning({
            postOwnerUserId: m.id,
            actorUserId: session.user!.id,
            action: "MENTION_RECEIVED",
            postId: post.id,
          });
        }
      }
    }

    // Best-effort OpenGraph link preview for the first URL in the post. Guarded
    // (SSRF + timeout) inside fetchLinkPreview; failure never breaks the post.
    // Skipped when the post has images (image takes priority) or the user
    // dismissed the composer preview (disableLinkPreview).
    let linkPreview: Awaited<ReturnType<typeof fetchLinkPreview>> = null;
    const previewUrl =
      disableLinkPreview || (post.images?.length ?? 0) > 0
        ? null
        : firstUrl(post.content);
    if (previewUrl) {
      try {
        linkPreview = await fetchLinkPreview(previewUrl);
        if (linkPreview) {
          await prisma.post.update({
            where: { id: post.id },
            data: { linkPreview: linkPreview as unknown as Prisma.InputJsonValue },
          });
        }
      } catch {
        linkPreview = null;
      }
    }

    // Get user info
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
      },
    });

    return NextResponse.json({
      post: {
        id: post.id,
        content: post.content,
        images: post.images,
        backgroundStyle: post.backgroundStyle,
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
        isFollowingAuthor: false,
        pollOptions: post.pollOptions,
        pollEndsAt: post.pollEndsAt,
        donationGoal: post.donationGoal,
        donationCollected: post.donationCollected,
        linkPreview,
        groupId: post.groupId,
        myVote: null,
        createdAt: post.createdAt,
        user,
        isLiked: false,
        isOwner: true,
      },
      message: "Post created successfully",
    });
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
