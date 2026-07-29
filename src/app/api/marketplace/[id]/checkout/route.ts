import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError, withIdempotency } from "@/lib/idempotency";
import {
  MarketplaceListingStatus,
  MarketplaceOfferStatus,
  MarketplaceBidStatus,
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import {
  resolveCommissionBps,
  splitPrice,
} from "@/lib/marketplace-commission";
import {
  AFFILIATE_COOKIE,
  getAffiliateConfig,
  isAffiliateEligible,
  computeAffiliateCommission,
  parseAttribution,
} from "@/lib/affiliate";
import { userCanFeature } from "@/lib/packages";
import { lt, sub, toNum, toNumOrNull } from "@/lib/money";

// POST /api/marketplace/:id/checkout
//
// Direct-buy a single listing from the wallet.
//
// Atomicity note: the status check + flip-to-SOLD lives INSIDE the transaction
// via `updateMany({ where: { id, status: ACTIVE } })`. If two requests race,
// the second one updates 0 rows and we throw → its transaction rolls back.
// This is the only race-safe pattern for "buy this exact listing" on Postgres
// short of an explicit `SELECT … FOR UPDATE`, which Prisma can't easily express.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(_request, session.user.id, async () => {
  try {
    if (!(await userCanFeature(session.user.id, "marketplace"))) {
      return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
    }
    const { id } = await params;
    const userId = session.user.id;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        title: true,
        price: true,
        status: true,
        assetType: true,
        auctionMode: true,
        commissionRateBps: true,
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: `Listing is ${listing.status.toLowerCase()}, not available for purchase.` },
        { status: 400 }
      );
    }
    if (listing.auctionMode) {
      return NextResponse.json(
        { error: "Auction listings can't be direct-bought — place a bid instead." },
        { status: 400 }
      );
    }
    if (listing.sellerId === userId) {
      return NextResponse.json(
        { error: "Cannot purchase your own listing" },
        { status: 400 }
      );
    }
    const priceNum = toNum(listing.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json(
        { error: "This listing has no valid price." },
        { status: 400 }
      );
    }

    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { cashBalance: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (lt(buyer.cashBalance, listing.price)) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance",
          shortBy: sub(listing.price, buyer.cashBalance).toNumber(),
          details: `Need $${toNum(listing.price).toFixed(2)}, have $${toNum(buyer.cashBalance).toFixed(2)}.`,
        },
        { status: 402 }
      );
    }

    // Resolve commission via the same path offers + auctions use.
    const bps = await resolveCommissionBps({
      assetType: listing.assetType,
      perListingOverride: listing.commissionRateBps,
    });
    const { fee, sellerAmount } = splitPrice(priceNum, bps);

    // Affiliate attribution: if the buyer arrived via an affiliate's link and
    // the seller set a reward, the affiliate earns it OUT OF the seller's cut
    // (platform fee unchanged). Resolved before the tx; credited inside it.
    let affiliateId: string | null = null;
    let affiliateAmount = 0;
    {
      const cfg = await getAffiliateConfig();
      if (
        cfg.enabled &&
        isAffiliateEligible(listing.affiliateCommissionType, toNumOrNull(listing.affiliateCommissionValue))
      ) {
        const attr = parseAttribution(
          _request.cookies.get(AFFILIATE_COOKIE)?.value,
          "MARKETPLACE",
          id,
          cfg.cookieWindowDays,
          Date.now()
        );
        if (attr && attr.aff !== userId && attr.aff !== listing.sellerId) {
          const aff = await prisma.user.findUnique({
            where: { id: attr.aff },
            select: { id: true, affiliateJoinedAt: true },
          });
          if (aff?.affiliateJoinedAt) {
            affiliateAmount = computeAffiliateCommission(
              listing.affiliateCommissionType,
              toNumOrNull(listing.affiliateCommissionValue),
              priceNum,
              sellerAmount
            );
            if (affiliateAmount > 0) affiliateId = aff.id;
          }
        }
      }
    }
    const sellerNet = affiliateId
      ? Math.round((sellerAmount - affiliateAmount) * 100) / 100
      : sellerAmount;

    const purchase = await prisma.$transaction(async (tx) => {
      // Atomic status flip — bails out (count: 0) if a concurrent request
      // already took the listing.
      const flipped = await tx.marketplaceListing.updateMany({
        where: { id, status: MarketplaceListingStatus.ACTIVE },
        data: {
          status: MarketplaceListingStatus.SOLD,
          directPurchasesCount: { increment: 1 },
        },
      });
      if (flipped.count === 0) {
        throw new Error("Listing was just purchased by someone else.");
      }

      const p = await tx.marketplacePurchase.create({
        data: {
          listingId: id,
          buyerId: userId,
          amount: listing.price,
          fee,
          sellerAmount: sellerNet,
          status: "COMPLETED",
        },
      });

      // Withdraw any competing pending / countered offers — the listing is gone.
      await tx.marketplaceOffer.updateMany({
        where: {
          listingId: id,
          status: {
            in: [
              MarketplaceOfferStatus.PENDING,
              MarketplaceOfferStatus.COUNTERED,
            ],
          },
        },
        data: { status: MarketplaceOfferStatus.WITHDRAWN },
      });

      // Defensive: cancel any stray active bids (a properly-typed listing won't
      // have any since auctionMode is false, but rows could exist from a past
      // mode change).
      await tx.marketplaceBid.updateMany({
        where: {
          listingId: id,
          status: {
            in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID],
          },
        },
        data: { status: MarketplaceBidStatus.LOST },
      });

      // Wallet movements
      await tx.user.update({
        where: { id: userId },
        data: { cashBalance: { decrement: listing.price } },
      });
      await tx.user.update({
        where: { id: listing.sellerId },
        data: {
          cashBalance: { increment: sellerNet },
          totalEarnings: { increment: sellerNet },
        },
      });

      // Affiliate payout (from the seller's cut) — credit + ledger, deduped by
      // the (sourceType, orderRef) unique on AffiliateCommission.
      if (affiliateId && affiliateAmount > 0) {
        await tx.user.update({
          where: { id: affiliateId },
          data: {
            cashBalance: { increment: affiliateAmount },
            totalEarnings: { increment: affiliateAmount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: affiliateId,
            type: TransactionType.AFFILIATE_COMMISSION,
            status: TransactionStatus.COMPLETED,
            amount: affiliateAmount,
            points: 0,
            description: `Affiliate commission — "${listing.title}"`,
            reference: `affiliate_marketplace_${p.id}`,
            metadata: {
              listingId: id,
              purchaseId: p.id,
              saleAmount: priceNum,
              fromBuyerId: userId,
            },
          },
        });
        await tx.affiliateCommission.create({
          data: {
            affiliateUserId: affiliateId,
            sourceType: "MARKETPLACE",
            sourceId: id,
            orderRef: p.id,
            buyerId: userId,
            saleAmount: listing.price,
            commissionAmount: affiliateAmount,
          },
        });
      }

      // Ledger
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -listing.price,
          points: 0,
          description: `Marketplace — "${listing.title}"`,
          reference: `marketplace_${id}_${p.id}`,
          metadata: {
            listingId: id,
            purchaseId: p.id,
            commissionBps: bps,
            platformFee: fee,
            sellerAmount,
          },
        },
      });
      await tx.transaction.create({
        data: {
          userId: listing.sellerId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          amount: sellerNet,
          points: 0,
          description: `Marketplace sale — "${listing.title}"`,
          reference: `marketplace_${id}_${p.id}`,
          metadata: {
            listingId: id,
            purchaseId: p.id,
            commissionBps: bps,
            platformFee: fee,
            fromUserId: userId,
            affiliateUserId: affiliateId,
            affiliateAmount,
          },
        },
      });

      return p;
    });

    // Best-effort post-commit fanout (notifications + audit). If any of these
    // fail we don't want to roll the purchase back — log + continue.
    await Promise.all([
      prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM,
          title: "Purchase complete 🎉",
          message: `You bought "${listing.title}" for $${listing.price.toLocaleString()}.`,
          data: { listingId: id, purchaseId: purchase.id, amount: listing.price },
        },
      }),
      prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: NotificationType.SYSTEM,
          title: "You made a sale 💸",
          message: `"${listing.title}" sold for $${listing.price.toLocaleString()}. You earned $${sellerNet.toLocaleString()}${affiliateId ? ` (after $${affiliateAmount.toLocaleString()} affiliate reward)` : ""}.`,
          data: {
            listingId: id,
            purchaseId: purchase.id,
            amount: listing.price,
            sellerAmount: sellerNet,
            affiliateAmount,
          },
        },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: "MARKETPLACE_PURCHASE",
          entity: "MarketplacePurchase",
          entityId: purchase.id,
          newData: {
            listingId: id,
            amount: listing.price,
            fee,
            sellerAmount,
            commissionBps: bps,
          },
        },
      }),
    ]).catch((err) => {
      console.error("Marketplace purchase post-commit fanout failed:", err);
    });

    return NextResponse.json({
      success: true,
      purchaseId: purchase.id,
      amount: toNum(listing.price),
      fee,
      sellerAmount: sellerNet,
      affiliateAmount,
      checkoutUrl: null,
    });
  } catch (error) {
    // Retry/double-submit reuses reference `marketplace_<id>_<purchaseId>` →
    // P2002; the purchase already went through, so report success not a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ success: true, duplicate: true });
    }
    // Race-loss messages should surface to the user, not as a 500.
    if (
      error instanceof Error &&
      /just purchased by someone else/i.test(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Marketplace checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
