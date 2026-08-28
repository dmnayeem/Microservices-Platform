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
  verifiedBadgeStyle: true,
  role: true,
} as const;

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
    user: ctx.users.get(post.userId),
    isLiked: ctx.liked.has(post.id),
    myReaction: ctx.myReactions.get(post.id) ?? null,
    reactionCounts: ctx.reactionCounts[post.id] ?? null,
    isSaved: ctx.saved.has(post.id),
    isOwner: ctx.viewerId === post.userId,
    isFollowingAuthor: ctx.following.has(post.userId),
  };
}
