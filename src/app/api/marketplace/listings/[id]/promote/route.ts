import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { resolvePromoPackage } from "@/lib/promotion";
import { z } from "zod";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";
import { PlatformPayError, getSpendBalances, insufficientError } from "@/lib/platform-pay";
import { requestPromotion } from "@/lib/promotion-review";
import { defaultPaySourceForQuote, quotePlatformPrice } from "@/lib/pay-source";

const schema = z.object({
  packageId: z.string().min(1),
  // Ad Points or Ad Fund (owner, 2026-10-16) — never Cash or Earn Points.
  // Omitted = whichever covers the price.
  paySource: z.enum(["AD_POINTS", "AD_FUND"]).optional(),
});

// POST /api/marketplace/listings/:id/promote — owner pays (Ad Points | Ad Fund)
// to feature their own listing. Paid now, featured once an admin approves.
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
      select: { sellerId: true, status: true, title: true },
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

    // Points price → Ad Points; dollar price → Ad Fund dollars (or Ad Points
    // at the rate when only a dollar price is set). A package with no price
    // at all can't be bought — never featured for free.
    const rate = await getAdPointsPerUsd();
    const quote = quotePlatformPrice({ points: pkg.pricePoints, usd: pkg.priceCash }, rate);
    if (!(quote.adPoints > 0)) {
      return NextResponse.json({ error: "This package has no price set." }, { status: 400 });
    }
    const from = v.data.paySource ?? defaultPaySourceForQuote(quote, await getSpendBalances(userId));
    if (!from) {
      const e = await insufficientError(userId, quote.adPoints, null, `/marketplace/${id}`, rate);
      return NextResponse.json({ error: e.userMessage, addFund: e.addFund }, { status: 402 });
    }
    // A PENDING request already paid for — don't take a second payment for
    // the same item while the first one is still waiting.
    const waiting = await prisma.promotionRequest.count({
      where: { listingId: id, status: "PENDING" },
    });
    if (waiting > 0) {
      return NextResponse.json(
        { error: "This listing already has a promotion waiting for review." },
        { status: 409 }
      );
    }

    // Paid now; featured only when an admin approves (the clock starts then).
    // See src/lib/promotion-review.ts.
    let result;
    try {
      result = await requestPromotion({
        kind: "LISTING",
        itemId: id,
        itemTitle: listing.title,
        userId,
        pkg,
        quote,
        from,
        returnTo: `/marketplace/${id}`,
      });
    } catch (err) {
      if (err instanceof PlatformPayError) {
        return NextResponse.json({ error: err.userMessage, addFund: err.addFund }, { status: 402 });
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      requestId: result.id,
      status: result.status,
      featuredUntil: result.featuredUntil?.toISOString() ?? null,
    });
  });
}
