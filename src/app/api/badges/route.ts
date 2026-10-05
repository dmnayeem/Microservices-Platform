import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { getBadgeConfig, getBadgeState } from "@/lib/badges-server";

// GET /api/badges — the shop's prices and this member's badge + styles.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [config, state, wallet, pointsPerUsd] = await Promise.all([
    getBadgeConfig(),
    getBadgeState(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { cashBalance: true, pointsBalance: true, name: true } }),
    getPointsPerUsd(),
  ]);
  return NextResponse.json({
    config,
    state,
    wallet: { cash: Number(wallet?.cashBalance ?? 0), points: wallet?.pointsBalance ?? 0, pointsPerUsd },
    name: wallet?.name ?? "",
  });
}
