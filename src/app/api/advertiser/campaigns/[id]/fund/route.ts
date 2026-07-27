import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { userCanFeature } from "@/lib/packages";
import { sub, toNum } from "@/lib/money";

const fundSchema = z.object({ amount: z.number().min(1).max(100000) });

/**
 * Top up an existing campaign's budget from the advertiser's wallet. Atomic and
 * no-overspend (conditional cashBalance decrement). A campaign that was auto-
 * paused for running out of budget is reactivated once it's funded again.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return NextResponse.json({ error: "The advertiser is disabled for your plan" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const v = fundSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid amount" },
      { status: 400 }
    );
  }
  const amount = v.data.amount;
  const advertiserId = session.user.id;

  const campaign = await prisma.adCampaign.findUnique({
    where: { id },
    select: { id: true, advertiserId: true, status: true },
  });
  if (!campaign || campaign.advertiserId !== advertiserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (campaign.status === "ENDED") {
    return NextResponse.json(
      { error: "This campaign has ended and can't be funded." },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: { id: advertiserId, cashBalance: { gte: amount } },
        data: { cashBalance: { decrement: amount } },
      });
      if (debit.count === 0) throw new Error("INSUFFICIENT_FUNDS");

      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: {
          budget: { increment: amount },
          // Resume a campaign paused for exhausting its budget.
          ...(campaign.status === "PAUSED" ? { status: "ACTIVE" } : {}),
        },
      });
      await tx.transaction.create({
        data: {
          userId: advertiserId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -amount,
          points: 0,
          description: "Ad campaign top-up",
          reference: `campaign_fund_${campaign.id}_${Date.now()}`,
          metadata: { campaignId: campaign.id, kind: "campaign_fund" },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_FUNDS") {
      const me = await prisma.user.findUnique({
        where: { id: advertiserId },
        select: { cashBalance: true },
      });
      return NextResponse.json(
        {
          error: `Wallet balance is $${toNum(me?.cashBalance).toFixed(2)} — need $${amount.toFixed(2)}.`,
          shortBy: sub(amount, me?.cashBalance ?? 0).toNumber(),
        },
        { status: 402 }
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
  });
}
