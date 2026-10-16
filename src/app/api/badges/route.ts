import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";
import { toNum } from "@/lib/money";
import { getBadgeConfig, getBadgeState } from "@/lib/badges-server";

// GET /api/badges — the shop's prices and this member's badge + styles.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [config, state, wallet, adPointsPerUsd] = await Promise.all([
    getBadgeConfig(),
    getBadgeState(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { adFundBalance: true, adPointsBalance: true, name: true } }),
    getAdPointsPerUsd(),
  ]);
  return NextResponse.json({
    config,
    state,
    // The badge is paid from Ad Fund (dollars) or Ad Points (at the rate).
    wallet: { adFund: toNum(wallet?.adFundBalance ?? 0), adPoints: wallet?.adPointsBalance ?? 0, adPointsPerUsd },
    name: wallet?.name ?? "",
  });
}
