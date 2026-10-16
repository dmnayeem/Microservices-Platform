import "server-only";
import { NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";
import {
  PlatformPayError,
  getSpendBalances,
  payPlatformOrThrow,
  refundPlatformPayment,
  insufficientError,
} from "@/lib/platform-pay";
import { defaultPaySource, type PaySource } from "@/lib/pay-source";
import { requireActiveUser } from "@/lib/require-active";

/**
 * Spotlight: an open auction, in Ad Points, for a featured place in the feed.
 *
 * Only the TOP bid is held. A new top bid refunds the previous top bidder at
 * once (they can bid again). When bidding ends the top bid wins: that hold is
 * spent, and the winner's chosen post is promoted (the feed's existing
 * PROMOTED placement) for `displayHours`. Highest bid wins — no draw, no luck.
 *
 * Paid from Ad Points or Ad Fund (owner, 2026-10-16) — never Earn Points or
 * Cash. A held bid is always ONE ledger row for its full amount
 * (`adpts_|adfund_spotlight_hold_<auction>_<user>_<amount>`): raising your own
 * bid returns the old hold and holds the new amount, so every refund (outbid,
 * raise, cancel, unusable post) gives back exactly what that row took, to the
 * balance it came from. That row is the record of the source — SpotlightBid
 * has no column for it.
 *
 * Bids held in Earn Points before the switch are still returned as Earn Points.
 *
 * Every bid runs under a row lock on the auction, so two bids can never both
 * become "top", and a refund is written exactly once (bid status CAS).
 */

type Fail = { ok: false; error: string; status: number; addFund?: string };
const fail = (error: string, status = 400, addFund?: string): Fail => ({ ok: false, error, status, addFund });

class BidError extends Error {
  constructor(public readonly msg: string, public readonly code = 400) {
    super(msg);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const holdRef = (auctionId: string, userId: string, amount: number) =>
  `spotlight_hold_${auctionId}_${userId}_${amount}`;

/**
 * Return a held bid's money (inside the caller's transaction), to the balance
 * it was held from. The caller has already moved the bid out of HELD with a
 * CAS, so this runs at most once per hold.
 */
async function returnHold(
  tx: Tx,
  bid: { id: string; userId: string; amount: number; auctionId: string },
  refundRef: string,
  why: string
) {
  const back = await refundPlatformPayment(tx, {
    userId: bid.userId,
    payReference: holdRef(bid.auctionId, bid.userId, bid.amount),
    refundReference: refundRef,
    description: `Spotlight bid returned — ${why}`,
    purpose: "refund:spotlight",
    metadata: { auctionId: bid.auctionId, bidId: bid.id },
  });
  if (back) return;
  // A bid held in Earn Points before the Ad Points switch — its hold may be
  // several rows (raises held only the difference), so the old full-amount
  // refund is the right one.
  await creditPoints(tx, {
    userId: bid.userId,
    points: bid.amount,
    type: TransactionType.REFUND,
    description: `Spotlight bid returned — ${why}`,
    reference: refundRef,
    metadata: { source: "spotlight", auctionId: bid.auctionId },
    // Getting your own points back is not earning.
    countsAsEarning: false,
  });
}

/** Refund a held bid and mark it OUTBID / REFUNDED (inside the caller's transaction). */
async function refundHeld(
  tx: Tx,
  bid: { id: string; userId: string; amount: number; auctionId: string },
  status: "OUTBID" | "REFUNDED",
  why: string
) {
  const moved = await tx.spotlightBid.updateMany({ where: { id: bid.id, status: "HELD" }, data: { status } });
  if (moved.count !== 1) return;
  await returnHold(tx, bid, `spotlight_refund_${bid.id}_${bid.amount}`, why);
}

export async function placeSpotlightBid(
  userId: string,
  auctionId: string,
  postId: string,
  amount: number,
  chosen: PaySource | null = null
): Promise<{ ok: true; amount: number; paidFrom: PaySource } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  if (!Number.isInteger(amount) || amount <= 0) return fail("Enter a whole number of Ad Points.");

  const post = await prisma.post.findFirst({
    where: { id: postId, userId, isPublic: true, isHidden: false },
    select: { id: true },
  });
  if (!post) return fail("Pick one of your own public posts to feature.");

  const rate = await getAdPointsPerUsd();
  let from: PaySource = chosen ?? "AD_POINTS";
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
        throw new BidError(
          top
            ? `Bid at least ${need.toLocaleString()} Ad Points (current top + ${a.bidStep}).`
            : `The starting bid is ${a.minBid.toLocaleString()} Ad Points.`
        );
      }

      const mine = await tx.spotlightBid.findUnique({ where: { auctionId_userId: { auctionId, userId } } });
      // Raising your own top bid: return the old hold to where it came from,
      // then hold the whole new amount below — one row per hold, one source.
      // The bid stays HELD throughout (the upsert below rewrites its amount);
      // the auction lock makes the pair atomic.
      if (mine && mine.status === "HELD") {
        await returnHold(tx, mine, `spotlight_raise_${mine.id}_${mine.amount}`, `raised to ${amount.toLocaleString()}`);
      }
      // Default source decided AFTER the old hold came back: it must cover the
      // whole new bid, and the returned hold counts towards that.
      const picked = chosen ?? defaultPaySource(amount, await getSpendBalances(userId, tx), rate);
      if (!picked) throw await insufficientError(userId, amount, null, "/spotlight", rate);
      from = picked;

      await payPlatformOrThrow(tx, {
        userId,
        adPoints: amount,
        from,
        reference: holdRef(auctionId, userId, amount),
        description: `Spotlight bid held — ${a.title}`,
        purpose: "spotlight",
        metadata: { auctionId, bid: amount },
        returnTo: "/spotlight",
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
    if (e instanceof PlatformPayError) return fail(e.userMessage, 400, e.addFund);
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
          message: `Someone bid ${amount.toLocaleString()} Ad Points. Your ${o.amount.toLocaleString()} are back where they came from — bid again to win the spot.`,
          data: { link: "/spotlight" },
        },
      })
      .catch(() => {});
  }
  return { ok: true, amount, paidFrom: from };
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

    // The winner's post must still be promotable. A post deleted, hidden or
    // made private after bidding used to be "simply not promoted" while the
    // bid was still spent — the member paid for nothing. Now the winner gets
    // the hold back and the auction closes without a winner (CANCELLED, so
    // finance never counts it as a sale).
    const until = new Date(Date.now() + a.displayHours * 3_600_000);
    const promoted = await tx.post.updateMany({
      where: { id: top.postId, userId: top.userId, isPublic: true, isHidden: false },
      data: { isPromoted: true, promotedUntil: until, promotedNote: "Spotlight" },
    });
    if (promoted.count === 0) {
      await refundHeld(tx, top, "REFUNDED", `your post for "${a.title}" is no longer public`);
      await tx.spotlightAuction.update({ where: { id: auctionId }, data: { status: "CANCELLED", awardedAt: new Date() } });
      await tx.notification.create({
        data: {
          userId: top.userId,
          type: NotificationType.SYSTEM,
          title: "Spotlight bid returned",
          message: `You had the top bid on "${a.title}", but the post you picked was deleted or is no longer public, so it couldn't be featured. Your ${top.amount.toLocaleString()} Ad Points' worth is back where it came from.`,
          data: { link: "/spotlight" },
        },
      });
      return { kind: "empty" as const };
    }

    await tx.spotlightBid.update({ where: { id: top.id }, data: { status: "WON" } });
    await tx.spotlightAuction.update({
      where: { id: auctionId },
      data: { status: "AWARDED", winnerUserId: top.userId, winnerPostId: top.postId, winnerBid: top.amount, awardedAt: new Date() },
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
