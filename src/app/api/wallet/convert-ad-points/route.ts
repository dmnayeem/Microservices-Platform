import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { convertEarnToAdPoints, getAdPointsPerUsd } from "@/lib/ad-wallet";
import { getWithdrawalConfig } from "@/lib/withdrawal";
import { getPointsPerUsd } from "@/lib/economy";
import { requireActiveUser } from "@/lib/require-active";
import { prisma } from "@/lib/prisma";

/**
 * Earn Points → Ad Points (owner, 2026-10-16). Allowed while the member's Earn
 * Points are worth at least THEIR minimum withdrawal — the same effective
 * minimum the withdrawal route enforces (global `min_withdrawal` raised by the
 * plan's `minWithdrawal`, see getWithdrawalConfig). The conversion itself
 * (CAS debit + both ledger rows in one transaction) is convertEarnToAdPoints.
 */

// GET — the rate preview for the convert form.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [cfg, ppu, rate, me] = await Promise.all([
    getWithdrawalConfig(session.user.id),
    getPointsPerUsd(),
    getAdPointsPerUsd(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { pointsBalance: true, adPointsBalance: true } }),
  ]);
  const earnPoints = me?.pointsBalance ?? 0;
  return NextResponse.json({
    earnPoints,
    adPoints: me?.adPointsBalance ?? 0,
    pointsPerUsd: ppu,
    adPointsPerUsd: rate,
    minWithdrawalUsd: cfg.min,
    eligible: earnPoints / ppu >= cfg.min,
  });
}

// POST { points } — convert that many Earn Points.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  return withIdempotency(request, userId, async () => {
    const active = await requireActiveUser(userId);
    if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });

    const body = await request.json().catch(() => ({}));
    const points = Number(body?.points);
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json({ error: "Enter how many points to convert." }, { status: 400 });
    }
    const cfg = await getWithdrawalConfig(userId);
    const r = await convertEarnToAdPoints(userId, Math.floor(points), cfg.min);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      earnPoints: r.earnPoints,
      adPoints: r.adPoints,
      message: `Converted ${r.earnPoints.toLocaleString()} Earn Points to ${r.adPoints.toLocaleString()} Ad Points.`,
    });
  });
}
