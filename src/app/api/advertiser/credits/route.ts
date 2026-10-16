import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { userCanFeature } from "@/lib/packages";
import { buyAdCredits, getAdCreditSummary } from "@/lib/ad-credits";
import { withIdempotency } from "@/lib/idempotency";
import { z } from "zod";

async function gate() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return { error: NextResponse.json({ error: "The advertiser is disabled for your plan" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

// GET /api/advertiser/credits — ad-credit balance + recent ledger.
export async function GET() {
  const g = await gate();
  if (g.error) return g.error;
  return NextResponse.json(await getAdCreditSummary(g.userId));
}

const schema = z.object({
  amountUsd: z.number().min(5).max(100000),
  // Ad Fund (dollars) or Ad Points (at the rate) — owner, 2026-10-16.
  paySource: z.enum(["AD_POINTS", "AD_FUND"]),
});

// POST /api/advertiser/credits — buy ad credit with Ad Fund or Ad Points.
// Idempotency-wrapped: this moves money, so a retried or double-fired request
// must not charge the wallet twice.
export async function POST(request: NextRequest) {
  const g = await gate();
  if (g.error) return g.error;
  const userId = g.userId;
  return withIdempotency(request, userId, async () => {
    const v = schema.safeParse(await request.json().catch(() => ({})));
    if (!v.success) {
      return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const r = await buyAdCredits({
      userId,
      amountUsd: v.data.amountUsd,
      from: v.data.paySource,
    });
    if (!r.ok) return NextResponse.json({ error: r.error, addFund: r.addFund }, { status: r.status ?? 400 });
    return NextResponse.json({ adCreditBalance: r.adCreditBalance });
  });
}
