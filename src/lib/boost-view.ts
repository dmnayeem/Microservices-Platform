import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * What a member sees about their own boost — one select and one shape, shared
 * by GET /api/boosts (list) and GET /api/boosts/[id] (detail) so the /boosts
 * page and the post card never disagree about the same row.
 */
export const BOOST_MEMBER_SELECT = {
  id: true,
  postId: true,
  status: true,
  paidWith: true,
  rate: true,
  budgetPoints: true,
  spentPoints: true,
  refundedPoints: true,
  targeting: true,
  durationDays: true,
  startsAt: true,
  endsAt: true,
  rejectReason: true,
  impressions: true,
  views: true,
  clicks: true,
  likes: true,
  comments: true,
  shares: true,
  createdAt: true,
  post: { select: { id: true, content: true, images: true, createdAt: true } },
} satisfies Prisma.BoostCampaignSelect;

export type MemberBoostRow = Prisma.BoostCampaignGetPayload<{ select: typeof BOOST_MEMBER_SELECT }>;

export function shapeMemberBoost(r: MemberBoostRow) {
  return {
    id: r.id,
    postId: r.postId,
    status: r.status,
    paidWith: r.paidWith,
    rate: r.rate,
    budgetPoints: r.budgetPoints,
    spentPoints: r.spentPoints,
    refundedPoints: r.refundedPoints,
    // Still held = budget not yet spent or returned. What a cancel gives back.
    remainingPoints: Math.max(0, r.budgetPoints - r.spentPoints - r.refundedPoints),
    targeting: r.targeting ?? null,
    durationDays: r.durationDays,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    rejectReason: r.rejectReason,
    counts: {
      impressions: r.impressions,
      views: r.views,
      clicks: r.clicks,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
    },
    createdAt: r.createdAt.toISOString(),
    post: r.post
      ? {
          id: r.post.id,
          content: r.post.content.slice(0, 280),
          image: r.post.images[0] ?? null,
          createdAt: r.post.createdAt.toISOString(),
        }
      : null,
  };
}

export type MemberBoost = ReturnType<typeof shapeMemberBoost>;
