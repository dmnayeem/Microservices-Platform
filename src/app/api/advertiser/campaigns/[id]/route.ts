import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdClickCost } from "@/lib/ad-billing";
import { add, toNum } from "@/lib/money";

// GET /api/advertiser/campaigns/[id] — campaign + its ads + aggregated stats.
// Owner-gated: only the advertiser who owns the campaign can view it.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.advertiserId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [adsRaw, cpc] = await Promise.all([
    prisma.ad.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      include: {
        placement: { select: { name: true } },
        promotedPost: { select: { id: true, content: true, images: true } },
      },
    }),
    getAdClickCost(),
  ]);
  // Prisma Accelerate under-infers `include` results → cast to the known shape.
  const ads = adsRaw as unknown as Array<{
    id: string;
    format: string;
    status: string;
    placement: { name: string } | null;
    brandName: string | null;
    brandLogo: string | null;
    headline: string | null;
    contentUrl: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
    targeting: unknown;
    weight: number;
    impressions: number;
    clicks: number;
    promotedPost: { id: string; content: string; images: string[] } | null;
    createdAt: Date;
  }>;

  const totals = ads.reduce(
    (acc, a) => {
      acc.impressions += a.impressions;
      acc.clicks += a.clicks;
      return acc;
    },
    { impressions: 0, clicks: 0 }
  );
  const spent = totals.clicks * cpc;

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      remaining: toNum(campaign.budget),
      spent,
      budget: add(campaign.budget, spent).toNumber(),
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr:
        totals.impressions > 0
          ? (totals.clicks / totals.impressions) * 100
          : 0,
      createdAt: campaign.createdAt.toISOString(),
    },
    ads: ads.map((a) => ({
      id: a.id,
      format: a.format,
      placement: a.placement?.name ?? null,
      status: a.status,
      brandName: a.brandName,
      brandLogo: a.brandLogo,
      headline: a.headline,
      contentUrl: a.contentUrl,
      ctaLabel: a.ctaLabel,
      targetUrl: a.targetUrl,
      targeting: a.targeting,
      weight: a.weight,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      promotedPost: a.promotedPost
        ? {
            id: a.promotedPost.id,
            content: a.promotedPost.content,
            image: a.promotedPost.images?.[0] ?? null,
          }
        : null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
