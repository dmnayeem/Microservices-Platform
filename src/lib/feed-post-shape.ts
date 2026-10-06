/**
 * The one definition of "a post, as the feed sees it".
 *
 * The main feed and the saved-posts list both render `FeedPostCard`, so both
 * have to produce exactly the same object. Keeping a second copy of the select
 * and the mapping in the saved route is precisely how those two drift until one
 * of them is quietly missing a field — this file exists so there is nothing to
 * drift.
 *
 * Server-agnostic on purpose: no prisma import, so the shape can be referenced
 * from anywhere.
 */
import { postAudience } from "@/lib/public-post-gate";

export const FEED_POST_SELECT = {
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

/**
 * The author columns a post card needs.
 *
 * Shared for the same reason as the post select — and learned the harder way:
 * the saved list first hand-rolled this and sent `packageTier` where the card
 * reads `package`, and left out `verifiedBadgeStyle` entirely, so badges
 * rendered differently on `/saved` than in the feed. Identical post fields are
 * not enough if the author object underneath them disagrees.
 */
export const FEED_AUTHOR_SELECT = {
  id: true,
  name: true,
  username: true,
  avatar: true,
  level: true,
  package: { select: { slug: true, name: true } },
  isBlueVerified: true,
  // Read only to hide a lapsed paid badge (see liveBadgeAuthor); never sent.
  blueBadgeExpiresAt: true,
  verifiedBadgeStyle: true,
  role: true,
} as const;

/**
 * A bought badge lapses at `blueBadgeExpiresAt`, but `isBlueVerified` is only
 * cleared by the hourly sweep — so for up to an hour after expiry the feed
 * still showed it. Show it only while it is actually live; admin-granted
 * badges (expiry null) never lapse. The expiry itself is not sent.
 */
function liveBadgeAuthor(user: unknown): unknown {
  if (!user || typeof user !== "object") return user;
  const { blueBadgeExpiresAt, ...rest } = user as Record<string, unknown> & {
    blueBadgeExpiresAt?: Date | string | null;
  };
  if (blueBadgeExpiresAt && new Date(blueBadgeExpiresAt).getTime() <= Date.now()) {
    return { ...rest, isBlueVerified: false };
  }
  return rest;
}

/** The per-viewer facts a list has to look up in bulk, not per post. */
export interface FeedViewerContext {
  viewerId?: string | null;
  liked: Set<string>;
  myReactions: Map<string, string>;
  reactionCounts: Record<string, Record<string, number>>;
  saved: Set<string>;
  votes: Map<string, string>;
  following: Set<string>;
  users: Map<string, unknown>;
  /**
   * `feed.public_audience_epoch` in ms, or null.
   *
   * Required, not optional, so a new list route has to answer the question
   * rather than silently mislabel every post. Null is the fail-closed answer:
   * every post reads "Members only".
   */
  audienceEpochMs: number | null;
}

type Row = {
  id: string;
  userId: string;
  content: string;
  images: string[];
  backgroundStyle: string | null;
  isPublic: boolean;
  isPinned: boolean;
  isAnnouncement: boolean;
  isPromoted: boolean;
  promotedUntil: Date | null;
  promotedNote: string | null;
  boostedUntil: Date | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  linkClicksCount: number;
  uniqueLinkClicksCount: number;
  pollOptions: unknown;
  pollEndsAt: Date | null;
  donationGoal: number | null;
  donationCollected: number | null;
  linkPreview: unknown;
  groupId: string | null;
  createdAt: Date;
  lastActivityAt?: Date | null;
};

/** Shape one row the way `FeedPostCard` expects it. */
export function formatFeedPost(post: Row, ctx: FeedViewerContext) {
  return {
    id: post.id,
    content: post.content,
    images: post.images,
    backgroundStyle: post.backgroundStyle,
    isPublic: post.isPublic,
    // What the author actually published to, by the same rule the logged-out
    // gate uses — so the badge on the card and the reach of the post can never
    // disagree. A pre-epoch post reads MEMBERS even though its column says
    // true, because that is the truth about who can read it.
    audience: postAudience(post, ctx.audienceEpochMs),
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
    myVote: ctx.votes.get(post.id) ?? null,
    createdAt: post.createdAt,
    user: liveBadgeAuthor(ctx.users.get(post.userId)),
    isLiked: ctx.liked.has(post.id),
    myReaction: ctx.myReactions.get(post.id) ?? null,
    reactionCounts: ctx.reactionCounts[post.id] ?? null,
    isSaved: ctx.saved.has(post.id),
    isOwner: ctx.viewerId === post.userId,
    isFollowingAuthor: ctx.following.has(post.userId),
  };
}
