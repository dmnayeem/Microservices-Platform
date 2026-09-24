import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
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
  getPayoutHoldConfig,
  payOrHoldSeller,
  getLicenseTiersEnabled,
  readTiers,
  getMarketplaceTaxConfig,
  computeCommissionTax,
} from "@/lib/marketplace-selling";
import { userCanFeature } from "@/lib/packages";
import { lt, sub, toNum } from "@/lib/money";

// POST /api/cart/checkout
//
// Atomically buys every ACTIVE listing in the user's cart from their wallet.
//
// One purchase per cart item — marketplace listings are unique assets, so the
// stored `quantity` is treated as 1 at checkout. The status flip + counter
// bump uses `updateMany({ where: { id, status: ACTIVE } })` per item so two
// concurrent buyers racing on the same listing can't both succeed.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  try {
    if (!(await userCanFeature(session.user.id, "marketplace"))) {
      return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
    }
    const userId = session.user.id;

    const itemsRaw = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        listing: {
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
          },
        },
      },
    });
    const cart = itemsRaw as unknown as Array<{
      id: string;
      listingId: string;
      listing: {
        id: string;
        sellerId: string;
        title: string;
        price: number;
        status: string;
        assetType: string;
        saleMode: string;
        licenseTiers: unknown;
        auctionMode: boolean;
        commissionRateBps: number | null;
      };
    }>;

    if (cart.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Pre-flight validation — fail fast with a helpful message before we hit
    // the transaction. The transactional `updateMany` guard below still
    // protects against races that happen after this check.
    const issues: string[] = [];
    for (const item of cart) {
      const l = item.listing;
      if (l.status !== MarketplaceListingStatus.ACTIVE) {
        issues.push(`"${l.title}" is ${l.status.toLowerCase()}`);
      } else if (l.sellerId === userId) {
        issues.push(`"${l.title}" is your own listing`);
      } else if (l.auctionMode) {
        issues.push(`"${l.title}" is an auction — bid instead`);
      } else if (!Number.isFinite(toNum(l.price)) || toNum(l.price) <= 0) {
        issues.push(`"${l.title}" has no valid price`);
      }
    }
    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: `${issues.length} item${issues.length > 1 ? "s" : ""} can't be checked out`,
          details: issues.join(" · "),
        },
        { status: 400 }
      );
    }

    const hold = await getPayoutHoldConfig();
    const tiersEnabled = await getLicenseTiersEnabled();
    const taxCfg = await getMarketplaceTaxConfig();

    // Commission rates (and therefore tax) are resolved before the balance is
    // checked, because the buyer has to cover price + tax, not just price.
    // No writes here, so it is safe outside the transaction.
    const itemPlans = await Promise.all(
      cart.map(async (item) => {
        const bps = await resolveCommissionBps({
          assetType: item.listing.assetType,
          perListingOverride: item.listing.commissionRateBps,
        });
        const { fee, sellerAmount } = splitPrice(toNum(item.listing.price), bps);
        const { tax, pct: taxPct } = computeCommissionTax(fee, taxCfg);
        return { item, bps, fee, sellerAmount, tax, taxPct };
      })
    );

    const goods = cart.reduce((s, i) => s + toNum(i.listing.price), 0);
    const taxTotal = Math.round(itemPlans.reduce((s, p) => s + p.tax, 0) * 100) / 100;
    const total = Math.round((goods + taxTotal) * 100) / 100;

    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { cashBalance: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (lt(buyer.cashBalance, total)) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance",
          shortBy: sub(total, buyer.cashBalance).toNumber(),
          details: `Need ${usd(total)}, have ${usd(toNum(buyer.cashBalance))}.`,
        },
        { status: 402 }
      );
    }

    // Lock ORDER matters. The loop below locks each listing and then its
    // seller's user row; taking them in cart order meant two buyers whose carts
    // contain the same two sellers in opposite order could deadlock (Postgres
    // resolves that by killing one — a failed checkout, seemingly at random).
    // Sorting gives every transaction the same global acquisition order.
    itemPlans.sort(
      (a, b) =>
        a.item.listing.sellerId.localeCompare(b.item.listing.sellerId) ||
        a.item.listing.id.localeCompare(b.item.listing.id)
    );

    const result = await prisma.$transaction(async (tx) => {
      const created: Array<{
        purchaseId: string;
        listingId: string;
        amount: number;
        sellerAmount: number;
        sellerId: string;
        title: string;
      }> = [];

      for (const plan of itemPlans) {
        const l = plan.item.listing;

        // Only a ONE_OFF listing leaves the shop when it sells; an UNLIMITED
        // one is licensed to everyone who wants it and stays ACTIVE. The
        // updateMany remains the concurrency guard either way — it matches
        // only an ACTIVE row, so something withdrawn mid-checkout still
        // rolls the whole cart back.
        const flipped = await tx.marketplaceListing.updateMany({
          where: { id: l.id, status: MarketplaceListingStatus.ACTIVE },
          data: {
            ...(l.saleMode !== "UNLIMITED"
              ? { status: MarketplaceListingStatus.SOLD }
              : {}),
            directPurchasesCount: { increment: 1 },
          },
        });
        if (flipped.count === 0) {
          throw new Error(
            `"${l.title}" was just purchased by someone else.`
          );
        }

        const p = await tx.marketplacePurchase.create({
          data: {
            listingId: l.id,
            buyerId: userId,
            amount: l.price,
            fee: plan.fee,
            sellerAmount: plan.sellerAmount,
            // The cart has no licence picker, and the listing price IS the
            // cheapest tier, so that is what the buyer just bought. Recording
            // it means a cart purchase carries the same proof of rights as one
            // made from the listing page.
            licenseTier: tiersEnabled ? (readTiers(l.licenseTiers)[0]?.id ?? null) : null,
            tax: plan.tax,
            taxPct: plan.taxPct,
            status: "COMPLETED",
          },
        });

        // Withdraw competing pending / countered offers + stray bids.
        await tx.marketplaceOffer.updateMany({
          where: {
            listingId: l.id,
            status: {
              in: [
                MarketplaceOfferStatus.PENDING,
                MarketplaceOfferStatus.COUNTERED,
              ],
            },
          },
          data: { status: MarketplaceOfferStatus.WITHDRAWN },
        });
        await tx.marketplaceBid.updateMany({
          where: {
            listingId: l.id,
            status: {
              in: [MarketplaceBidStatus.ACTIVE, MarketplaceBidStatus.OUTBID],
            },
          },
          data: { status: MarketplaceBidStatus.LOST },
        });

        // Seller credit, or a held payout when the admin has the hold on.
        const paidNow = await payOrHoldSeller(tx, {
          sellerId: l.sellerId,
          purchaseId: p.id,
          amount: toNum(plan.sellerAmount),
          hold,
        });
        // The EARNING row only makes sense once the money is actually theirs.
        // While it is held the release sweep writes its own row on payout, so
        // logging one here too would show the sale as earned twice.
        if (!paidNow.held) {
        await tx.transaction.create({
          data: {
            userId: l.sellerId,
            type: TransactionType.EARNING,
            status: TransactionStatus.COMPLETED,
            amount: plan.sellerAmount,
            points: 0,
            description: `Marketplace sale — "${l.title}"`,
            reference: `marketplace_${l.id}_${p.id}`,
            metadata: {
              listingId: l.id,
              purchaseId: p.id,
              commissionBps: plan.bps,
              platformFee: plan.fee,
              fromUserId: userId,
            },
          },
        });
        }

        created.push({
          purchaseId: p.id,
          listingId: l.id,
          amount: l.price,
          sellerAmount: plan.sellerAmount,
          sellerId: l.sellerId,
          title: l.title,
        });
      }

      // One buyer-side debit + ledger row for the whole cart.
      //
      // Compare-and-set, not a plain decrement: the affordability check earlier
      // in this handler runs OUTSIDE the transaction, so it is check-then-act.
      // Two purchases fired concurrently from different routes — this one and a
      // course enrolment, say — both passed their own check against the same
      // balance and both debited it, leaving the user negative while two sellers
      // were credited real cash.
      const paid = await tx.user.updateMany({
        where: { id: userId, cashBalance: { gte: total } },
        data: { cashBalance: { decrement: total } },
      });
      if (paid.count === 0) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -total,
          points: 0,
          description: `Cart checkout (${cart.length} listing${cart.length > 1 ? "s" : ""})`,
          // Per-occurrence by design. A second checkout of a refilled cart
          // with the same contents is a normal thing to do.
          // A deterministic key would make `Transaction @@unique([userId, reference])`
          // reject the second one, so this stays keyed on the instant it happened.
          reference: `cart_${Date.now()}_${userId}`,
          metadata: {
            listingIds: cart.map((c) => c.listing.id),
            total,
          },
        },
      });

      // Clear the cart on success.
      await tx.cartItem.deleteMany({ where: { userId } });

      return created;
    });

    // Best-effort post-commit fanout — buyer summary + per-seller sale notice
    // + audit log. Failures here don't void the purchase.
    await Promise.all([
      prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM,
          title: `Cart purchase complete 🎉`,
          message: `You bought ${result.length} listing${result.length > 1 ? "s" : ""} for $${total.toLocaleString()}.`,
          data: {
            purchaseIds: result.map((r) => r.purchaseId),
            total,
          },
        },
      }),
      ...result.map((r) =>
        prisma.notification.create({
          data: {
            userId: r.sellerId,
            type: NotificationType.SYSTEM,
            title: "You made a sale 💸",
            message: `"${r.title}" sold for $${r.amount.toLocaleString()}. You earned $${r.sellerAmount.toLocaleString()}.`,
            data: {
              listingId: r.listingId,
              purchaseId: r.purchaseId,
              amount: r.amount,
              sellerAmount: r.sellerAmount,
            },
          },
        })
      ),
      prisma.auditLog.create({
        data: {
          userId,
          action: "MARKETPLACE_CART_CHECKOUT",
          entity: "MarketplacePurchase",
          entityId: result[0]?.purchaseId ?? null,
          newData: {
            purchases: result.map((r) => ({
              purchaseId: r.purchaseId,
              listingId: r.listingId,
              amount: r.amount,
            })),
            total,
          },
        },
      }),
    ]).catch((err) => {
      console.error("Cart checkout post-commit fanout failed:", err);
    });

    return NextResponse.json({
      success: true,
      purchases: result.map((r) => ({
        id: r.purchaseId,
        listingId: r.listingId,
        quantity: 1,
      })),
      total,
    });
  } catch (error) {
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
    console.error("Cart checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
