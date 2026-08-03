import { prisma } from "@/lib/prisma";
import {
  MarketplaceDealStatus,
  MarketplaceListingStatus,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import { resolveCommissionBps, splitPrice } from "@/lib/marketplace-commission";
import { getMediationConfig, mediationFee } from "@/lib/marketplace-mediation";
import {
  getAffiliateConfig,
  isAffiliateEligible,
  computeAffiliateCommission,
  parseAttribution,
} from "@/lib/affiliate";
import { notifyUser } from "@/lib/notify";
import { inngest, EVENTS } from "@/lib/inngest/client";
import { toNum } from "@/lib/money";

/**
 * Escrow "deal" engine for the marketplace. A deal holds the buyer's funds
 * (`heldAmount`) until delivery is confirmed and released to the seller, or
 * refunded to the buyer. Optional admin mediation adds a buyer-paid fee.
 *
 * Money model matches the rest of the app: there is no house account — the
 * platform holds escrow implicitly (buyer debited at funding; seller credited
 * from an increment at release; buyer re-credited at refund). Integrity comes
 * from `Transaction` rows keyed by a unique `reference`, and every state change
 * is an atomic compare-and-swap on `MarketplaceDeal.status`.
 */

/** Days after DELIVERED before funds auto-release to the seller. */
const AUTO_RELEASE_DAYS = 3;

export type DealResult =
  | { ok: true; dealId: string }
  | { ok: false; error: string; status?: number };

// The interactive-transaction client type, derived from the (Accelerate-
// extended) prisma client so it matches what `$transaction` hands the callback.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Append a SYSTEM narration message to a thread + bump its timestamp. */
async function systemMessage(tx: Tx, threadId: string, body: string) {
  await tx.marketplaceThreadMessage.create({
    data: { threadId, senderId: "system", senderType: "SYSTEM", body },
  });
  await tx.marketplaceThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });
}

/** Non-terminal deal states — only one may exist per thread at a time. */
const ACTIVE_STATUSES: MarketplaceDealStatus[] = [
  MarketplaceDealStatus.PROPOSED,
  MarketplaceDealStatus.FUNDED,
  MarketplaceDealStatus.DELIVERED,
  MarketplaceDealStatus.DISPUTED,
];

/**
 * Propose deal terms in a thread. Either the buyer or the seller may propose.
 * Resolves + stores the commission rate and (if admin-mediated) the fee now, so
 * later steps are deterministic.
 */
export async function proposeDeal(opts: {
  threadId: string;
  proposerId: string;
  amount: number;
  adminMediated: boolean;
}): Promise<DealResult> {
  const { threadId, proposerId, amount, adminMediated } = opts;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid deal amount.", status: 400 };
  }

  const thread = await prisma.marketplaceThread.findUnique({
    where: { id: threadId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          sellerId: true,
          status: true,
          assetType: true,
          commissionRateBps: true,
        },
      },
    },
  });
  if (!thread) return { ok: false, error: "Conversation not found.", status: 404 };
  if (proposerId !== thread.buyerId && proposerId !== thread.sellerId) {
    return { ok: false, error: "Not a participant.", status: 403 };
  }
  if (thread.listing.status !== MarketplaceListingStatus.ACTIVE) {
    return { ok: false, error: "This listing is no longer available.", status: 400 };
  }

  const existing = await prisma.marketplaceDeal.findFirst({
    where: { threadId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "A deal is already in progress in this conversation.", status: 409 };
  }

  const bps = await resolveCommissionBps({
    assetType: thread.listing.assetType,
    perListingOverride: thread.listing.commissionRateBps,
  });

  let adminFee = 0;
  let mediated = false;
  if (adminMediated) {
    const cfg = await getMediationConfig();
    if (cfg.enabled) {
      mediated = true;
      adminFee = mediationFee(amount, cfg.feeBps);
    }
  }

  const deal = await prisma.marketplaceDeal.create({
    data: {
      threadId,
      listingId: thread.listingId,
      buyerId: thread.buyerId,
      sellerId: thread.sellerId,
      proposedById: proposerId,
      amount,
      commissionBps: bps,
      adminMediated: mediated,
      adminFee,
      status: MarketplaceDealStatus.PROPOSED,
    },
  });

  await prisma.marketplaceThreadMessage.create({
    data: {
      threadId,
      senderId: "system",
      senderType: "SYSTEM",
      body: `${proposerId === thread.buyerId ? "Buyer" : "Seller"} proposed a deal for $${amount.toFixed(2)}${
        mediated ? ` (admin-mediated, +$${adminFee.toFixed(2)} fee)` : ""
      }.`,
    },
  });

  const other = proposerId === thread.buyerId ? thread.sellerId : thread.buyerId;
  notifyUser({
    userId: other,
    type: "SYSTEM",
    title: "New deal proposed",
    message: `A deal for $${amount.toFixed(2)} was proposed on "${thread.listing.title}".`,
    link: `/marketplace/messages/${threadId}`,
  }).catch(() => {});

  return { ok: true, dealId: deal.id };
}

/**
 * Buyer funds the escrow. Debits `amount + adminFee` atomically, holds the
 * principal, records ledger rows, and (if admin-mediated) collects the fee for
 * the platform. Resolves affiliate attribution from the buyer's cookie and locks
 * the reward on the deal. Idempotent: a retry after success no-ops on the CAS.
 */
export async function fundDeal(opts: {
  dealId: string;
  buyerId: string;
  affiliateCookie?: string;
}): Promise<DealResult> {
  const { dealId, buyerId, affiliateCookie } = opts;

  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id: dealId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          sellerId: true,
          assetType: true,
          commissionRateBps: true,
          affiliateCommissionType: true,
          affiliateCommissionValue: true,
        },
      },
    },
  });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };
  if (deal.buyerId !== buyerId) return { ok: false, error: "Only the buyer can fund this deal.", status: 403 };
  if (deal.status !== MarketplaceDealStatus.PROPOSED) {
    return { ok: false, error: `Deal is ${deal.status.toLowerCase()}, cannot fund.`, status: 400 };
  }

  const amount = toNum(deal.amount);
  const bps = deal.commissionBps ?? 500;
  const { sellerAmount } = splitPrice(amount, bps);
  const adminFee = toNum(deal.adminFee);

  // Affiliate attribution (out of the seller's cut) — resolve + lock now.
  let affiliateUserId: string | null = null;
  let affiliateAmount = 0;
  {
    const cfg = await getAffiliateConfig();
    if (
      cfg.enabled &&
      isAffiliateEligible(
        deal.listing.affiliateCommissionType,
        deal.listing.affiliateCommissionValue == null
          ? null
          : toNum(deal.listing.affiliateCommissionValue)
      )
    ) {
      const attr = parseAttribution(
        affiliateCookie,
        "MARKETPLACE",
        deal.listingId,
        cfg.cookieWindowDays,
        Date.now()
      );
      if (attr && attr.aff !== buyerId && attr.aff !== deal.sellerId) {
        const aff = await prisma.user.findUnique({
          where: { id: attr.aff },
          select: { id: true, affiliateJoinedAt: true },
        });
        if (aff?.affiliateJoinedAt) {
          affiliateAmount = computeAffiliateCommission(
            deal.listing.affiliateCommissionType,
            deal.listing.affiliateCommissionValue == null
              ? null
              : toNum(deal.listing.affiliateCommissionValue),
            amount,
            sellerAmount
          );
          if (affiliateAmount > 0) affiliateUserId = aff.id;
        }
      }
    }
  }

  const total = Math.round((amount + adminFee) * 100) / 100;
  const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_DAYS * 86_400_000);

  try {
    await prisma.$transaction(async (tx) => {
      // CAS: claim the PROPOSED→FUNDED transition.
      const claimed = await tx.marketplaceDeal.updateMany({
        where: { id: dealId, status: MarketplaceDealStatus.PROPOSED },
        data: {
          status: MarketplaceDealStatus.FUNDED,
          heldAmount: amount,
          commissionBps: bps,
          affiliateUserId,
          affiliateAmount,
          autoReleaseAt,
        },
      });
      if (claimed.count === 0) throw new Error("ALREADY_FUNDED");

      // Atomic buyer debit (principal + fee).
      const debited = await tx.user.updateMany({
        where: { id: buyerId, cashBalance: { gte: total } },
        data: { cashBalance: { decrement: total } },
      });
      if (debited.count === 0) throw new Error("INSUFFICIENT");

      await tx.transaction.create({
        data: {
          userId: buyerId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -amount,
          points: 0,
          description: `Escrow funded — "${deal.listing.title}"`,
          reference: `deal_${dealId}`,
          metadata: { dealId, listingId: deal.listingId, kind: "escrow_hold" },
        },
      });
      if (adminFee > 0) {
        await tx.transaction.create({
          data: {
            userId: buyerId,
            type: TransactionType.ADMIN_FEE,
            status: TransactionStatus.COMPLETED,
            amount: -adminFee,
            points: 0,
            description: `Admin mediation fee — "${deal.listing.title}"`,
            reference: `deal_adminfee_${dealId}`,
            metadata: { dealId, listingId: deal.listingId },
          },
        });
      }

      await systemMessage(
        tx,
        deal.threadId,
        `Buyer funded escrow — $${amount.toFixed(2)} is held until delivery is confirmed.`
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ALREADY_FUNDED") return { ok: true, dealId };
    if (msg === "INSUFFICIENT") {
      return { ok: false, error: "Insufficient wallet balance to fund this deal.", status: 402 };
    }
    throw err;
  }

  notifyUser({
    userId: deal.sellerId,
    type: "SYSTEM",
    title: "Escrow funded — deliver now",
    message: `The buyer funded $${amount.toFixed(2)} for "${deal.listing.title}". Deliver, then they'll confirm.`,
    link: `/marketplace/messages/${deal.threadId}`,
  }).catch(() => {});

  await inngest
    .send({ name: EVENTS.DEAL_FUNDED, data: { dealId } })
    .catch(() => {});

  return { ok: true, dealId };
}

/** Seller marks the deal delivered → starts the buyer-confirm / auto-release window. */
export async function markDelivered(opts: {
  dealId: string;
  sellerId: string;
}): Promise<DealResult> {
  const { dealId, sellerId } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id: dealId },
    include: { listing: { select: { title: true } } },
  });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };
  if (deal.sellerId !== sellerId) return { ok: false, error: "Only the seller can mark delivery.", status: 403 };
  if (deal.status !== MarketplaceDealStatus.FUNDED) {
    return { ok: false, error: `Deal is ${deal.status.toLowerCase()}, cannot mark delivered.`, status: 400 };
  }

  const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_DAYS * 86_400_000);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.marketplaceDeal.updateMany({
      where: { id: dealId, status: MarketplaceDealStatus.FUNDED },
      data: { status: MarketplaceDealStatus.DELIVERED, deliveredAt: new Date(), autoReleaseAt },
    });
    if (claimed.count === 0) throw new Error("RACE");
    await systemMessage(
      tx,
      deal.threadId,
      `Seller marked the item delivered. Buyer, please confirm — funds auto-release in ${AUTO_RELEASE_DAYS} days.`
    );
  });

  notifyUser({
    userId: deal.buyerId,
    type: "SYSTEM",
    title: "Delivered — confirm to release",
    message: `The seller marked "${deal.listing.title}" delivered. Confirm to release the funds (auto-releases in ${AUTO_RELEASE_DAYS} days).`,
    link: `/marketplace/messages/${deal.threadId}`,
  }).catch(() => {});

  await inngest
    .send({ name: EVENTS.DEAL_DELIVERED, data: { dealId, autoReleaseAt: autoReleaseAt.toISOString() } })
    .catch(() => {});

  return { ok: true, dealId };
}

/**
 * Release held funds to the seller (buyer confirm, admin decision, or the
 * auto-release timer). Splits the platform commission, pays any locked affiliate
 * reward out of the seller's cut, and creates a COMPLETED MarketplacePurchase so
 * the existing download-gate + orders views work. Idempotent via the CAS.
 */
export async function releaseDeal(opts: {
  dealId: string;
  actor: "BUYER" | "ADMIN" | "SYSTEM";
}): Promise<DealResult> {
  const { dealId, actor } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id: dealId },
    include: { listing: { select: { id: true, title: true } } },
  });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };

  const allowedFrom: MarketplaceDealStatus[] =
    actor === "BUYER"
      ? [MarketplaceDealStatus.DELIVERED]
      : actor === "SYSTEM"
      ? [MarketplaceDealStatus.DELIVERED]
      : [MarketplaceDealStatus.DELIVERED, MarketplaceDealStatus.DISPUTED]; // ADMIN
  if (!allowedFrom.includes(deal.status)) {
    return { ok: false, error: `Deal is ${deal.status.toLowerCase()}, cannot release.`, status: 400 };
  }
  if (actor === "SYSTEM" && deal.autoReleaseAt && deal.autoReleaseAt > new Date()) {
    return { ok: false, error: "Auto-release time not reached.", status: 400 };
  }

  const amount = toNum(deal.amount);
  const bps = deal.commissionBps ?? 500;
  const { fee, sellerAmount } = splitPrice(amount, bps);
  const affiliateAmount = toNum(deal.affiliateAmount);
  const sellerNet = Math.round((sellerAmount - affiliateAmount) * 100) / 100;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.marketplaceDeal.updateMany({
        where: { id: dealId, status: { in: allowedFrom } },
        data: {
          status: MarketplaceDealStatus.RELEASED,
          releasedAt: new Date(),
          confirmedAt: actor === "BUYER" ? new Date() : deal.confirmedAt,
          heldAmount: 0,
        },
      });
      if (claimed.count === 0) throw new Error("RACE");

      const purchase = await tx.marketplacePurchase.create({
        data: {
          listingId: deal.listingId,
          buyerId: deal.buyerId,
          amount,
          fee,
          sellerAmount: sellerNet,
          status: "COMPLETED",
        },
      });
      await tx.marketplaceDeal.update({
        where: { id: dealId },
        data: { purchaseId: purchase.id },
      });

      // Single-quantity listing → mark SOLD if it's still active (best-effort).
      await tx.marketplaceListing.updateMany({
        where: { id: deal.listingId, status: MarketplaceListingStatus.ACTIVE },
        data: { status: MarketplaceListingStatus.SOLD },
      });

      // Pay the seller.
      await tx.user.update({
        where: { id: deal.sellerId },
        data: {
          cashBalance: { increment: sellerNet },
          totalEarnings: { increment: sellerNet },
        },
      });
      await tx.transaction.create({
        data: {
          userId: deal.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          amount: sellerNet,
          points: 0,
          description: `Escrow released — "${deal.listing.title}"`,
          reference: `deal_release_${dealId}`,
          metadata: { dealId, listingId: deal.listingId, purchaseId: purchase.id, platformFee: fee },
        },
      });

      // Affiliate payout (locked at funding).
      if (deal.affiliateUserId && affiliateAmount > 0) {
        await tx.user.update({
          where: { id: deal.affiliateUserId },
          data: {
            cashBalance: { increment: affiliateAmount },
            totalEarnings: { increment: affiliateAmount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: deal.affiliateUserId,
            type: TransactionType.AFFILIATE_COMMISSION,
            status: TransactionStatus.COMPLETED,
            amount: affiliateAmount,
            points: 0,
            description: `Affiliate commission — "${deal.listing.title}"`,
            reference: `affiliate_deal_${dealId}`,
            metadata: { dealId, listingId: deal.listingId, purchaseId: purchase.id },
          },
        });
        await tx.affiliateCommission.create({
          data: {
            affiliateUserId: deal.affiliateUserId,
            sourceType: "MARKETPLACE",
            sourceId: deal.listingId,
            orderRef: purchase.id,
            buyerId: deal.buyerId,
            saleAmount: amount,
            commissionAmount: affiliateAmount,
          },
        });
      }

      await systemMessage(
        tx,
        deal.threadId,
        `Funds released to the seller ($${sellerNet.toFixed(2)} after fees). Deal complete.`
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "RACE") return { ok: true, dealId };
    throw err;
  }

  notifyUser({
    userId: deal.sellerId,
    type: "WALLET",
    title: "Payment released 🎉",
    message: `You received $${sellerNet.toFixed(2)} for "${deal.listing.title}".`,
    link: `/marketplace/messages/${deal.threadId}`,
  }).catch(() => {});
  notifyUser({
    userId: deal.buyerId,
    type: "SYSTEM",
    title: "Deal complete",
    message: `Your purchase of "${deal.listing.title}" is complete — the download is now available.`,
    link: `/marketplace/orders`,
  }).catch(() => {});

  return { ok: true, dealId };
}

/**
 * Refund the buyer (admin decision, or a mutual pre-delivery cancel). Returns the
 * held principal to the buyer's wallet — a true clawback, since the seller was
 * never credited. The admin fee is retained by the platform when an admin
 * actually mediated (DISPUTED); refunded on a no-fault pre-funding-only cancel.
 */
export async function refundDeal(opts: {
  dealId: string;
  actor: "ADMIN" | "SYSTEM";
  reason?: string;
  refundAdminFee?: boolean;
}): Promise<DealResult> {
  const { dealId, actor, reason } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id: dealId },
    include: { listing: { select: { title: true } } },
  });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };

  const allowedFrom: MarketplaceDealStatus[] = [
    MarketplaceDealStatus.FUNDED,
    MarketplaceDealStatus.DELIVERED,
    MarketplaceDealStatus.DISPUTED,
  ];
  if (!allowedFrom.includes(deal.status)) {
    return { ok: false, error: `Deal is ${deal.status.toLowerCase()}, cannot refund.`, status: 400 };
  }

  const held = toNum(deal.heldAmount);
  const adminFee = toNum(deal.adminFee);
  // Default: refund the fee only when nothing was mediated (still FUNDED).
  const refundFee =
    opts.refundAdminFee ?? deal.status === MarketplaceDealStatus.FUNDED;
  const refundTotal = Math.round((held + (refundFee ? adminFee : 0)) * 100) / 100;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.marketplaceDeal.updateMany({
        where: { id: dealId, status: { in: allowedFrom } },
        data: { status: MarketplaceDealStatus.REFUNDED, refundedAt: new Date(), heldAmount: 0 },
      });
      if (claimed.count === 0) throw new Error("RACE");

      if (refundTotal > 0) {
        await tx.user.update({
          where: { id: deal.buyerId },
          data: { cashBalance: { increment: refundTotal } },
        });
        await tx.transaction.create({
          data: {
            userId: deal.buyerId,
            type: TransactionType.REFUND,
            status: TransactionStatus.COMPLETED,
            amount: refundTotal,
            points: 0,
            description: `Escrow refund — "${deal.listing.title}"`,
            reference: `deal_refund_${dealId}`,
            metadata: { dealId, listingId: deal.listingId, reason: reason ?? null, refundedFee: refundFee },
          },
        });
      }

      await systemMessage(
        tx,
        deal.threadId,
        `Refunded $${refundTotal.toFixed(2)} to the buyer${reason ? ` — ${reason}` : ""}. Deal closed.`
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "RACE") return { ok: true, dealId };
    throw err;
  }

  notifyUser({
    userId: deal.buyerId,
    type: "WALLET",
    title: "Refund issued",
    message: `You were refunded $${refundTotal.toFixed(2)} for "${deal.listing.title}".`,
    link: `/marketplace/messages/${deal.threadId}`,
  }).catch(() => {});
  notifyUser({
    userId: deal.sellerId,
    type: "SYSTEM",
    title: "Deal refunded",
    message: `The deal for "${deal.listing.title}" was refunded to the buyer${actor === "ADMIN" ? " by an admin" : ""}.`,
    link: `/marketplace/messages/${deal.threadId}`,
  }).catch(() => {});

  return { ok: true, dealId };
}

/** Cancel a not-yet-funded deal (buyer or seller). No money has moved. */
export async function cancelDeal(opts: {
  dealId: string;
  userId: string;
}): Promise<DealResult> {
  const { dealId, userId } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({ where: { id: dealId } });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };
  if (userId !== deal.buyerId && userId !== deal.sellerId) {
    return { ok: false, error: "Not a participant.", status: 403 };
  }
  if (deal.status !== MarketplaceDealStatus.PROPOSED) {
    return { ok: false, error: "Only an unfunded deal can be cancelled.", status: 400 };
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.marketplaceDeal.updateMany({
      where: { id: dealId, status: MarketplaceDealStatus.PROPOSED },
      data: { status: MarketplaceDealStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("RACE");
    await systemMessage(tx, deal.threadId, `Deal cancelled.`);
  });
  return { ok: true, dealId };
}

/**
 * Escalate a funded/delivered deal to admin mediation. Marks it DISPUTED, turns
 * on mediation, and charges the mediation fee to the escalating party (best
 * effort — the dispute still opens if their balance can't cover it).
 */
export async function escalateToAdmin(opts: {
  dealId: string;
  userId: string;
  reason?: string;
}): Promise<DealResult> {
  const { dealId, userId, reason } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id: dealId },
    include: { listing: { select: { title: true } } },
  });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };
  if (userId !== deal.buyerId && userId !== deal.sellerId) {
    return { ok: false, error: "Not a participant.", status: 403 };
  }
  const allowedFrom: MarketplaceDealStatus[] = [
    MarketplaceDealStatus.FUNDED,
    MarketplaceDealStatus.DELIVERED,
  ];
  if (!allowedFrom.includes(deal.status)) {
    return { ok: false, error: `Deal is ${deal.status.toLowerCase()}, cannot escalate.`, status: 400 };
  }

  // Fee only if it wasn't already an admin-mediated deal.
  let newFee = 0;
  if (!deal.adminMediated) {
    const cfg = await getMediationConfig();
    if (cfg.enabled) newFee = mediationFee(toNum(deal.amount), cfg.feeBps);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.marketplaceDeal.updateMany({
      where: { id: dealId, status: { in: allowedFrom } },
      data: { status: MarketplaceDealStatus.DISPUTED, adminMediated: true },
    });
    if (claimed.count === 0) throw new Error("RACE");

    if (newFee > 0) {
      const charged = await tx.user.updateMany({
        where: { id: userId, cashBalance: { gte: newFee } },
        data: { cashBalance: { decrement: newFee } },
      });
      if (charged.count > 0) {
        await tx.marketplaceDeal.update({
          where: { id: dealId },
          data: { adminFee: { increment: newFee } },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.ADMIN_FEE,
            status: TransactionStatus.COMPLETED,
            amount: -newFee,
            points: 0,
            description: `Admin mediation fee — "${deal.listing.title}"`,
            reference: `deal_escalatefee_${dealId}`,
            metadata: { dealId, listingId: deal.listingId },
          },
        });
      }
    }

    await systemMessage(
      tx,
      deal.threadId,
      `${userId === deal.buyerId ? "Buyer" : "Seller"} escalated to admin mediation${reason ? ` — ${reason}` : ""}.`
    );
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "RACE") throw err;
  });

  return { ok: true, dealId };
}

/** Assign (or reassign) the mediating admin on a disputed/mediated deal. */
export async function assignDealAdmin(opts: {
  dealId: string;
  adminId: string;
}): Promise<DealResult> {
  const { dealId, adminId } = opts;
  const deal = await prisma.marketplaceDeal.findUnique({ where: { id: dealId }, select: { id: true, threadId: true } });
  if (!deal) return { ok: false, error: "Deal not found.", status: 404 };
  await prisma.marketplaceDeal.update({ where: { id: dealId }, data: { assignedAdminId: adminId } });
  await prisma.marketplaceThread.update({ where: { id: deal.threadId }, data: { assignedAdminId: adminId } });
  return { ok: true, dealId };
}

/** Backstop sweep: auto-release DELIVERED deals whose timer has elapsed. */
export async function releaseDueDeals(limit = 50): Promise<{ candidates: number; released: number }> {
  const due = await prisma.marketplaceDeal.findMany({
    where: {
      status: MarketplaceDealStatus.DELIVERED,
      autoReleaseAt: { lte: new Date() },
    },
    select: { id: true },
    take: limit,
  });
  let released = 0;
  for (const { id } of due) {
    const r = await releaseDeal({ dealId: id, actor: "SYSTEM" });
    if (r.ok) released++;
  }
  return { candidates: due.length, released };
}
