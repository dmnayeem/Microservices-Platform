import { usd } from "@/lib/utils";
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
import { D, lt, sub, toNum, toNumOrNull } from "@/lib/money";
import { requiresDeliverable } from "@/lib/marketplace-categories";
import {
  getLicenseTiersEnabled,
  readTiers,
  resolveTierPrice,
  getPayoutHoldConfig,
  payOrHoldSeller,
  getMarketplaceTaxConfig,
  computeCommissionTax,
} from "@/lib/marketplace-selling";

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
        saleMode: true,
        licenseTiers: true,
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

    // An UNLIMITED listing can be licensed by any number of buyers, but the
    // same buyer paying twice for the same file gets nothing for the second
    // payment — they already hold a permanent download. Only guarded for
    // listings that hand over a file: ordering the same SERVICE again is a
    // perfectly normal thing to want.
    if (listing.saleMode === "UNLIMITED" && requiresDeliverable(listing.assetType)) {
      const owned = await prisma.marketplacePurchase.findFirst({
        where: { listingId: id, buyerId: userId, status: "COMPLETED" },
        select: { id: true },
      });
      if (owned) {
        return NextResponse.json(
          {
            error:
              "You already own this — download it again from Orders, at no extra cost.",
            alreadyOwned: true,
          },
          { status: 409 }
        );
      }
    }
    const basePrice = toNum(listing.price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return NextResponse.json(
        { error: "This listing has no valid price." },
        { status: 400 }
      );
    }

    // Which licence the buyer picked, and therefore what they pay. With the
    // feature off, or on a listing with no tiers, this is simply the listing
    // price — so turning the switch off cannot strand a listing at a price
    // nobody is able to pay.
    const body = (await _request.json().catch(() => ({}))) as { tier?: string };
    const tiersEnabled = await getLicenseTiersEnabled();
    const hold = await getPayoutHoldConfig();
    const taxCfg = await getMarketplaceTaxConfig();
    const tiers = readTiers(listing.licenseTiers);
    const choice = resolveTierPrice(basePrice, tiers, body?.tier, tiersEnabled);
    if (!choice.ok) {
      return NextResponse.json({ error: choice.error }, { status: 400 });
    }
    const priceNum = choice.price;

    // Commission and tax are resolved BEFORE the affordability check, because
    // the buyer has to be able to cover the total, not just the price. Doing
    // it the other way round let someone through the check and then failed
    // them inside the transaction.
    const bps = await resolveCommissionBps({
      assetType: listing.assetType,
      perListingOverride: listing.commissionRateBps,
    });
    const { fee, sellerAmount } = splitPrice(priceNum, bps);
    // Tax sits on the commission, which is the service the platform sells;
    // the goods are the seller's own affair. Added on top of the price.
    const { tax, pct: taxPct } = computeCommissionTax(fee, taxCfg);
    const totalNum = Math.round((priceNum + tax) * 100) / 100;
    // Every buyer-side money movement uses this; the seller is paid from
    // `sellerAmount`, which the tax never touches.
    const charge = D(totalNum);

    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { cashBalance: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (lt(buyer.cashBalance, charge)) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance",
          shortBy: sub(charge, buyer.cashBalance).toNumber(),
          details: `Need ${usd(totalNum)}, have ${usd(toNum(buyer.cashBalance))}.`,
        },
        { status: 402 }
      );
    }

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
      // Only a ONE_OFF listing leaves the shop when it sells. An UNLIMITED
      // one — a stock photo, an ebook, a template — is licensed to every
      // buyer who wants it, so it stays ACTIVE and only its counter moves.
      // Flipping those to SOLD removed a $5 photo from the shop after a
      // single sale, which is the opposite of how licensing a file works.
      //
      // The updateMany is still the concurrency guard in both cases: it
      // matches only an ACTIVE row, so a listing sold or withdrawn a
      // moment ago yields count 0 rather than a second sale.
      const oneOff = listing.saleMode !== "UNLIMITED";
      const flipped = await tx.marketplaceListing.updateMany({
        where: { id, status: MarketplaceListingStatus.ACTIVE },
        data: {
          ...(oneOff ? { status: MarketplaceListingStatus.SOLD } : {}),
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
          amount: charge,
          fee,
          sellerAmount: sellerNet,
          licenseTier: choice.tier?.id ?? null,
          // Stored beside the fee, never folded into it: the fee is income,
          // this is money held for a tax authority.
          tax,
          taxPct,
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

      // Wallet movements — the buyer debit is a compare-and-set, because the
      // affordability check earlier in this handler runs outside the
      // transaction. The listing-status flip guards the same listing being sold
      // twice; it does nothing to guard the wallet against a second purchase on
      // a different listing at the same moment.
      const paid = await tx.user.updateMany({
        where: { id: userId, cashBalance: { gte: charge } },
        data: { cashBalance: { decrement: charge } },
      });
      if (paid.count === 0) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      // Pay the seller now, or hold it. With the hold off this is the exact
      // update it replaces; with it on the money waits in a payout row, so a
      // refund inside the window reverses an untouched row instead of clawing
      // back a balance the seller may already have withdrawn.
      await payOrHoldSeller(tx, {
        sellerId: listing.sellerId,
        purchaseId: p.id,
        amount: sellerNet,
        hold,
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
            saleAmount: charge,
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
          amount: charge.negated(),
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
          message: `You bought "${listing.title}" for $${priceNum.toLocaleString()}.`,
          data: { listingId: id, purchaseId: purchase.id, amount: charge },
        },
      }),
      prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: NotificationType.SYSTEM,
          title: "You made a sale 💸",
          message: `"${listing.title}" sold for $${priceNum.toLocaleString()}. You earned $${sellerNet.toLocaleString()}${affiliateId ? ` (after $${affiliateAmount.toLocaleString()} affiliate reward)` : ""}.`,
          data: {
            listingId: id,
            purchaseId: purchase.id,
            amount: charge,
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
            amount: charge,
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
      amount: priceNum,
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
    // The debit compare-and-set matched nothing — the balance was spent between
    // the check above and the transaction. Nothing was purchased or charged.
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        {
          error:
            "Your balance changed while this was going through, so nothing was charged. Check your wallet and try again.",
        },
        { status: 402 }
      );
    }
    console.error("Marketplace checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
