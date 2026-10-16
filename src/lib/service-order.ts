import "server-only";
import { prisma } from "@/lib/prisma";
import { MarketplaceDealStatus, MarketplaceListingStatus } from "@/generated/prisma";
import { resolveCommissionBps } from "@/lib/marketplace-commission";
import { ACTIVE_STATUSES, fundDeal } from "@/lib/marketplace-deal";
import { isServiceType } from "@/lib/marketplace-categories";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import {
  ORDER_SENDER_TYPE,
  dueDateFrom,
  encodeOrderBrief,
  readRequirements,
  resolveServiceTier,
  validateAnswers,
} from "@/lib/service-packages";

/**
 * Ordering a service. Escrow is mandatory: an order is a MarketplaceDeal,
 * created on the listing's own terms (the chosen package) and funded at once
 * through `fundDeal` — the one audited money move for escrow. Nothing here
 * moves money itself.
 *
 * The deal is created already "seller-proposed" (proposedById = seller):
 * the published package IS the seller's offer, so the buyer can fund it
 * without a second acceptance step.
 */

export type ServiceOrderResult =
  | { ok: true; dealId: string; threadId: string }
  | { ok: false; error: string; status: number; threadId?: string; shortBy?: number };

export async function placeServiceOrder(opts: {
  listingId: string;
  buyerId: string;
  tierId?: string | null;
  answers?: unknown;
  affiliateCookie?: string;
}): Promise<ServiceOrderResult> {
  const { listingId, buyerId } = opts;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      status: true,
      assetType: true,
      price: true,
      details: true,
      auctionMode: true,
      commissionRateBps: true,
    },
  });
  if (!listing) return { ok: false, error: "Service not found.", status: 404 };
  if (!isServiceType(listing.assetType)) {
    return { ok: false, error: "Only services are ordered this way.", status: 400 };
  }
  if (listing.status !== MarketplaceListingStatus.ACTIVE) {
    return { ok: false, error: "This service isn't taking orders right now.", status: 400 };
  }
  if (listing.sellerId === buyerId) {
    return { ok: false, error: "You can't order your own service.", status: 400 };
  }

  const tierR = resolveServiceTier(listing.details, toNum(listing.price), opts.tierId);
  if (!tierR.ok) return { ok: false, error: tierR.error, status: 400 };
  const tier = tierR.tier;
  const answersR = validateAnswers(readRequirements(listing.details), opts.answers);
  if (!answersR.ok) return { ok: false, error: answersR.error, status: 400 };

  // Fast fail before anything is created. fundDeal's debit CAS stays the
  // authority — the balance can still move in between.
  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { cashBalance: true } });
  if (!buyer) return { ok: false, error: "User not found.", status: 404 };
  const balance = toNum(buyer.cashBalance);
  if (balance < tier.price) {
    return {
      ok: false,
      error: `Not enough in your wallet — this order is ${usd(tier.price)}, you have ${usd(balance)}.`,
      status: 402,
      shortBy: Math.round((tier.price - balance) * 100) / 100,
    };
  }

  // One conversation per (service, buyer) — the order lives in it.
  let thread = await prisma.marketplaceThread.findUnique({
    where: { listingId_buyerId: { listingId, buyerId } },
    select: { id: true },
  });
  if (!thread) {
    try {
      thread = await prisma.marketplaceThread.create({
        data: { listingId, buyerId, sellerId: listing.sellerId },
        select: { id: true },
      });
    } catch {
      // A parallel request created it first (unique listingId+buyerId).
      thread = await prisma.marketplaceThread.findUnique({
        where: { listingId_buyerId: { listingId, buyerId } },
        select: { id: true },
      });
      if (!thread) return { ok: false, error: "Could not open the order conversation.", status: 500 };
    }
  }
  const threadId = thread.id;

  const bps = await resolveCommissionBps({
    assetType: listing.assetType,
    perListingOverride: listing.commissionRateBps,
  });

  // Create the deal + its brief under a thread row lock, so two clicks (or two
  // tabs) cannot open two active orders in one conversation.
  const now = new Date();
  const dueAt = dueDateFrom(now, tier.deliveryDays);
  let created: { dealId: string; briefId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MarketplaceThread" WHERE "id" = ${threadId} FOR UPDATE`;
      const active = await tx.marketplaceDeal.findFirst({
        where: { threadId, status: { in: ACTIVE_STATUSES } },
        select: { status: true },
      });
      if (active) throw new Error(active.status === MarketplaceDealStatus.PROPOSED ? "OPEN_PROPOSAL" : "ACTIVE_ORDER");
      const deal = await tx.marketplaceDeal.create({
        data: {
          threadId,
          listingId,
          buyerId,
          sellerId: listing.sellerId,
          proposedById: listing.sellerId,
          amount: tier.price,
          commissionBps: bps,
          adminMediated: false,
          adminFee: 0,
          status: MarketplaceDealStatus.PROPOSED,
        },
        select: { id: true },
      });
      const brief = await tx.marketplaceThreadMessage.create({
        data: {
          threadId,
          senderId: buyerId,
          senderType: ORDER_SENDER_TYPE,
          body: encodeOrderBrief({
            v: 1,
            dealId: deal.id,
            tier,
            answers: answersR.answers,
            orderedAt: now.toISOString(),
            dueAt: dueAt?.toISOString() ?? null,
          }),
          attachments: [],
        },
        select: { id: true },
      });
      await tx.marketplaceThread.update({
        where: { id: threadId },
        data: { lastMessageAt: now },
      });
      return { dealId: deal.id, briefId: brief.id };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ACTIVE_ORDER") {
      return {
        ok: false,
        error: "You already have an order in progress for this service — finish it first.",
        status: 409,
        threadId,
      };
    }
    if (msg === "OPEN_PROPOSAL") {
      return {
        ok: false,
        error: "There's an open deal proposal in your conversation with this seller — fund or cancel it first.",
        status: 409,
        threadId,
      };
    }
    throw err;
  }

  let funded: Awaited<ReturnType<typeof fundDeal>>;
  try {
    funded = await fundDeal({ dealId: created.dealId, buyerId, affiliateCookie: opts.affiliateCookie });
  } catch (err) {
    await abandonOrder(created).catch(() => {});
    throw err;
  }
  if (!funded.ok) {
    await abandonOrder(created).catch(() => {});
    return { ok: false, error: funded.error, status: funded.status ?? 400, threadId };
  }
  return { ok: true, dealId: created.dealId, threadId };
}

/**
 * Funding failed: withdraw the unfunded order so the buyer can try again.
 * CAS on PROPOSED — if the funding actually committed (a lost response), the
 * deal is FUNDED, this matches nothing, and the brief is kept.
 */
async function abandonOrder(created: { dealId: string; briefId: string }) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.marketplaceDeal.updateMany({
      where: { id: created.dealId, status: MarketplaceDealStatus.PROPOSED },
      data: { status: MarketplaceDealStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (r.count === 0) throw new Error("FUNDED");
    await tx.marketplaceThreadMessage.deleteMany({ where: { id: created.briefId } });
  });
}
