import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { userCanFeature } from "@/lib/packages";
import { deductAdCreditTx } from "@/lib/ad-credits";
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

  const enriched = campaigns.map((c) => {
    const m = metricsByCampaign.get(c.id) ?? { impressions: 0, clicks: 0 };
    const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    // Lifetime billed spend is recorded on the campaign as it happens. It used
    // to be derived as clicks × CURRENT cpc, so every CPC change silently
    // rewrote what advertisers had "spent" in the past.
    const spent = toNum(c.spentTotal);
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
      startAt: c.startAt?.toISOString() ?? null,
      endAt: c.endAt?.toISOString() ?? null,
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

  // Fund the campaign from the advertiser's Ad Credit, atomically. The
  // conditional decrement (adCreditBalance >= amount) is the no-overspend guard;
  // if it matches zero rows the credit was insufficient and we abort.
  let campaign;
  try {
    campaign = await prisma.$transaction(async (tx) => {
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
      await deductAdCreditTx(tx, advertiserId, amount, {
        kind: "CAMPAIGN_FUND",
        reference: `campaign_create_${c.id}`,
        metadata: { campaignId: c.id },
      });
      return c;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_CREDIT") {
      const me = await prisma.user.findUnique({
        where: { id: advertiserId },
        select: { adCreditBalance: true },
      });
      return NextResponse.json(
        {
          error: `Ad credit is ${usd(toNum(me?.adCreditBalance))} — need ${usd(amount)} to fund this campaign. Add funds first.`,
          shortBy: sub(amount, me?.adCreditBalance ?? 0).toNumber(),
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
