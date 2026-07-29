import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { resolvePromoPackage } from "@/lib/promotion";
import { TransactionType, TransactionStatus } from "@/generated/prisma";
import { z } from "zod";

const schema = z.object({
  packageId: z.string().min(1),
  currency: z.enum(["cash", "points"]),
});

// POST /api/marketplace/listings/:id/promote — owner pays (cash|points) to
// feature their own listing for the package's duration.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  return withIdempotency(request, userId, async () => {
    const { id } = await params;
    const v = schema.safeParse(await request.json().catch(() => ({})));
    if (!v.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const pkg = await resolvePromoPackage(v.data.packageId);
    if (!pkg) return NextResponse.json({ error: "Unknown package" }, { status: 400 });

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: { sellerId: true, status: true, featuredUntil: true, title: true },
    });
    if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (listing.sellerId !== userId) {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }
    if (listing.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active listings can be promoted." },
        { status: 400 }
      );
    }

    const isCash = v.data.currency === "cash";
    const price = isCash ? pkg.priceCash : pkg.pricePoints;
    const now = Date.now();
    const base =
      listing.featuredUntil && listing.featuredUntil.getTime() > now
        ? listing.featuredUntil.getTime()
        : now;
    const until = new Date(base + pkg.days * 86_400_000);

    try {
      await prisma.$transaction(async (tx) => {
        const deducted = isCash
          ? await tx.user.updateMany({
              where: { id: userId, cashBalance: { gte: price } },
              data: { cashBalance: { decrement: price } },
            })
          : await tx.user.updateMany({
              where: { id: userId, pointsBalance: { gte: price } },
              data: { pointsBalance: { decrement: price } },
            });
        if (deducted.count === 0) throw new Error("INSUFFICIENT");

        await tx.marketplaceListing.update({
          where: { id },
          data: { isFeatured: true, featuredUntil: until },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.PURCHASE,
            status: TransactionStatus.COMPLETED,
            amount: isCash ? -price : 0,
            points: isCash ? 0 : -price,
            description: `Promotion — ${pkg.label} · "${listing.title}"`,
            reference: `promo_marketplace_${id}_${now}`,
            metadata: { listingId: id, packageId: pkg.id, days: pkg.days, currency: v.data.currency },
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INSUFFICIENT") {
        return NextResponse.json(
          { error: `Not enough ${isCash ? "wallet balance" : "points"}.` },
          { status: 402 }
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true, featuredUntil: until.toISOString() });
  });
}
