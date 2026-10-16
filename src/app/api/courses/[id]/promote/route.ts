import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { resolvePromoPackage } from "@/lib/promotion";
import { z } from "zod";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";
import { PlatformPayError, chargePlatform, getSpendBalances, insufficientError } from "@/lib/platform-pay";
import { defaultPaySourceForQuote, quotePlatformPrice } from "@/lib/pay-source";

const schema = z.object({
  packageId: z.string().min(1),
  // Ad Points or Ad Fund (owner, 2026-10-16) — never Cash or Earn Points.
  // Omitted = whichever covers the price.
  paySource: z.enum(["AD_POINTS", "AD_FUND"]).optional(),
});

// POST /api/courses/:id/promote — tutor pays (Ad Points | Ad Fund) to feature
// their own published course for the package's duration.
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

    const course = await prisma.course.findUnique({
      where: { id },
      select: { tutorId: true, status: true, featuredUntil: true, title: true },
    });
    if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (course.tutorId !== userId) {
      return NextResponse.json({ error: "Not your course" }, { status: 403 });
    }
    if (course.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Only published courses can be promoted." },
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
      const e = await insufficientError(userId, quote.adPoints, null, `/courses/${id}`, rate);
      return NextResponse.json({ error: e.userMessage, addFund: e.addFund }, { status: 402 });
    }
    const now = Date.now();
    const base =
      course.featuredUntil && course.featuredUntil.getTime() > now
        ? course.featuredUntil.getTime()
        : now;
    const until = new Date(base + pkg.days * 86_400_000);

    try {
      await prisma.$transaction(async (tx) => {
        // CAS debit + its ledger row (adpts_/adfund_promo_course_*) first;
        // a short balance throws and rolls the feature back.
        await chargePlatform(tx, {
          userId,
          quote,
          from,
          description: `Promotion — ${pkg.label} · "${course.title}"`,
          reference: `promo_course_${id}_${now}`,
          purpose: "promotion",
          metadata: { courseId: id, packageId: pkg.id, days: pkg.days },
          returnTo: `/courses/${id}`,
        });
        await tx.course.update({
          where: { id },
          data: { isFeatured: true, featuredUntil: until },
        });
      });
    } catch (err) {
      if (err instanceof PlatformPayError) {
        return NextResponse.json({ error: err.userMessage, addFund: err.addFund }, { status: 402 });
      }
      throw err;
    }

    return NextResponse.json({ success: true, featuredUntil: until.toISOString() });
  });
}
