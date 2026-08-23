import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import {
  MarketplaceListingStatus,
  MarketplaceOfferStatus,
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import { z } from "zod";
import {
  resolveCommissionBps,
  splitPrice,
} from "@/lib/marketplace-commission";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("reject") }),
  z.object({
    action: z.literal("counter"),
    counterAmount: z.number().positive(),
    counterMessage: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("withdraw") }),
]);

// PATCH /api/marketplace/listings/:id/offers/:offerId
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; offerId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, offerId } = await params;
    const body = await req.json();
    const v = patchSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const action = v.data;

    const offer = await prisma.marketplaceOffer.findUnique({
      where: { id: offerId },
      include: {
        listing: {
          select: {
            id: true,
            sellerId: true,
            status: true,
            title: true,
            price: true,
            assetType: true,
            commissionRateBps: true,
          },
        },
      },
    });
    if (!offer || offer.listingId !== id) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }
    const isOwner = offer.listing.sellerId === session.user.id;
    const isBuyer = offer.buyerId === session.user.id;

    // Authorization per action
    if (action.action === "accept" || action.action === "reject" || action.action === "counter") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Only the seller can accept/reject/counter offers" },
          { status: 403 }
        );
      }
    }
    if (action.action === "withdraw" && !isBuyer) {
      return NextResponse.json(
        { error: "Only the buyer can withdraw their offer" },
        { status: 403 }
      );
    }

    // Only PENDING / COUNTERED offers can change state
    if (
      offer.status !== MarketplaceOfferStatus.PENDING &&
      offer.status !== MarketplaceOfferStatus.COUNTERED
    ) {
      return NextResponse.json(
        { error: `Offer is already ${offer.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (action.action === "reject") {
      const updated = await prisma.marketplaceOffer.update({
        where: { id: offerId },
        data: { status: MarketplaceOfferStatus.REJECTED },
      });
      await prisma.notification.create({
        data: {
          userId: offer.buyerId,
          type: NotificationType.SYSTEM,
          title: "Offer rejected",
          message: `Your offer of $${offer.amount.toLocaleString()} on "${offer.listing.title}" was rejected.`,
          data: { listingId: id, offerId },
        },
      });
      return NextResponse.json({ offer: updated });
    }

    if (action.action === "withdraw") {
      const updated = await prisma.marketplaceOffer.update({
        where: { id: offerId },
        data: { status: MarketplaceOfferStatus.WITHDRAWN },
      });
      return NextResponse.json({ offer: updated });
    }

    if (action.action === "counter") {
      const updated = await prisma.marketplaceOffer.update({
        where: { id: offerId },
        data: {
          status: MarketplaceOfferStatus.COUNTERED,
          counterAmount: action.counterAmount,
          counterMessage: action.counterMessage ?? null,
        },
      });
      await prisma.notification.create({
        data: {
          userId: offer.buyerId,
          type: NotificationType.SYSTEM,
          title: "Counter-offer received",
          message: `Seller countered with $${action.counterAmount.toLocaleString()} on "${offer.listing.title}".`,
          data: {
            listingId: id,
            offerId,
            counterAmount: action.counterAmount,
          },
        },
      });
      return NextResponse.json({ offer: updated });
    }

    // ── accept ──
    if (offer.listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Listing is no longer active" },
        { status: 400 }
      );
    }

    const acceptedAmount = toNum(offer.amount);
    const bps = await resolveCommissionBps({
      assetType: offer.listing.assetType,
      perListingOverride: offer.listing.commissionRateBps,
    });
    const { fee, sellerAmount } = splitPrice(acceptedAmount, bps);

    // Interactive, not the array form, because the buyer debit has to be a
    // compare-and-set and the rest of the sale must not happen when it fails.
    //
    // What this replaced: a plain `cashBalance: { decrement }` with no balance
    // check anywhere in the file — the only two mentions of `cashBalance` were
    // this debit and the seller's credit. Combined with an unbounded
    // `z.number().positive()` on the offer amount, two accounts could mint
    // arbitrary cash: B offers $1,000,000 on a $0 balance, A accepts, A is
    // credited real withdrawable money and B simply goes negative.
    const settled = await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: offer.buyerId, cashBalance: { gte: acceptedAmount } },
        data: { cashBalance: { decrement: acceptedAmount } },
      });
      if (paid.count === 0) return null; // buyer can't cover — no sale

      // Re-check the listing inside the transaction. The status read above is
      // check-then-act; two accepts on competing offers could otherwise both
      // sell the same listing.
      const claimed = await tx.marketplaceListing.updateMany({
        where: { id, status: MarketplaceListingStatus.ACTIVE },
        data: {
          status: MarketplaceListingStatus.SOLD,
          directPurchasesCount: { increment: 1 },
        },
      });
      if (claimed.count === 0) {
        throw new Error("LISTING_TAKEN"); // rolls the debit back
      }

      const p = await tx.marketplacePurchase.create({
        data: {
          listingId: id,
          buyerId: offer.buyerId,
          amount: acceptedAmount,
          fee,
          sellerAmount,
          status: "COMPLETED",
        },
      });
      const o = await tx.marketplaceOffer.update({
        where: { id: offerId },
        data: { status: MarketplaceOfferStatus.ACCEPTED },
      });
      // Withdraw any other competing offers
      await tx.marketplaceOffer.updateMany({
        where: {
          listingId: id,
          id: { not: offerId },
          status: {
            in: [
              MarketplaceOfferStatus.PENDING,
              MarketplaceOfferStatus.COUNTERED,
            ],
          },
        },
        data: { status: MarketplaceOfferStatus.WITHDRAWN },
      });
      await tx.user.update({
        where: { id: offer.listing.sellerId },
        data: {
          cashBalance: { increment: sellerAmount },
          totalEarnings: { increment: sellerAmount },
        },
      });
      await tx.transaction.create({
        data: {
          userId: offer.buyerId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -acceptedAmount,
          points: 0,
          description: `Marketplace offer accepted — "${offer.listing.title}"`,
          reference: `marketplace_offer_${offerId}`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: offer.listing.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          amount: sellerAmount,
          points: 0,
          description: `Marketplace sale (offer) — "${offer.listing.title}"`,
          reference: `marketplace_offer_${offerId}`,
        },
      });
      return { purchase: p, offer: o };
    });

    if (!settled) {
      return NextResponse.json(
        {
          error:
            "The buyer no longer has enough balance to cover this offer, so it wasn't accepted.",
        },
        { status: 409 }
      );
    }

    await prisma.notification
      .create({
        data: {
          userId: offer.buyerId,
          type: NotificationType.SYSTEM,
          title: "Offer accepted! 🎉",
          message: `Your offer on "${offer.listing.title}" was accepted at $${acceptedAmount.toLocaleString()}.`,
          data: { listingId: id, offerId, purchaseId: settled.purchase.id },
        },
      })
      .catch(() => {
        // Delivery is best-effort; the sale itself already stands.
      });

    return NextResponse.json({
      offer: settled.offer,
      purchase: settled.purchase,
    });
  } catch (error) {
    // Concurrent double-accept / retry reuses reference `marketplace_offer_<id>`
    // → P2002 on (userId, reference). The offer was already settled once; report
    // success instead of double-settling.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ duplicate: true });
    }
    // Raised inside the settlement transaction when a competing accept sold the
    // listing first. The buyer's debit rolled back with it.
    if (error instanceof Error && error.message === "LISTING_TAKEN") {
      return NextResponse.json(
        { error: "This listing was just sold through another offer." },
        { status: 409 }
      );
    }
    console.error("Patch offer failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
