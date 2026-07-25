import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// GET /api/advertiser/campaigns/[id]/analytics?days=14
// Time-series (from AdDailyStat) + per-ad breakdown for one campaign.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") || "14"), 7),
    90
  );

  const campaign = await prisma.adCampaign.findUnique({
    where: { id },
    select: { advertiserId: true },
  });
  if (!campaign || campaign.advertiserId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ads = await prisma.ad.findMany({
    where: { campaignId: id },
    select: { id: true, brandName: true, headline: true, impressions: true, clicks: true },
  });
  const adIds = ads.map((a) => a.id);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const stats = adIds.length
    ? await prisma.adDailyStat.findMany({
        where: { adId: { in: adIds }, date: { gte: since } },
        select: { date: true, impressions: true, clicks: true, spendUsd: true },
      })
    : [];

  // Bucket by day (UTC yyyy-mm-dd), zero-filled across the window.
  const byDay = new Map<string, { impressions: number; clicks: number; spendUsd: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), { impressions: 0, clicks: 0, spendUsd: 0 });
  }
  for (const s of stats) {
    const key = s.date.toISOString().slice(0, 10);
    const cur = byDay.get(key);
    if (cur) {
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      cur.spendUsd += toNum(s.spendUsd);
    }
  }

  const series = [...byDay.entries()].map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({
    series,
    ads: ads.map((a) => ({
      id: a.id,
      label: a.brandName || a.headline?.slice(0, 40) || "Ad",
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    })),
  });
}
