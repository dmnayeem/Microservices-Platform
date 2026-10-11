import "server-only";
import { NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { creditPoints, recordTransaction } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { requireActiveUser } from "@/lib/require-active";

/**
 * Spotlight: an open auction, in points, for a featured place in the feed.
 *
 * Only the TOP bid is held. A new top bid refunds the previous top bidder at
 * once (they can bid again). When bidding ends the top bid wins: those points
 * are spent, and the winner's chosen post is promoted (the feed's existing
 * PROMOTED placement) for `displayHours`. Highest bid wins — no draw, no luck.
 *
 * Every bid runs under a row lock on the auction, so two bids can never both
 * become "top", and a refund is written exactly once.
 */

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

class BidError extends Error {
  constructor(public readonly msg: string, public readonly code = 400) {
    super(msg);
  }
}

/** Refund a held bid (inside the caller's transaction). */
async function refundHeld(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  bid: { id: string; userId: string; amount: number; auctionId: string },
  status: "OUTBID" | "REFUNDED",
  why: string
) {
  const moved = await tx.spotlightBid.updateMany({ where: { id: bid.id, status: "HELD" }, data: { status } });
  if (moved.count !== 1) return;
  await creditPoints(tx, {
    userId: bid.userId,
    points: bid.amount,
    type: TransactionType.REFUND,
    description: `Spotlight bid returned — ${why}`,
    reference: `spotlight_refund_${bid.id}_${bid.amount}`,
    metadata: { source: "spotlight", auctionId: bid.auctionId },
    // Getting your own points back is not earning.
    countsAsEarning: false,
  });
}

export async function placeSpotlightBid(
  userId: string,
  auctionId: string,
  postId: string,
  amount: number
): Promise<{ ok: true; amount: number } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  if (!Number.isInteger(amount) || amount <= 0) return fail("Enter a whole number of points.");

  const post = await prisma.post.findFirst({
    where: { id: postId, userId, isPublic: true, isHidden: false },
    select: { id: true },
  });
  if (!post) return fail("Pick one of your own public posts to feature.");

  const pointsPerUsd = await getPointsPerUsd();
  let outbid: { userId: string; amount: number } | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SpotlightAuction" WHERE id = ${auctionId} FOR UPDATE`;
      const a = await tx.spotlightAuction.findUnique({ where: { id: auctionId } });
      if (!a || a.status !== "OPEN") throw new BidError("This spotlight isn't taking bids.", 404);
      if (a.biddingEndsAt.getTime() <= Date.now()) throw new BidError("Bidding has ended.");

      const top = await tx.spotlightBid.findFirst({ where: { auctionId, status: "HELD" } });
      const need = top ? top.amount + a.bidStep : a.minBid;
      if (amount < need) {
        throw new BidError(top ? `Bid at least ${need.toLocaleString()} points (current top + ${a.bidStep}).` : `The starting bid is ${a.minBid.toLocaleString()} points.`);
      }

      const mine = await tx.spotlightBid.findUnique({ where: { auctionId_userId: { auctionId, userId } } });
      // Raising your own top bid holds only the difference.
      const alreadyHeld = mine && mine.status === "HELD" ? mine.amount : 0;
      const toHold = amount - alreadyHeld;
      const debited = await tx.user.updateMany({
        where: { id: userId, pointsBalance: { gte: toHold } },
        data: { pointsBalance: { decrement: toHold } },
      });
      if (debited.count !== 1) throw new BidError("You don't have enough points for that bid.");
      await recordTransaction(tx, {
        userId,
        type: TransactionType.PURCHASE,
        points: -toHold,
        amountUsd: -toHold / pointsPerUsd,
        description: `Spotlight bid held — ${a.title}`,
        reference: `spotlight_hold_${auctionId}_${userId}_${amount}`,
        metadata: { source: "spotlight", auctionId, bid: amount },
      });

      if (top && top.userId !== userId) {
        await refundHeld(tx, top, "OUTBID", `outbid on "${a.title}"`);
        outbid = { userId: top.userId, amount: top.amount };
      }
      await tx.spotlightBid.upsert({
        where: { auctionId_userId: { auctionId, userId } },
        create: { auctionId, userId, postId, amount, status: "HELD" },
        update: { postId, amount, status: "HELD" },
      });
    });
  } catch (e) {
    if (e instanceof BidError) return fail(e.msg, e.code);
    throw e;
  }

  if (outbid) {
    const o = outbid as { userId: string; amount: number };
    await prisma.notification
      .create({
        data: {
          userId: o.userId,
          type: NotificationType.SYSTEM,
          title: "You were outbid on the Spotlight",
          message: `Someone bid ${amount.toLocaleString()} points. Your ${o.amount.toLocaleString()} points are back in your balance — bid again to win the spot.`,
          data: { link: "/spotlight" },
        },
      })
      .catch(() => {});
  }
  return { ok: true, amount };
}

/**
 * Close every auction whose bidding has ended: the top bid wins and its post
 * is promoted; no bids → NO_BIDS. The status flip is a compare-and-set.
 */
export async function closeEndedSpotlights(): Promise<{ awarded: number; empty: number }> {
  const due = await prisma.spotlightAuction.findMany({
    where: { status: "OPEN", biddingEndsAt: { lte: new Date() } },
    orderBy: { biddingEndsAt: "asc" },
    select: { id: true },
    take: 50,
  });
  let awarded = 0;
  let empty = 0;
  // One auction failing must never stop the others from closing.
  for (const { id } of due) {
    try {
      const r = await awardSpotlight(id);
      if (r === "awarded") awarded++;
      else if (r === "empty") empty++;
    } catch (e) {
      console.error("[spotlight] award failed", id, e);
    }
  }
  return { awarded, empty };
}

export async function awardSpotlight(auctionId: string): Promise<"awarded" | "empty" | "skipped"> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SpotlightAuction" WHERE id = ${auctionId} FOR UPDATE`;
    const a = await tx.spotlightAuction.findUnique({ where: { id: auctionId } });
    if (!a || a.status !== "OPEN") return null;
    const top = await tx.spotlightBid.findFirst({ where: { auctionId, status: "HELD" } });
    if (!top) {
      await tx.spotlightAuction.update({ where: { id: auctionId }, data: { status: "NO_BIDS", awardedAt: new Date() } });
      return { kind: "empty" as const };
    }
    const until = new Date(Date.now() + a.displayHours * 3_600_000);
    await tx.spotlightBid.update({ where: { id: top.id }, data: { status: "WON" } });
    await tx.spotlightAuction.update({
      where: { id: auctionId },
      data: { status: "AWARDED", winnerUserId: top.userId, winnerPostId: top.postId, winnerBid: top.amount, awardedAt: new Date() },
    });
    // The winning bid is spent either way. A post the winner deleted, hid or
    // made private after bidding is simply not promoted — it used to throw
    // here, roll the award back, and stall every auction behind it.
    await tx.post.updateMany({
      where: { id: top.postId, userId: top.userId, isPublic: true, isHidden: false },
      data: { isPromoted: true, promotedUntil: until, promotedNote: "Spotlight" },
    });
    await tx.notification.create({
      data: {
        userId: top.userId,
        type: NotificationType.ACHIEVEMENT,
        title: "🌟 You won the Spotlight!",
        message: `Your post is featured in the feed for ${a.displayHours} hours.`,
        popup: true,
        data: {
          link: "/spotlight",
          popup: { kind: "achievement", headline: "You won the Spotlight!", amount: `Featured for ${a.displayHours} hours`, cta: { label: "See the feed", href: "/social" } },
        },
      },
    });
    return { kind: "awarded" as const };
  });
  return result?.kind ?? "skipped";
}

/** Admin: cancel an open auction and return the held bid. */
export async function cancelSpotlight(auctionId: string): Promise<{ ok: true } | Fail> {
  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SpotlightAuction" WHERE id = ${auctionId} FOR UPDATE`;
    const a = await tx.spotlightAuction.findUnique({ where: { id: auctionId } });
    if (!a || a.status !== "OPEN") return false;
    const held = await tx.spotlightBid.findMany({ where: { auctionId, status: "HELD" } });
    for (const b of held) await refundHeld(tx, b, "REFUNDED", `"${a.title}" was cancelled`);
    await tx.spotlightAuction.update({ where: { id: auctionId }, data: { status: "CANCELLED" } });
    return true;
  });
  return done ? { ok: true } : fail("Only an open spotlight can be cancelled.");
}
