import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Deleting reported content, correctly, in one place.
 *
 * Three call sites did this three different ways: the report resolver did a bare
 * `post.delete(...).catch(() => {})`, the admin feed route ran a seven-statement
 * cleanup transaction, and the user's own delete did neither. Two of the three
 * were wrong.
 *
 * ## What the schema actually guarantees
 *
 * **Every** relation pointing at `Post` declares `onDelete: Cascade` — likes,
 * comments, votes, views, shares, mentions, donations, boost views and link
 * clicks. So a bare `post.delete` is correct and cannot raise a foreign-key
 * error, and the admin feed route's cleanup array is dead weight (its comment,
 * "cascades aren't set on every relation", is simply false).
 *
 * `Comment` is the opposite case and the one that actually bites.
 */

/** What a delete touched, so the caller can report it honestly. */
export interface DeleteOutcome {
  ok: boolean;
  /** Rows removed beyond the target itself (reply subtree, etc.). */
  extra: number;
  reason?: "not_found" | "failed";
}

/**
 * Delete a post and everything that hangs off it.
 *
 * Two things the database will NOT do for us:
 *
 *  - `SocialActionLog.postId` is a loose string with no foreign key, so those
 *    rows survive. They are **deliberately kept**: that table is the
 *    social-earning audit trail, and deleting it would retroactively change what
 *    users were paid for. An orphaned row there is the correct trade.
 *  - `Ad.promotedPostId` is `SetNull`, so a native ad promoting this post
 *    survives with nothing to render. The caller is told how many, via
 *    `countPromotingAds`, rather than discovering it in production.
 */
export async function deletePostCascade(postId: string): Promise<DeleteOutcome> {
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) return { ok: false, extra: 0, reason: "not_found" };

    await prisma.post.delete({ where: { id: postId } });
    return { ok: true, extra: 0 };
  } catch (err) {
    // Previously swallowed with `.catch(() => {})`, which let a report be marked
    // RESOLVED/DELETED while the post was still live on the feed.
    console.error(`[moderation] deletePostCascade failed for ${postId}:`, err);
    return { ok: false, extra: 0, reason: "failed" };
  }
}

/** How many native ads would be left with nothing to render. */
export async function countPromotingAds(postId: string): Promise<number> {
  return prisma.ad.count({ where: { promotedPostId: postId } });
}

/** Cap on how deep a reply chain we will walk. Threads are not this deep. */
const MAX_REPLY_DEPTH = 20;

/**
 * Delete a comment **and its whole reply subtree**, then correct the post's
 * comment count by the real number removed.
 *
 * `Comment.parentId` has no `onDelete`, so Postgres nulls it instead of
 * cascading: deleting a parent silently **promoted every reply to a top-level
 * comment on the same post**, and the count was decremented by 1 regardless of
 * how many comments actually disappeared from view. Both the admin resolver and
 * the user's own delete had this.
 */
export async function deleteCommentCascade(
  commentId: string
): Promise<DeleteOutcome> {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true },
    });
    if (!comment) return { ok: false, extra: 0, reason: "not_found" };

    // Walk down level by level. One query per level rather than per comment.
    const toDelete = [comment.id];
    let frontier = [comment.id];
    for (let depth = 0; depth < MAX_REPLY_DEPTH && frontier.length > 0; depth++) {
      const children: { id: string }[] = await prisma.comment.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      if (children.length === 0) break;
      frontier = children.map((c) => c.id);
      toDelete.push(...frontier);
    }

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { id: { in: toDelete } } }),
      prisma.post.update({
        where: { id: comment.postId },
        // The whole subtree left the thread, not just the one comment.
        data: { commentsCount: { decrement: toDelete.length } },
      }),
    ]);

    return { ok: true, extra: toDelete.length - 1 };
  } catch (err) {
    console.error(
      `[moderation] deleteCommentCascade failed for ${commentId}:`,
      err
    );
    return { ok: false, extra: 0, reason: "failed" };
  }
}

/**
 * Hide or un-hide a post. `Post.isHidden` is already honoured by every feed read
 * path — the admin surface simply never wrote it, offering only irreversible
 * deletion. There was no un-hide anywhere in the codebase.
 */
export async function setPostHidden(
  postId: string,
  hidden: boolean
): Promise<DeleteOutcome> {
  const res = await prisma.post.updateMany({
    where: { id: postId },
    data: { isHidden: hidden },
  });
  return res.count > 0
    ? { ok: true, extra: 0 }
    : { ok: false, extra: 0, reason: "not_found" };
}

export async function setCommentHidden(
  commentId: string,
  hidden: boolean
): Promise<DeleteOutcome> {
  const res = await prisma.comment.updateMany({
    where: { id: commentId },
    data: { isHidden: hidden },
  });
  return res.count > 0
    ? { ok: true, extra: 0 }
    : { ok: false, extra: 0, reason: "not_found" };
}

/**
 * Marketplace listings have no `isHidden` — their soft-hide is a status value.
 * `REJECTED` is the existing moderation outcome in `MarketplaceListingStatus`
 * (the enum has no REMOVED), and it is what the listing's own review flow uses,
 * so a moderator-hidden listing looks the same to the rest of the marketplace
 * as one the reviewer turned down.
 */
export async function setListingHidden(
  listingId: string,
  hidden: boolean
): Promise<DeleteOutcome> {
  const res = await prisma.marketplaceListing.updateMany({
    where: { id: listingId },
    data: { status: hidden ? "REJECTED" : "ACTIVE" },
  });
  return res.count > 0
    ? { ok: true, extra: 0 }
    : { ok: false, extra: 0, reason: "not_found" };
}

/**
 * A listing is never row-deleted: purchases, bids and disputes reference it, and
 * an order history that points at nothing is worse than a hidden listing.
 * "Delete" on a listing report therefore means the same thing as hide.
 */
export const deleteListing = (listingId: string) =>
  setListingHidden(listingId, true);
