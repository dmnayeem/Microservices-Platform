import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { userCanFeature } from "@/lib/packages";
import { deductAdCreditTx } from "@/lib/ad-credits";
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
      // Fund the campaign from the advertiser's Ad Credit (not cash).
      await deductAdCreditTx(tx, advertiserId, amount, {
        kind: "CAMPAIGN_FUND",
        reference: `campaign_fund_${campaign.id}_${Date.now()}`,
        metadata: { campaignId: campaign.id },
      });
      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: {
          budget: { increment: amount },
          // Resume a campaign paused for exhausting its budget.
          ...(campaign.status === "PAUSED" ? { status: "ACTIVE" } : {}),
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_CREDIT") {
      const me = await prisma.user.findUnique({
        where: { id: advertiserId },
        select: { adCreditBalance: true },
      });
      return NextResponse.json(
        {
          error: `Ad credit is ${usd(toNum(me?.adCreditBalance))} — need ${usd(amount)}. Add funds first.`,
          shortBy: sub(amount, me?.adCreditBalance ?? 0).toNumber(),
        },
        { status: 402 }
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
  });
}
