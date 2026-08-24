import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { refundCampaignBudgetToCredit } from "@/lib/ad-credits";
import { toNum } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CampaignAdRow {
  id: string;
  type: string;
  format: string;
  status: string;
  brandName: string | null;
  headline: string | null;
  weight: number | null;
  impressions: number;
  clicks: number;
  placement: { name: string } | null;
}

interface CampaignWithAds {
  id: string;
  title: string;
  description: string | null;
  status: string;
  isHouse: boolean;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  budget: Prisma.Decimal;
  spentTotal: Prisma.Decimal;
  advertiser: { id: string; name: string | null; email: string } | null;
  ads: CampaignAdRow[];
}

/**
 * One campaign, with its day-by-day performance.
 *
 * This route had PATCH and DELETE and no GET, so an admin could edit or destroy
 * a campaign but never look at one: the campaign rows in the Ad Manager were
 * dead text, and the only per-campaign figures anywhere were window totals in a
 * top-50 table. Shaped like the advertiser's own campaign analytics so the two
 * screens cannot drift apart.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const days = Math.min(
    90,
    Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14)
  );

  // Prisma's `include` generic degrades here (the same gotcha noted in
  // admin/analytics/page.tsx), so the row shape is stated explicitly.
  const campaign = (await prisma.adCampaign.findUnique({
    where: { id },
    include: {
      advertiser: { select: { id: true, name: true, email: true } },
      ads: {
        select: {
          id: true,
          type: true,
          format: true,
          status: true,
          brandName: true,
          headline: true,
          weight: true,
          impressions: true,
          clicks: true,
          placement: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })) as unknown as CampaignWithAds | null;
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same UTC-midnight window every other ad report uses. See the note on
  // `todayUtc()` — a "day" here is a UTC day, and the UI says so.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const adIds = campaign.ads.map((a) => a.id);
  const stats = adIds.length
    ? await prisma.adDailyStat.findMany({
        where: { adId: { in: adIds }, date: { gte: since } },
        select: { adId: true, date: true, impressions: true, clicks: true, spendUsd: true },
      })
    : [];

  const byDay = new Map<
    string,
    { impressions: number; clicks: number; spendUsd: number }
  >();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), { impressions: 0, clicks: 0, spendUsd: 0 });
  }
  // Per-ad totals for the SAME window as the chart. The advertiser view shows
  // lifetime counters beside a windowed chart, which is two periods on one
  // screen; this does not repeat that.
  const perAd = new Map<
    string,
    { impressions: number; clicks: number; spendUsd: number }
  >(adIds.map((a) => [a, { impressions: 0, clicks: 0, spendUsd: 0 }]));

  for (const s of stats) {
    const spend = toNum(s.spendUsd);
    const day = byDay.get(s.date.toISOString().slice(0, 10));
    if (day) {
      day.impressions += s.impressions;
      day.clicks += s.clicks;
      day.spendUsd += spend;
    }
    const ad = perAd.get(s.adId);
    if (ad) {
      ad.impressions += s.impressions;
      ad.clicks += s.clicks;
      ad.spendUsd += spend;
    }
  }

  const budget = toNum(campaign.budget);
  const spent = toNum(campaign.spentTotal);

  return NextResponse.json({
    days,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      isHouse: campaign.isHouse,
      startAt: campaign.startAt,
      endAt: campaign.endAt,
      createdAt: campaign.createdAt,
      advertiser: campaign.advertiser,
      // `budget` is what is LEFT; funded is what was put in. Reporting one as
      // the other is the mistake the finance page was making.
      remaining: budget,
      spent,
      funded: budget + spent,
    },
    series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    ads: campaign.ads.map((a) => {
      const w = perAd.get(a.id) ?? { impressions: 0, clicks: 0, spendUsd: 0 };
      return {
        id: a.id,
        label: a.brandName || a.headline?.slice(0, 40) || "Ad",
        type: a.type,
        format: a.format,
        status: a.status,
        placement: a.placement?.name ?? "—",
        weight: a.weight,
        // Windowed — matches the chart above it.
        impressions: w.impressions,
        clicks: w.clicks,
        spend: w.spendUsd,
        ctr: w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0,
        // Lifetime, labelled as such, because the Ads tab shows these too.
        lifetimeImpressions: a.impressions,
        lifetimeClicks: a.clicks,
      };
    }),
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
  if (body.budget !== undefined) data.budget = Number(body.budget) || 0;
  if (body.status !== undefined && ["ACTIVE", "PAUSED", "ENDED"].includes(body.status))
    data.status = body.status;
  // Platform-owned inventory: exempt from the budget floor in
  // `servableCampaignWhere` and never billed by `recordClick`. Nothing in the
  // app used to write this, so it could only be changed in the database.
  if (body.isHouse !== undefined) data.isHouse = Boolean(body.isHouse);
  const parseDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  };
  if (body.startAt !== undefined) data.startAt = parseDate(body.startAt);
  if (body.endAt !== undefined) data.endAt = parseDate(body.endAt);
  const campaign = await prisma.adCampaign.update({ where: { id }, data });

  // Ending a campaign returns its unspent budget to the owner's ad credit. This
  // moves money, so a failure must surface rather than be swallowed.
  let refunded = 0;
  if (data.status === "ENDED") {
    refunded = await refundCampaignBudgetToCredit(id);
  }

  await writeAudit({
    actorId: session.user.id,
    action: data.status === "ENDED" ? "AD_CAMPAIGN_ENDED" : "AD_CAMPAIGN_UPDATED",
    entity: "AdCampaign",
    entityId: id,
    targetUserId: campaign.advertiserId,
    summary:
      data.status === "ENDED"
        ? `Ended campaign "${campaign.title}"${refunded ? ` — refunded ${usd(refunded)}` : ""}`
        : `Updated campaign "${campaign.title}"`,
    meta: { fields: Object.keys(data), refunded },
  });

  return NextResponse.json({ campaign, refunded });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.adCampaign.findUnique({
    where: { id },
    select: { title: true, advertiserId: true },
  });
  // Return unspent budget to the owner's ad credit BEFORE deleting — once the
  // row is gone the money is unrecoverable, so this must not be fire-and-forget.
  const refunded = await refundCampaignBudgetToCredit(id);
  await prisma.adCampaign.delete({ where: { id } }); // cascades to its ads

  await writeAudit({
    actorId: session.user.id,
    action: "AD_CAMPAIGN_DELETED",
    entity: "AdCampaign",
    entityId: id,
    targetUserId: existing?.advertiserId ?? null,
    summary: `Deleted campaign "${existing?.title ?? id}"${refunded ? ` — refunded ${usd(refunded)}` : ""}`,
    meta: { refunded },
  });

  return NextResponse.json({ success: true, refunded });
}
