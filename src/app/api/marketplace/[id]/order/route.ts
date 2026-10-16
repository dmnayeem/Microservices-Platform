import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertPageVisible } from "@/lib/page-visibility-server";
import { withIdempotency } from "@/lib/idempotency";
import { userCanFeature } from "@/lib/packages";
import { AFFILIATE_COOKIE } from "@/lib/affiliate";
import { placeServiceOrder } from "@/lib/service-order";
import { parseShopSource } from "@/lib/pay-source";

const schema = z.object({
  tier: z.string().max(32).nullable().optional(),
  answers: z.record(z.string(), z.string().max(4000)).optional(),
  // Cash (default) or Ad Fund — anything else falls back to Cash.
  paySource: z.unknown().optional(),
});

// POST /api/marketplace/:id/order — order a SERVICE. Always escrow: creates
// and funds a MarketplaceDeal for the chosen package with the buyer's answers
// to the seller's order questions. Products keep /checkout (instant).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const pageHidden = await assertPageVisible(userId, "/services");
  if (pageHidden) return pageHidden;

  return withIdempotency(request, userId, async () => {
    if (!(await userCanFeature(userId, "deals"))) {
      return NextResponse.json(
        {
          error: "Escrow orders aren't unlocked for your account yet.",
          applyHref: "/apply?type=DEALS",
        },
        { status: 403 }
      );
    }
    if (!(await userCanFeature(userId, "marketplace"))) {
      return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
    }
    const v = schema.safeParse(await request.json().catch(() => ({})));
    if (!v.success) {
      return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { id } = await params;
    const r = await placeServiceOrder({
      listingId: id,
      buyerId: userId,
      tierId: v.data.tier ?? null,
      answers: v.data.answers ?? {},
      affiliateCookie: request.cookies.get(AFFILIATE_COOKIE)?.value,
      paySource: parseShopSource(v.data.paySource),
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, threadId: r.threadId, shortBy: r.shortBy, addFund: r.addFund },
        { status: r.status }
      );
    }
    return NextResponse.json({ success: true, dealId: r.dealId, threadId: r.threadId });
  });
}
