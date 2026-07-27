import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  MarketplaceListingStatus,
  MarketplaceOfferStatus,
  NotificationType,
} from "@/generated/prisma";
import { z } from "zod";
import { toNum, toNumOrNull } from "@/lib/money";

// GET /api/marketplace/listings/:id/offers
// - Seller (listing owner): sees all PENDING + COUNTERED offers
// - Buyer: sees only their own offers
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: { sellerId: true },
    });
    if (!listing)
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const isOwner = listing.sellerId === session.user.id;
    const offersRaw = await prisma.marketplaceOffer.findMany({
      where: {
        listingId: id,
        ...(isOwner ? {} : { buyerId: session.user.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        buyer: {
          select: { id: true, name: true, username: true, avatar: true },
        },
      },
    });
    const offers = offersRaw as unknown as Array<{
      id: string;
      amount: number;
      message: string | null;
      status: string;
      counterAmount: number | null;
      counterMessage: string | null;
      createdAt: Date;
      buyerId: string;
      buyer: {
        id: string;
        name: string | null;
        username: string | null;
        avatar: string | null;
      };
    }>;

    return NextResponse.json({
      offers: offers.map((o) => ({
        id: o.id,
        amount: toNum(o.amount),
        message: o.message,
        status: o.status,
        counterAmount: toNumOrNull(o.counterAmount),
        counterMessage: o.counterMessage,
        createdAt: o.createdAt,
        isOwnOffer: o.buyerId === session.user.id,
        buyer: {
          id: o.buyer.id,
          name: o.buyer.name ?? o.buyer.username ?? "Anonymous",
          avatar: o.buyer.avatar,
        },
      })),
      isOwner,
    });
  } catch (error) {
    console.error("List offers failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

const makeOfferSchema = z.object({
  amount: z.number().positive(),
  message: z.string().max(500).optional(),
});

// POST /api/marketplace/listings/:id/offers — buyer makes an offer
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(req, session.user.id, async () => {
  try {
    const { id } = await params;
    const body = await req.json();
    const v = makeOfferSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const { amount, message } = v.data;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
        title: true,
      },
    });
    if (!listing)
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (listing.sellerId === session.user.id) {
      return NextResponse.json(
        { error: "You can't make an offer on your own listing" },
        { status: 400 }
      );
    }
    if (listing.status !== MarketplaceListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This listing is no longer active" },
        { status: 400 }
      );
    }

    // Withdraw any earlier PENDING / COUNTERED offer from the same buyer first
    await prisma.marketplaceOffer.updateMany({
      where: {
        listingId: id,
        buyerId: session.user.id,
        status: {
          in: [
            MarketplaceOfferStatus.PENDING,
            MarketplaceOfferStatus.COUNTERED,
          ],
        },
      },
      data: { status: MarketplaceOfferStatus.WITHDRAWN },
    });

    const offer = await prisma.marketplaceOffer.create({
      data: {
        listingId: id,
        buyerId: session.user.id,
        amount,
        message: message ?? null,
        status: MarketplaceOfferStatus.PENDING,
      },
    });

    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: NotificationType.SYSTEM,
        title: "New offer on your listing",
        message: `Offer of $${amount.toLocaleString()} on "${listing.title}".`,
        data: { listingId: id, offerId: offer.id, amount },
      },
    });

    return NextResponse.json({ offer });
  } catch (error) {
    console.error("Make offer failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}
