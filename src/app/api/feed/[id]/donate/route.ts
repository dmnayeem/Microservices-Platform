import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import { z } from "zod";
import { getPointsPerUsd } from "@/lib/economy";

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
    select: { pointsBalance: true },
  });
  if (!donor || donor.pointsBalance < v.data.points) {
    return NextResponse.json(
      { error: "Insufficient points balance" },
      { status: 400 }
    );
  }

  const pointsPerUsd = await getPointsPerUsd();
  // Debit the donor with an atomic CAS (`pointsBalance >= points`) so two
  // concurrent donations can't overspend (the pre-check above is check-then-act).
  // Donation is legitimately repeatable, so the reference stays per-occurrence.
  let donation: { id: string };
  let updated: { donationCollected: number; donationGoal: number | null };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: { id: donorId, pointsBalance: { gte: v.data.points } },
        data: { pointsBalance: { decrement: v.data.points } },
      });
      if (debit.count === 0) throw new Error("INSUFFICIENT");

      await tx.user.update({
        where: { id: post.userId },
        data: {
          pointsBalance: { increment: v.data.points },
          totalEarnings: { increment: v.data.points / pointsPerUsd },
        },
      });
      await tx.transaction.create({
        data: {
          userId: donorId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          points: -v.data.points,
          amount: v.data.points / pointsPerUsd,
          description: `Donation to post`,
          reference: `donation_${id}_${Date.now()}`,
          metadata: { postId: id, recipientId: post.userId },
        },
      });
      // Recipient-side ledger row so the received donation shows in THEIR history
      // (their totalEarnings is already incremented above).
      await tx.transaction.create({
        data: {
          userId: post.userId,
          type: TransactionType.GIFT,
          status: TransactionStatus.COMPLETED,
          points: v.data.points,
          amount: v.data.points / pointsPerUsd,
          description: `Donation received`,
          reference: `donation_recv_${id}_${donorId}_${Date.now()}`,
          metadata: { postId: id, donorId },
        },
      });
      const d = await tx.donation.create({
        data: { postId: id, donorId, points: v.data.points },
        select: { id: true },
      });
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
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "Insufficient points balance" },
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
      message: `Someone donated ${v.data.points} pts to your post.`,
      data: { postId: id, points: v.data.points, donationId: donation.id },
    },
  });

  return NextResponse.json({
    success: true,
    donationId: donation.id,
    donationCollected: updated.donationCollected,
    donationGoal: updated.donationGoal,
  });
  });
}
