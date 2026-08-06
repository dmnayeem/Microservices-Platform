import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { userCanFeature } from "@/lib/packages";
import { buyAdCredits, getAdCreditSummary } from "@/lib/ad-credits";
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
  currency: z.enum(["cash", "points"]),
});

// POST /api/advertiser/credits — buy ad credit with wallet cash or points.
export async function POST(request: NextRequest) {
  const g = await gate();
  if (g.error) return g.error;
  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const r = await buyAdCredits({
    userId: g.userId,
    amountUsd: v.data.amountUsd,
    currency: v.data.currency,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ adCreditBalance: r.adCreditBalance });
}
