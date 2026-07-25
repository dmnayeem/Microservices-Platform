import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getAdClickCost } from "@/lib/ad-billing";
import { userCanFeature } from "@/lib/packages";
import { add, sub, toNum } from "@/lib/money";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.adCampaign.findMany({
    where: { advertiserId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate metrics from associated ads
  const campaignIds = campaigns.map((c) => c.id);
  const ads = await prisma.ad.findMany({
    where: { campaignId: { in: campaignIds } },
    select: {
      campaignId: true,
      impressions: true,
      clicks: true,
    },
  });

  const metricsByCampaign = new Map<
    string,
    { impressions: number; clicks: number }
  >();
  for (const ad of ads) {
    const cur = metricsByCampaign.get(ad.campaignId) ?? {
      impressions: 0,
      clicks: 0,
    };
    cur.impressions += ad.impressions;
    cur.clicks += ad.clicks;
    metricsByCampaign.set(ad.campaignId, cur);
  }

  const totalImpressions = Array.from(metricsByCampaign.values()).reduce(
    (sum, m) => sum + m.impressions,
    0
  );
  const totalClicks = Array.from(metricsByCampaign.values()).reduce(
    (sum, m) => sum + m.clicks,
    0
  );

  const cpc = await getAdClickCost();
  const enriched = campaigns.map((c) => {
    const m = metricsByCampaign.get(c.id) ?? { impressions: 0, clicks: 0 };
    const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    // Each billed click decrements the campaign's remaining budget by exactly the
    // CPC, so consumed spend = clicks × CPC and total funded = remaining + spent.
    const spent = m.clicks * cpc;
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status as "ACTIVE" | "PAUSED" | "ENDED" | "DRAFT",
      budget: add(c.budget, spent).toNumber(),
      remaining: toNum(c.budget),
      spent,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    campaigns: enriched,
    stats: {
      campaigns: campaigns.length,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr:
        totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    },
  });
}

const createSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  budget: z.number().min(5),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return NextResponse.json({ error: "The advertiser is disabled for your plan" }, { status: 403 });
  }
  const body = await request.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const advertiserId = session.user.id;
  const amount = v.data.budget;

  // Fund the campaign from the advertiser's wallet, atomically. The conditional
  // decrement (cashBalance >= amount) is the no-overspend guard; if it matches
  // zero rows the balance was insufficient and we abort before creating anything.
  let campaign;
  try {
    campaign = await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: { id: advertiserId, cashBalance: { gte: amount } },
        data: { cashBalance: { decrement: amount } },
      });
      if (debit.count === 0) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
      const c = await tx.adCampaign.create({
        data: {
          title: v.data.title,
          description: v.data.description ?? null,
          budget: amount,
          advertiserId,
          status: "ACTIVE",
          startAt: v.data.startAt ? new Date(v.data.startAt) : null,
          endAt: v.data.endAt ? new Date(v.data.endAt) : null,
        },
      });
      await tx.transaction.create({
        data: {
          userId: advertiserId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -amount,
          points: 0,
          description: `Ad campaign budget — "${c.title}"`,
          reference: `campaign_create_${c.id}`,
          metadata: { campaignId: c.id, kind: "campaign_fund" },
        },
      });
      return c;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_FUNDS") {
      const me = await prisma.user.findUnique({
        where: { id: advertiserId },
        select: { cashBalance: true },
      });
      return NextResponse.json(
        {
          error: `Wallet balance is $${toNum(me?.cashBalance).toFixed(2)} — need $${amount.toFixed(2)} to fund this campaign. Top up your wallet, then try again.`,
          shortBy: sub(amount, me?.cashBalance ?? 0).toNumber(),
        },
        { status: 402 }
      );
    }
    throw err;
  }

  return NextResponse.json(
    {
      success: true,
      campaign: {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        status: campaign.status,
        budget: toNum(campaign.budget),
        spent: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        createdAt: campaign.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
