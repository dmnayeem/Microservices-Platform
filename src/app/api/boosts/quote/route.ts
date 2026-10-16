import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { getBoostPricing } from "@/lib/boost/core";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";

// GET /api/boosts/quote — everything the boost composer needs to price a boost:
// the admin's prices, both spend balances and the Ad Points ↔ USD rate.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const [allowed, pricing, rate, me] = await Promise.all([
    userCanFeature(userId, "boost"),
    getBoostPricing(),
    getAdPointsPerUsd(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { adPointsBalance: true, adFundBalance: true, country: true },
    }),
  ]);
  if (!allowed) {
    return NextResponse.json({ error: "Post boosting isn't enabled for your account." }, { status: 403 });
  }
  return NextResponse.json({
    pricing,
    rate,
    adPoints: me?.adPointsBalance ?? 0,
    adFundUsd: Number(me?.adFundBalance ?? 0),
    country: me?.country ?? null,
  });
}
