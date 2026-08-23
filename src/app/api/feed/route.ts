import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { awardSocialEarning } from "@/lib/social-earning";
import { getEffectivePackage, userCanFeature } from "@/lib/packages";
import { extractMentionUsernames, resolveMentionedUsers } from "@/lib/mentions";
import { isValidPostBackground } from "@/lib/post-backgrounds";
import { fetchLinkPreview, firstUrl } from "@/lib/link-preview";
import { isEmbeddableVideoUrl } from "@/lib/video-url";
import {
  scorePost,
  dayKey,
  POOL_SIZE,
  type RankablePost,
} from "@/lib/feed-ranking";
import { getUserDayContext } from "@/lib/user-day";
import { getAdDensity } from "@/lib/ad-density";
import { getSetting } from "@/lib/system-settings";
import type { Prisma } from "@/generated/prisma/client";
import { recordUserAction } from "@/lib/goal-progress";

// GET /api/feed - Get feed posts
// Exactly the columns `formatPost` below reads. Without a select, Prisma
// returns EVERY column for all 500 pool rows — content, images[], and the
// pollOptions/linkPreview JSON — which is 1-2 MB per feed request through the
// Accelerate proxy, and heads straight for its response-size cap (P6009, which
// this codebase deliberately never retries).
const FEED_POST_SELECT = {
  id: true,
  userId: true,
  content: true,
  images: true,
  backgroundStyle: true,
  isPublic: true,
  isPinned: true,
  isAnnouncement: true,
  isPromoted: true,
  promotedUntil: true,
  promotedNote: true,
  boostedUntil: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  linkClicksCount: true,
  uniqueLinkClicksCount: true,
  pollOptions: true,
  pollEndsAt: true,
  donationGoal: true,
  donationCollected: true,
  linkPreview: true,
  groupId: true,
  createdAt: true,
  lastActivityAt: true,
} as const;

/** A pool row: exactly the columns FEED_POST_SELECT asks for. */
type FeedPostRow = Prisma.PostGetPayload<{ select: typeof FEED_POST_SELECT }>;

/**
 * Total post count for the UNFILTERED main feed. It is the same number for every
 * viewer, it only feeds a `totalPages` that an infinite-scroll feed never renders,
 * and it is a full count over the largest table in the database — previously run
 * on every feed request and every 30s poll. Cached for a minute.
 */
const cachedMainFeedCount = unstable_cache(
  async () => prisma.post.count({ where: { isPublic: true, isHidden: false } }),
  ["feed-main-total"],
  { revalidate: 60 }
);

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
    const seed = searchParams.get("seed"); // Per-session jitter seed (reshuffle)
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
      // A PRIVATE group's posts are for its members. Posting into a group checks
      // membership; reading never did, so `?groupId=<any private group>` handed
      // its whole feed to anyone who knew the id.
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { type: true },
      });
      if (group?.type === "PRIVATE") {
        const member = session?.user?.id
          ? await prisma.groupMember.findFirst({
              where: { groupId, userId: session.user.id },
              select: { id: true },
            })
          : null;
        if (!member) {
          return NextResponse.json(
            { error: "This group is private." },
            { status: 403 }
          );
        }
      }
      where.groupId = groupId;
    } else if (!userId) {
      // The MAIN feed carries no group posts at all. `Post.isPublic` defaults to
      // true, so a post made inside a private group also surfaced in the global
      // feed — the group filter only ever added posts, it never excluded them.
      where.groupId = null;
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

    const now = new Date();
    // The main feed (no user/group/tag/search filter) is ranked by a smart
    // hot-score; filtered feeds stay chronological (intentional).
    const isMainFeed = !userId && !groupId && !tag && !search;
    const organicWhere = { ...where, isAnnouncement: false, isPromoted: false };

    // Narrowed to FEED_POST_SELECT — not the full Post row.
    let posts: FeedPostRow[];
    let total: number;
    // Max activity across the organic feed — the client's baseline for the live
    // "new activity" pill (see /api/feed/pulse). Only set on the main-feed pool
    // path; null elsewhere (client only reads it on page-1 main feed).
    let latestActivityAt: Date | null = null;

    if (isMainFeed && skip < POOL_SIZE) {
      // Score a bounded pool of the freshest posts (pinned first so boosted
      // posts are always included), then paginate by score. Bounded LIMIT keeps
      // this fast even at very large post counts.
      const [pool, cnt] = await Promise.all([
        prisma.post.findMany({
          where: organicWhere,
          orderBy: [{ isPinned: "desc" }, { lastActivityAt: "desc" }],
          take: POOL_SIZE,
          select: FEED_POST_SELECT,
          // The pool is IDENTICAL for every viewer — ranking, the per-viewer
          // like/vote/follow state and the jitter are all applied after this, so
          // caching it leaks nothing. A brand-new post can appear up to 15s late,
          // and /api/feed/pulse (ttl 10) already drives the "new posts" pill, so
          // the user gets a signal sooner than that anyway.
          ...(isMainFeed ? { cacheStrategy: { ttl: 15, swr: 60 } } : {}),
        }),
        isMainFeed ? cachedMainFeedCount() : prisma.post.count({ where }),
      ]);

      // Viewer's follow set among pool authors → light ranking boost.
      let follows = new Set<string>();
      if (session?.user?.id) {
        const authorIds = [...new Set(pool.map((p) => p.userId))];
        if (authorIds.length > 0) {
          const f = await prisma.follow.findMany({
            where: {
              followerId: session.user.id,
              followingId: { in: authorIds },
            },
            select: { followingId: true },
          });
          follows = new Set(f.map((x) => x.followingId));
        }
      }

      // Boost recirculation: actively-boosted posts get a strong score bump so
      // they cycle back near the top across reloads (not a static pin) — until
      // the viewer has seen each one `boost_max_per_user` times.
      const boostedIds = pool
        .filter((p) => {
          const b = (p as unknown as { boostedUntil: Date | null }).boostedUntil;
          return b != null && b > now;
        })
        .map((p) => p.id);
      const boostCap = Math.max(
        0,
        Number(await getSetting<number>("feed.boost_max_per_user", 20)) || 20
      );
      const boostSeen = new Map<string, number>();
      if (boostedIds.length > 0 && session?.user?.id) {
        const views = await prisma.postBoostView.findMany({
          where: { userId: session.user.id, postId: { in: boostedIds } },
          select: { postId: true, count: true },
        });
        views.forEach((v) => boostSeen.set(v.postId, v.count));
      }
      const boostActive = (id: string) =>
        boostedIds.includes(id) &&
        (boostCap === 0 || (boostSeen.get(id) ?? 0) < boostCap);

      // Per-session seed reshuffles the order each refresh; fall back to the UTC
      // day key so an un-seeded request still gets stable daily variety.
      const jitterSeed = seed || dayKey(now);
      const scoreById = new Map(
        pool.map((p) => [
          p.id,
          scorePost(p as unknown as RankablePost, { follows, now, seed: jitterSeed }) *
            (boostActive(p.id) ? 8 : 1),
        ])
      );
      // The globally most-recent activity is always within the freshest-500 pool.
      latestActivityAt = pool.reduce<Date | null>((max, p) => {
        const t = p.lastActivityAt;
        return !max || t > max ? t : max;
      }, null);
      const ranked = [...pool].sort((a, b) => {
        // Boosted (pinned) posts always float to the very top.
        if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
        return (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
      });
      posts = ranked.slice(skip, skip + limit);
      total = cnt;

      // Count a boosted-post impression once per page-1 surfacing (best-effort,
      // non-blocking) so the per-user frequency cap advances.
      if (skip === 0 && session?.user?.id) {
        const uid = session.user.id;
        const shownBoosted = posts.filter((p) => boostActive(p.id)).map((p) => p.id);
        for (const pid of shownBoosted) {
          void prisma.postBoostView
            .upsert({
              where: { userId_postId: { userId: uid, postId: pid } },
              create: { userId: uid, postId: pid, count: 1 },
              update: { count: { increment: 1 }, lastShownAt: new Date() },
            })
            .catch(() => {});
        }
      }
    } else {
      // Filtered feeds, or deep-scroll past the scored pool → chronological.
      const orderBy = isMainFeed
        ? [{ lastActivityAt: "desc" as const }]
        : [{ isPinned: "desc" as const }, { createdAt: "desc" as const }];
      [posts, total] = await Promise.all([
        prisma.post.findMany({
          where: organicWhere,
          orderBy,
          skip,
          take: limit,
          select: FEED_POST_SELECT,
        }),
        isMainFeed ? cachedMainFeedCount() : prisma.post.count({ where }),
      ]);
    }

    // Announcements + active promoted posts — only on page 1, prepended
    // and interleaved respectively. On page 2+ the user has already seen
    // them so we skip to keep the feed feeling fresh.
    type FeedPost = (typeof posts)[number];
    let announcements: FeedPost[] = [];
    let promoted: FeedPost[] = [];
    if (page === 1 && !userId && !groupId && !tag && !search) {
      [announcements, promoted] = await Promise.all([
        prisma.post.findMany({
          where: { ...where, isAnnouncement: true },
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          select: FEED_POST_SELECT,
          cacheStrategy: { ttl: 30, swr: 120 },
        }),
        prisma.post.findMany({
          select: FEED_POST_SELECT,
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
      boostedUntil: post.boostedUntil,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      sharesCount: post.sharesCount,
      viewsCount: post.viewsCount,
      linkClicksCount: post.linkClicksCount,
      uniqueLinkClicksCount: post.uniqueLinkClicksCount,
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
    // injected every N entries (admin-configurable, default 4).
    const promoEvery = Math.max(1, (await getAdDensity()).feedPromoInterval);
    const organic = posts.map(formatPost);
    const promotedFormatted = promoted.map(formatPost);
    const interleaved: ReturnType<typeof formatPost>[] = [];
    let promoIdx = 0;
    organic.forEach((p, i) => {
      interleaved.push(p);
      if (promoIdx < promotedFormatted.length && (i + 1) % promoEvery === 0) {
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
      latestActivityAt,
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

    // A banned or suspended account must not be able to post. Posting also
    // pays — social earning credits the author — so this is an earning path as
    // much as a content one.
    const active = await requireActiveUser(session.user.id);
    if (!active.ok) {
      return NextResponse.json(
        { error: active.message },
        { status: active.httpStatus }
      );
    }

    // Creating a post is ~20 DB ops plus a server-side outbound fetch for the
    // link preview, so it is a DoS amplifier as well as a spam vector. The
    // per-plan daily limit below is a product rule; this is the abuse ceiling.
    const limited = await enforceDbRateLimit(
      request,
      "post-create",
      session.user.id,
      20,
      60_000
    );
    if (limited) return limited;

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
      // Day boundary is the user's LOCAL midnight so the reset matches what the
      // user experiences, not the server's UTC day.
      const { startOfDayUtc: dayStart } = await getUserDayContext(session.user.id);
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

    await Promise.all([
      // Social earning — author gets daily post-create bonus (capped 1×/day via reference)
      awardSocialEarning({
        postOwnerUserId: session.user.id,
        actorUserId: session.user.id,
        action: "POST_CREATE",
        postId: post.id,
      }),
      // Event progress. This is the weakest action type to build an event on —
      // a user can always make more posts — so admins should set a daily cap on
      // FEED_POST events; the admin form says so.
      post.isPublic
        ? recordUserAction({
            userId: session.user.id,
            action: "feed_post",
            targetId: post.id,
          })
        : Promise.resolve(),
    ]);

    // Mentions in the post body
    const usernames = extractMentionUsernames(post.content);
    if (usernames.length > 0) {
      const mentionedUsers = await resolveMentionedUsers(usernames);
      const filtered = mentionedUsers.filter((m) => m.id !== session.user!.id);
      if (filtered.length > 0) {
        // One insert for all mentions.
        await prisma.mention.createMany({
          data: filtered.map((m) => ({
            postId: post.id,
            mentionedUserId: m.id,
            mentionedById: session.user!.id,
          })),
          skipDuplicates: true,
        });
        // Concurrent, not sequential — see the same fix in the comments route.
        await Promise.all(
          filtered.map((m) =>
            awardSocialEarning({
              postOwnerUserId: m.id,
              actorUserId: session.user!.id,
              action: "MENTION_RECEIVED",
              postId: post.id,
            }).catch(() => {})
          )
        );
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
        linkClicksCount: 0,
        uniqueLinkClicksCount: 0,
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
