import { NextRequest, NextResponse } from "next/server";
import { validPostImages } from "@/lib/post-images";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { unstable_cache } from "next/cache";
import { hiddenAuthorIds } from "@/lib/feed-hidden-authors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { awardSocialEarning } from "@/lib/social-earning";
import { getEffectivePackage, userCanFeature } from "@/lib/packages";
import { extractMentionUsernames, resolveMentionedUsers } from "@/lib/mentions";
import { isValidPostBackground } from "@/lib/post-backgrounds";
import { fetchLinkPreview, firstUrl } from "@/lib/link-preview";
import { isEmbeddableVideoUrl } from "@/lib/video-url";
import { screenLinks } from "@/lib/link-safety";
import { dayKey, FEED_WINDOW, streamScore } from "@/lib/feed-ranking";
import { getUserDayContext } from "@/lib/user-day";
import { getAdDensity } from "@/lib/ad-density";
import { getSetting } from "@/lib/system-settings";
import type { Prisma } from "@/generated/prisma/client";
import { recordUserAction } from "@/lib/goal-progress";
import { publicAudienceEpochMs } from "@/lib/public-post";
import { postAudience } from "@/lib/public-post-gate";
import {
  FEED_AUTHOR_SELECT,
  FEED_POST_SELECT,
  formatFeedPost,
  type FeedViewerContext,
} from "@/lib/feed-post-shape";

// GET /api/feed - Get feed posts
// Exactly the columns `formatPost` below reads. Without a select, Prisma
// returns EVERY column for all 500 pool rows — content, images[], and the
// pollOptions/linkPreview JSON — which is 1-2 MB per feed request through the
// Accelerate proxy, and heads straight for its response-size cap (P6009, which
// this codebase deliberately never retries).
// The select and the row→payload mapping live in `src/lib/feed-post-shape.ts`
// because the saved-posts list renders the SAME `FeedPostCard` and therefore
// has to produce the same object. A second copy here is exactly how the two
// lists end up quietly disagreeing about which fields a post has.

/** A pool row: exactly the columns FEED_POST_SELECT asks for. */
type FeedPostRow = Prisma.PostGetPayload<{ select: typeof FEED_POST_SELECT }>;

/**
 * Total post count for the UNFILTERED main feed. It is the same number for every
 * viewer, it only feeds a `totalPages` that an infinite-scroll feed never renders,
 * and it is a full count over the largest table in the database — previously run
 * on every feed request and every 30s poll. Cached for a minute.
 */
const cachedMainFeedCount = unstable_cache(
  // No `isPublic` filter: since the audience picker shipped, `isPublic` is the
  // internet-audience choice, not in-platform visibility. A "Members only" post
  // is a normal feed post — filtering it out here would make the option mean
  // "nobody but me". See src/lib/public-post-gate.ts.
  async () => prisma.post.count({ where: { isHidden: false } }),
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
    // Endless main feed: "after this post" (score~id) and which round of the
    // feed this is (0 = the first; later rounds skip announcements/boosts).
    const cursor = searchParams.get("cursor");
    const cycle = Math.max(0, Math.min(1000, parseInt(searchParams.get("cycle") || "0", 10) || 0));
    // The instant page 1 was ranked at. Later pages score against the SAME
    // instant: scoring against a fresh `now` shifts the order a little, so a
    // post could move from page 2's range into page 1's after page 1 was
    // already shown — and then it was on no page at all.
    const rankedAtParam = Number(searchParams.get("rankedAt"));
    // Read once per request, not per post: the badge on every card is derived
    // from it, and it is a cached SystemSetting read.
    const [feedAudienceEpochMs, hiddenAuthors] = await Promise.all([
      publicAudienceEpochMs(),
      hiddenAuthorIds(),
    ]);
    const skip = (page - 1) * limit;

    // Build query
    // `isPublic` is NOT a filter here. It is the author's internet-audience
    // choice (Public vs Members only), and both belong in the signed-in feed —
    // that is what "Members only" means. Logged-out reach is decided by
    // `isPubliclyVisible` on the /post/[id] surface, nowhere else.
    const where: Record<string, unknown> = {
      isHidden: false, // agency-moderator soft-hidden posts never surface
    };

    // Banned / suspended authors' posts never surface (see
    // feed-hidden-authors.ts). Only added when the list is non-empty so the
    // query — and its Accelerate cache key — is unchanged otherwise.
    if (userId) {
      where.userId =
        hiddenAuthors.length > 0 && userId !== session?.user?.id
          ? { equals: userId, notIn: hiddenAuthors }
          : userId;
    } else if (hiddenAuthors.length > 0) {
      where.userId = { notIn: hiddenAuthors };
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
    // Only an anchor from the last hour is honoured; anything else ranks now.
    const rankNow =
      (page > 1 || !!cursor) &&
      Number.isFinite(rankedAtParam) &&
      rankedAtParam <= now.getTime() &&
      now.getTime() - rankedAtParam < 24 * 60 * 60_000
        ? new Date(rankedAtParam)
        : now;
    // The main feed (no user/group/tag/search filter) is ranked by a smart
    // hot-score; filtered feeds stay chronological (intentional).
    const isMainFeed = !userId && !groupId && !tag && !search;
    // The top of a feed: announcements, promoted posts and boosts go here.
    const firstPage = isMainFeed ? !cursor && cycle === 0 : page === 1;
    // A promotion that has RUN OUT leaves `isPromoted` true — nothing resets it —
    // and the page-1 promoted query only takes unexpired ones. Filtering on
    // `isPromoted: false` alone therefore dropped every expired promoted post out
    // of the feed for good. Floored to the minute so the cached pool query keeps
    // a stable cache key.
    const promoCutoff = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const organicWhere = {
      ...where,
      isAnnouncement: false,
      OR: [{ isPromoted: false }, { promotedUntil: { lte: promoCutoff } }],
    };

    // Narrowed to FEED_POST_SELECT — not the full Post row.
    let posts: FeedPostRow[];
    let total: number;
    // Max activity across the organic feed — the client's baseline for the live
    // "new activity" pill (see /api/feed/pulse). Only set on the main-feed pool
    // path; null elsewhere (client only reads it on page-1 main feed).
    let latestActivityAt: Date | null = null;
    // Main feed only: where the next page continues (null = this round is done).
    let nextCursor: string | null = null;

    if (isMainFeed) {
      // ── Endless random feed, paged by cursor ─────────────────────────────
      //
      // Every post in the window (the newest FEED_WINDOW) is put in ONE random
      // order per session — `streamScore` reads only what doesn't change while
      // someone scrolls — and each page continues "after" the last post shown.
      // Ranking each page afresh by likes / last activity used to shift the
      // order between pages, so posts were skipped (never shown until a reload)
      // and others repeated. When a round is used up the client starts a new
      // round with a new seed: the feed never ends.
      const windowSelect = {
        id: true,
        userId: true,
        isPinned: true,
        createdAt: true,
        boostedUntil: true,
        lastActivityAt: true,
      } as const;
      const [windowRows, cnt] = await Promise.all([
        prisma.post.findMany({
          where: organicWhere,
          orderBy: [{ createdAt: "desc" }],
          take: FEED_WINDOW,
          select: windowSelect,
          // Identical for every viewer (ranking happens after), so it is shared.
          cacheStrategy: { ttl: 15, swr: 60 },
        }),
        cachedMainFeedCount(),
      ]);
      const pool = [...windowRows];

      // The window is cached, so the viewer's own post from a moment ago can be
      // missing — read their recent posts uncached and add them.
      const viewer = session?.user?.id ?? null;
      if (viewer) {
        const inPool = new Set(pool.map((p) => p.id));
        const mine = await prisma.post.findMany({
          where: { ...organicWhere, userId: viewer, createdAt: { gte: new Date(now.getTime() - 10 * 60_000) } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: windowSelect,
        });
        for (const p of mine) if (!inPool.has(p.id)) pool.push(p);
      }

      // Everyone the viewer follows (a small ranking edge).
      let follows = new Set<string>();
      if (viewer) {
        const f = await prisma.follow.findMany({
          where: { followerId: viewer },
          select: { followingId: true },
          take: 5000,
        });
        follows = new Set(f.map((x) => x.followingId));
      }

      const jitterSeed = seed || dayKey(now);
      const scored = pool.map((p) => ({
        row: p,
        score: streamScore(p, { follows, now: rankNow, seed: jitterSeed }),
      }));
      scored.sort((a, b) => {
        if (a.row.isPinned !== b.row.isPinned) return Number(b.row.isPinned) - Number(a.row.isPinned);
        if (b.score !== a.score) return b.score - a.score;
        return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
      });
      latestActivityAt = pool.reduce<Date | null>((max, p) => (!max || p.lastActivityAt > max ? p.lastActivityAt : max), null);

      // Where this page starts: right after the cursor post. If that post has
      // since left the window (deleted / hidden), after the first one that
      // ranks below the cursor's score.
      let start = 0;
      if (cursor) {
        const sep = cursor.lastIndexOf("~");
        const cScore = Number(cursor.slice(0, sep));
        const cId = cursor.slice(sep + 1);
        const at = scored.findIndex((s) => s.row.id === cId);
        if (at >= 0) start = at + 1;
        else if (Number.isFinite(cScore)) {
          const next = scored.findIndex((s) => !s.row.isPinned && (s.score < cScore || (s.score === cScore && s.row.id > cId)));
          start = next >= 0 ? next : scored.length;
        }
      }
      const slice = scored.slice(start, start + limit);
      const last = slice[slice.length - 1];
      nextCursor = last && start + limit < scored.length ? `${last.score.toFixed(12)}~${last.row.id}` : null;

      // Boosted posts recirculate on the first page of each visit — until the
      // viewer has seen each one `boost_max_per_user` times.
      let boostedFirst: string[] = [];
      if (firstPage && viewer) {
        const boostedIds = pool.filter((p) => p.boostedUntil != null && p.boostedUntil > now).map((p) => p.id);
        if (boostedIds.length > 0) {
          const boostCap = Math.max(0, Number(await getSetting<number>("feed.boost_max_per_user", 20)) || 20);
          const views = await prisma.postBoostView.findMany({
            where: { userId: viewer, postId: { in: boostedIds } },
            select: { postId: true, count: true },
          });
          const seenCount = new Map(views.map((v) => [v.postId, v.count]));
          boostedFirst = boostedIds.filter((id) => boostCap === 0 || (seenCount.get(id) ?? 0) < boostCap).slice(0, 3);
          for (const pid of boostedFirst) {
            void prisma.postBoostView
              .upsert({
                where: { userId_postId: { userId: viewer, postId: pid } },
                create: { userId: viewer, postId: pid, count: 1 },
                update: { count: { increment: 1 }, lastShownAt: new Date() },
              })
              .catch(() => {});
          }
        }
      }

      // Full rows for just this page, in the ranked order.
      const pageIds = [...boostedFirst, ...slice.map((s) => s.row.id).filter((id) => !boostedFirst.includes(id))];
      const rows = pageIds.length
        ? await prisma.post.findMany({ where: { ...organicWhere, id: { in: pageIds } }, select: FEED_POST_SELECT })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      posts = pageIds.map((id) => byId.get(id)).filter((r): r is FeedPostRow => !!r);
      total = cnt;
    } else {
      // Filtered feeds (profile, group, hashtag, search) → chronological.
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
    if (firstPage && isMainFeed) {
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

    const userIds = [...new Set(allPosts.map((p) => p.userId))];
    // Which reaction did the viewer leave, and what does the post's cluster look
    // like? Both are answered for the WHOLE page in one query each — a per-post
    // lookup would be a query per card.
    const pageIds = allPosts.map((p) => p.id);

    // ONE round-trip layer for the whole hydration step.
    //
    // These six reads — authors, reaction totals, the viewer's likes, saves,
    // follows and poll votes — used to be six sequential `await`s. Every one of
    // them depends only on `allPosts`, which is already resolved here, so none
    // of them was ever waiting on the one before it: the waterfall was
    // accidental. On Accelerate each `await` is a full proxy round-trip
    // (measured at 85–190ms from the dev machine), so the page paid five extra
    // trips it had no reason to.
    //
    // The guards are preserved exactly as they were — an empty page skips the
    // grouping, an anonymous viewer skips the four per-viewer reads, and a page
    // with no authors skips the follow lookup — so the queries that actually run
    // are the same set as before. Only their arrangement changed.
    const viewerId = session?.user?.id ?? null;
    const [users, grouped, likes, saved, follows, votes] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: FEED_AUTHOR_SELECT,
      }),
      // Per-type totals for the little emoji cluster. Deliberately computed
      // rather than denormalised onto Post: at this size the grouping is cheap,
      // and a cached counter is the kind of thing that drifts away from the rows.
      pageIds.length > 0
        ? prisma.like.groupBy({
            by: ["postId", "type"],
            where: { postId: { in: pageIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      viewerId
        ? prisma.like.findMany({
            where: { userId: viewerId, postId: { in: pageIds } },
            select: { postId: true, type: true },
          })
        : Promise.resolve([]),
      // Saved posts — same batching as likes, one query for the page.
      viewerId
        ? prisma.savedPost.findMany({
            where: { userId: viewerId, postId: { in: pageIds } },
            select: { postId: true },
          })
        : Promise.resolve([]),
      // Which post-authors does the viewer already follow?
      viewerId && userIds.length > 0
        ? prisma.follow.findMany({
            where: { followerId: viewerId, followingId: { in: userIds } },
            select: { followingId: true },
          })
        : Promise.resolve([]),
      viewerId
        ? prisma.vote.findMany({
            where: { userId: viewerId, postId: { in: pageIds } },
            select: { postId: true, optionId: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    const reactionCounts: Record<string, Record<string, number>> = {};
    for (const g of grouped as Array<{
      postId: string;
      type: string;
      _count: { _all: number };
    }>) {
      (reactionCounts[g.postId] ??= {})[g.type] = g._count._all;
    }

    const userLikes = new Set((likes as { postId: string }[]).map((l) => l.postId));
    const myReactions = new Map(
      (likes as { postId: string; type: string }[]).map((l) => [l.postId, l.type])
    );
    const savedSet = new Set(
      (saved as { postId: string }[]).map((x) => x.postId)
    );
    const followingSet = new Set(
      (follows as { followingId: string }[]).map((f) => f.followingId)
    );
    const userVoteMap = new Map(
      (votes as { postId: string; optionId: string }[]).map((v) => [
        v.postId,
        v.optionId,
      ])
    );

    type FormattablePost = (typeof allPosts)[number];
    // Everything per-viewer is looked up in bulk above; the shared formatter
    // just reads from those maps, so both lists shape a post identically.
    const viewerCtx: FeedViewerContext = {
      viewerId: session?.user?.id ?? null,
      liked: userLikes,
      myReactions,
      reactionCounts,
      saved: savedSet,
      votes: userVoteMap,
      following: followingSet,
      users: userMap as Map<string, unknown>,
      audienceEpochMs: feedAudienceEpochMs,
    };
    const formatPost = (post: FormattablePost) =>
      formatFeedPost(post, viewerCtx);

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
      rankedAt: rankNow.getTime(),
      ...(isMainFeed ? { nextCursor, exhausted: nextCursor === null } : {}),
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
    if (validPostImages(images) === null) {
      return NextResponse.json({ error: "Invalid images" }, { status: 400 });
    }

    // Phishing / malware links. The first URL here is also the link-preview
    // target, so this covers the preview too.
    const links = await screenLinks(
      {
        texts: [
          content,
          ...(Array.isArray(pollOptions) ? pollOptions.map((o) => String(o?.label ?? "")) : []),
        ],
      },
      { userId: session.user.id, entityType: "post" }
    );
    if (!links.ok) {
      return NextResponse.json({ error: links.message }, { status: 400 });
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

    // Opening a donation post asks real people for real points, so it is an
    // admin-granted capability rather than something every account has. The
    // composer hides the tab; this is the gate that actually holds, because the
    // tab is not what a scripted request goes through.
    if (typeof donationGoal === "number" && donationGoal > 0 && !isPrivileged) {
      if (!(await userCanFeature(session.user.id, "donations"))) {
        return NextResponse.json(
          {
            error:
              "Donation posts aren't enabled for your account. Ask an admin to enable it.",
          },
          { status: 403 }
        );
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
        // EXPLICIT opt-in. This used to be `isPublic !== false`, i.e. a body
        // that said nothing published to the whole internet. `isPublic` is now
        // the audience the author picked, and the only way to get Public is to
        // ask for it. A post inside a group is never public, whatever the body
        // says — group posts are for the group.
        isPublic: isPublic === true && !groupId,
        pollOptions: formattedPoll ?? undefined,
        pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
        donationGoal:
          typeof donationGoal === "number" && donationGoal > 0
            ? Math.round(donationGoal)
            : null,
        groupId: groupId ?? null,
      },
    });
    links.report(post.id);

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
      // Was `post.isPublic`, back when that was always true. It is now the
      // audience choice, and a Members-only post is still a post — the event
      // counts feed activity, not reach. Group posts stay excluded.
      !post.groupId
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
        linkPreview = await fetchLinkPreview(previewUrl, { userId: post.userId });
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
        audience: postAudience(post, await publicAudienceEpochMs()),
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
