import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { toNum } from "@/lib/money";
import { CART_MAX_ITEMS } from "@/lib/marketplace-cart";

// `quantity` is still accepted for old clients but ignored: every listing is
// one digital asset, checkout always sells exactly one, so a stored quantity
// of 3 only made the cart total disagree with what checkout charged.
const addSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.cartItem.findMany({
    where: { userId: session.user.id },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          images: true,
          status: true,
          sellerId: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  type WithListing = (typeof items)[number] & {
    listing: {
      id: string;
      title: string;
      price: number;
      currency: string;
      images: string[];
      status: string;
      sellerId: string;
    };
  };
  const enriched = items as WithListing[];

  const subtotal =
    Math.round(enriched.reduce((s, i) => s + toNum(i.listing.price), 0) * 100) / 100;

  return NextResponse.json({
    items: enriched.map((i) => ({
      id: i.id,
      listingId: i.listing.id,
      title: i.listing.title,
      price: toNum(i.listing.price),
      currency: i.listing.currency,
      thumbnail: i.listing.images[0] ?? null,
      quantity: 1,
      available: i.listing.status === "ACTIVE",
      sellerId: i.listing.sellerId,
      addedAt: i.addedAt.toISOString(),
    })),
    summary: {
      itemCount: enriched.length,
      subtotal,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(req, session.user.id, async () => {
  const body = await req.json();
  const v = addSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: v.data.listingId },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Listing not available" },
      { status: 404 }
    );
  }
  if (listing.sellerId === session.user.id) {
    return NextResponse.json(
      { error: "You can't add your own listing to cart" },
      { status: 400 }
    );
  }

  const [inCart, count] = await Promise.all([
    prisma.cartItem.findUnique({
      where: {
        userId_listingId: { userId: session.user.id, listingId: v.data.listingId },
      },
      select: { id: true },
    }),
    prisma.cartItem.count({ where: { userId: session.user.id } }),
  ]);
  if (!inCart && count >= CART_MAX_ITEMS) {
    return NextResponse.json(
      { error: `Your cart is full (${CART_MAX_ITEMS} items). Check out or remove something first.` },
      { status: 400 }
    );
  }

  const item = await prisma.cartItem.upsert({
    where: {
      userId_listingId: {
        userId: session.user.id,
        listingId: v.data.listingId,
      },
    },
    create: {
      userId: session.user.id,
      listingId: v.data.listingId,
      quantity: 1,
    },
    update: {
      quantity: 1,
    },
  });

  return NextResponse.json({ success: true, item });
  });
}
