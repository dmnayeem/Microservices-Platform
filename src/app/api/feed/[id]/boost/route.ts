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

const BOOST_COST_POINTS = 100;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    select: { id: true, userId: true, isPinned: true },
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
  if (post.isPinned) {
    return NextResponse.json(
      { error: "This post is already boosted" },
      { status: 400 }
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointsBalance: true },
  });
  if (!me || me.pointsBalance < BOOST_COST_POINTS) {
    return NextResponse.json(
      { error: `Insufficient points. ${BOOST_COST_POINTS} pts required.` },
      { status: 400 }
    );
  }

  const pointsPerUsd = await getPointsPerUsd();
  // Atomic + no-overspend: CAS on balance AND on `isPinned:false` so concurrent
  // boosts (double-click / two posts) can't double-charge or go negative.
  try {
    await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: userId, pointsBalance: { gte: BOOST_COST_POINTS } },
        data: { pointsBalance: { decrement: BOOST_COST_POINTS } },
      });
      if (paid.count === 0) throw new Error("INSUFFICIENT");

      const pinned = await tx.post.updateMany({
        where: { id, isPinned: false },
        data: { isPinned: true },
      });
      if (pinned.count === 0) throw new Error("ALREADY_BOOSTED");

      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          points: -BOOST_COST_POINTS,
          amount: BOOST_COST_POINTS / pointsPerUsd,
          description: "Boosted social post",
          reference: `boost_${id}_${Date.now()}`,
          metadata: { postId: id },
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INSUFFICIENT") {
      return NextResponse.json(
        { error: `Insufficient points. ${BOOST_COST_POINTS} pts required.` },
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
    cost: BOOST_COST_POINTS,
    isPinned: true,
  });
  });
}
