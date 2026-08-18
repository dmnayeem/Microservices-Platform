import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { userCanFeature } from "@/lib/packages";

// Duration-based pricing (points) — longer boost costs more.
const BOOST_PRICING: Record<number, number> = { 1: 30, 7: 100, 30: 300 };
const BOOST_DAYS: Record<number, boolean> = { 1: true, 7: true, 30: true };

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await _req.json().catch(() => ({}))) as { days?: number };
  const days = BOOST_DAYS[Number(body.days)] ? Number(body.days) : 7;
  const cost = BOOST_PRICING[days] ?? 100;

  return withIdempotency(_req, session.user.id, async () => {
  const userId = session.user.id;
  const { id } = await params;

  // Post boost is an admin-granted capability — not open to everyone.
  if (!(await userCanFeature(userId, "boost"))) {
    return NextResponse.json(
      { error: "Post boosting isn't enabled for your account." },
      { status: 403 }
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, userId: true, boostedUntil: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.userId !== userId) {
    return NextResponse.json(
      { error: "You can only boost your own posts" },
      { status: 403 }
    );
  }
  const now = new Date();
  if (post.boostedUntil && post.boostedUntil > now) {
    return NextResponse.json(
      { error: "This post is already boosted" },
      { status: 400 }
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointsBalance: true },
  });
  if (!me || me.pointsBalance < cost) {
    return NextResponse.json(
      { error: `Insufficient points. ${cost} pts required.` },
      { status: 400 }
    );
  }

  const boostedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const pointsPerUsd = await getPointsPerUsd();
  // Atomic + no-overspend: CAS on balance AND on the boost being inactive so
  // concurrent boosts (double-click) can't double-charge or double-extend.
  try {
    await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: userId, pointsBalance: { gte: cost } },
        data: { pointsBalance: { decrement: cost } },
      });
      if (paid.count === 0) throw new Error("INSUFFICIENT");

      const boosted = await tx.post.updateMany({
        where: {
          id,
          OR: [{ boostedUntil: null }, { boostedUntil: { lt: now } }],
        },
        data: { boostedUntil },
      });
      if (boosted.count === 0) throw new Error("ALREADY_BOOSTED");

      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          points: -cost,
          amount: cost / pointsPerUsd,
          description: `Boosted social post (${days}d)`,
          reference: `boost_${id}_${now.getTime()}`,
          metadata: { postId: id, days },
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INSUFFICIENT") {
      return NextResponse.json(
        { error: `Insufficient points. ${cost} pts required.` },
        { status: 400 }
      );
    }
    if (msg === "ALREADY_BOOSTED") {
      return NextResponse.json({ error: "This post is already boosted" }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({
    success: true,
    cost: cost,
    boostedUntil: boostedUntil.toISOString(),
  });
  });
}
