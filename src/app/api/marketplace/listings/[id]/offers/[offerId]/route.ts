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

    const [purchase, updatedOffer] = await prisma.$transaction([
      prisma.marketplacePurchase.create({
        data: {
          listingId: id,
          buyerId: offer.buyerId,
          amount: acceptedAmount,
          fee,
          sellerAmount,
          status: "COMPLETED",
        },
      }),
      prisma.marketplaceOffer.update({
        where: { id: offerId },
        data: { status: MarketplaceOfferStatus.ACCEPTED },
      }),
      // Withdraw any other competing offers
      prisma.marketplaceOffer.updateMany({
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
      }),
      prisma.marketplaceListing.update({
        where: { id },
        data: {
          status: MarketplaceListingStatus.SOLD,
          directPurchasesCount: { increment: 1 },
        },
      }),
      // Settle balances — seller credit + buyer debit + ledger rows
      prisma.user.update({
        where: { id: offer.buyerId },
        data: {
          cashBalance: { decrement: acceptedAmount },
        },
      }),
      prisma.user.update({
        where: { id: offer.listing.sellerId },
        data: {
          cashBalance: { increment: sellerAmount },
          totalEarnings: { increment: sellerAmount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: offer.buyerId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -acceptedAmount,
          points: 0,
          description: `Marketplace offer accepted — "${offer.listing.title}"`,
          reference: `marketplace_offer_${offerId}`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: offer.listing.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          amount: sellerAmount,
          points: 0,
          description: `Marketplace sale (offer) — "${offer.listing.title}"`,
          reference: `marketplace_offer_${offerId}`,
        },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: NotificationType.SYSTEM,
        title: "Offer accepted! 🎉",
        message: `Your offer on "${offer.listing.title}" was accepted at $${acceptedAmount.toLocaleString()}.`,
        data: { listingId: id, offerId, purchaseId: purchase.id },
      },
    });

    return NextResponse.json({ offer: updatedOffer, purchase });
  } catch (error) {
    // Concurrent double-accept / retry reuses reference `marketplace_offer_<id>`
    // → P2002 on (userId, reference). The offer was already settled once; report
    // success instead of double-settling.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ duplicate: true });
    }
    console.error("Patch offer failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
