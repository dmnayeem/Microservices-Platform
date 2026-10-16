import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { NotificationType } from "@/generated/prisma/client";
import { z } from "zod";
import {
  creditAdPoints,
  debitAdPoints,
  getAdPointsPerUsd,
  InsufficientBalanceError,
} from "@/lib/ad-wallet";

const schema = z.object({
  points: z.number().int().min(1).max(100000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Banned/suspended accounts keep a valid 30-day session, so the status has
  // to be checked here — see src/lib/require-active.ts.
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json(
      { error: active.message },
      { status: active.httpStatus }
    );
  }

  return withIdempotency(req, session.user.id, async () => {
  const donorId = session.user.id;

  const { id } = await params;
  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      donationGoal: true,
      donationCollected: true,
      content: true,
    },
  });
  if (!post || !post.donationGoal) {
    return NextResponse.json(
      { error: "This post doesn't accept donations" },
      { status: 404 }
    );
  }
  if (post.userId === donorId) {
    return NextResponse.json(
      { error: "You can't donate to your own post" },
      { status: 400 }
    );
  }

  const donor = await prisma.user.findUnique({
    where: { id: donorId },
    select: { adPointsBalance: true },
  });
  if (!donor || donor.adPointsBalance < v.data.points) {
    return NextResponse.json(
      { error: "Insufficient Ad Points balance" },
      { status: 400 }
    );
  }

  // Donations move AD POINTS only (owner rule, 2026-10-16). Earn Points may
  // only be withdrawn or converted to Ad Points, never transferred — and paying
  // the author in Earn Points (or Cash) would launder deposits: Add fund → Ad
  // Points → donate to a second account → Earn Points → withdraw. Ad Points in,
  // Ad Points out, so nothing donated can ever reach a withdrawable balance.
  //
  // Lifetime EARNINGS do not move either: `totalEarnings` is what the
  // leaderboard ranks on and what achievements pay against, and a peer
  // transfer is not earning. Both ledger rows carry `points: 0` (ad-wallet.ts),
  // so no "points earned" figure reads them.
  //
  // Finance: both rows sit under a `donation_` inner reference, which
  // adWalletKind() files as "peer" — member-to-member, internal. The donor's
  // debit is not platform revenue and the author's credit is not a cost.
  const rate = await getAdPointsPerUsd();
  let donation: { id: string };
  let updated: { donationCollected: number; donationGoal: number | null };
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Created first so its id makes both ledger references unique per
      // occurrence (a donation is legitimately repeatable). Rolled back with
      // everything else if the debit below fails.
      const d = await tx.donation.create({
        data: { postId: id, donorId, points: v.data.points },
        select: { id: true },
      });
      // CAS debit (`adPointsBalance >= points`): two concurrent donations can't
      // overspend — the pre-check above is only check-then-act.
      await debitAdPoints(
        tx,
        {
          userId: donorId,
          points: v.data.points,
          reference: `donation_${id}_${d.id}`,
          description: "Donation to post",
          purpose: "donation",
          metadata: { postId: id, recipientId: post.userId, donationId: d.id },
        },
        rate
      );
      await creditAdPoints(
        tx,
        {
          userId: post.userId,
          points: v.data.points,
          reference: `donation_recv_${id}_${d.id}`,
          description: "Donation received",
          purpose: "donation",
          metadata: { postId: id, donorId, donationId: d.id },
        },
        rate
      );
      const u = await tx.post.update({
        where: { id },
        data: { donationCollected: { increment: v.data.points } },
        select: { donationCollected: true, donationGoal: true },
      });
      return { donation: d, updated: u };
    });
    donation = result.donation;
    updated = result.updated;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { error: "Insufficient Ad Points balance" },
        { status: 400 }
      );
    }
    throw err;
  }

  await prisma.notification.create({
    data: {
      userId: post.userId,
      type: NotificationType.WALLET,
      title: "💝 New donation",
      message: `Someone donated ${v.data.points.toLocaleString()} Ad Points to your post.`,
      data: { postId: id, points: v.data.points, donationId: donation.id },
    },
  });

  // No DONATION_RECEIVED Earn Points bonus (owner, 2026-10-17): donations are
  // paid in Ad Points, and Ad Points must never turn into Earn Points — a bonus
  // here would let deposit money → Ad Points → donation to a second account →
  // withdrawable Earn Points.

  return NextResponse.json({
    success: true,
    donationId: donation.id,
    donationCollected: updated.donationCollected,
    donationGoal: updated.donationGoal,
  });
  });
}
