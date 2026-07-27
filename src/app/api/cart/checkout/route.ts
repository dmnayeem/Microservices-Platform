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

    const total = cart.reduce((s, i) => s + toNum(i.listing.price), 0);

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
          details: `Need $${total.toFixed(2)}, have $${toNum(buyer.cashBalance).toFixed(2)}.`,
        },
        { status: 402 }
      );
    }

    // Pre-resolve commission rates outside the transaction (no writes; safe).
    const itemPlans = await Promise.all(
      cart.map(async (item) => {
        const bps = await resolveCommissionBps({
          assetType: item.listing.assetType,
          perListingOverride: item.listing.commissionRateBps,
        });
        const { fee, sellerAmount } = splitPrice(toNum(item.listing.price), bps);
        return { item, bps, fee, sellerAmount };
      })
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

        // Atomic status flip — if a concurrent purchase already took it,
        // bail out and roll back everything.
        const flipped = await tx.marketplaceListing.updateMany({
          where: { id: l.id, status: MarketplaceListingStatus.ACTIVE },
          data: {
            status: MarketplaceListingStatus.SOLD,
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

        // Seller credit + earnings counter + EARNING ledger row
        await tx.user.update({
          where: { id: l.sellerId },
          data: {
            cashBalance: { increment: plan.sellerAmount },
            totalEarnings: { increment: plan.sellerAmount },
          },
        });
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
      await tx.user.update({
        where: { id: userId },
        data: { cashBalance: { decrement: total } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -total,
          points: 0,
          description: `Cart checkout (${cart.length} listing${cart.length > 1 ? "s" : ""})`,
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
    console.error("Cart checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
