import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// GET /api/admin/ads/report?days=N — per-ad / per-placement / per-campaign
// breakdown from AdDailyStat over the last N days (impressions, clicks, CTR,
// spend). Network (ADSENSE/GAM) ads only carry served impressions here — their
// clicks/revenue live in the network's own console.
interface Agg {
  impressions: number;
  clicks: number;
  spend: number;
}
const EMPTY: Agg = { impressions: 0, clicks: 0, spend: 0 };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.min(
    90,
    Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14)
  );
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const stats = await prisma.adDailyStat.findMany({
    where: { date: { gte: since } },
    select: { adId: true, impressions: true, clicks: true, spendUsd: true },
  });
  if (stats.length === 0) {
    return NextResponse.json({ days, perAd: [], perPlacement: [], perCampaign: [] });
  }

  const adIds = [...new Set(stats.map((s) => s.adId))];
  const ads = await prisma.ad.findMany({
    where: { id: { in: adIds } },
    select: {
      id: true,
      type: true,
      campaign: { select: { id: true, title: true } },
      placement: { select: { id: true, name: true } },
    },
  });
  const adMap = new Map(ads.map((a) => [a.id, a]));

  const perAd = new Map<string, Agg & { type: string; campaign: string; placement: string }>();
  const perPlacement = new Map<string, Agg & { name: string }>();
  const perCampaign = new Map<string, Agg & { title: string }>();

  for (const s of stats) {
    const a = adMap.get(s.adId);
    if (!a) continue;
    const spend = toNum(s.spendUsd);
    const bump = (cur: Agg) => {
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      cur.spend += spend;
    };
    const ad = perAd.get(s.adId) ?? {
      ...EMPTY,
      type: a.type,
      campaign: a.campaign?.title ?? "—",
      placement: a.placement?.name ?? "—",
    };
    bump(ad);
    perAd.set(s.adId, ad);

    const pKey = a.placement?.id ?? "—";
    const pl = perPlacement.get(pKey) ?? { ...EMPTY, name: a.placement?.name ?? "—" };
    bump(pl);
    perPlacement.set(pKey, pl);

    const cKey = a.campaign?.id ?? "—";
    const cp = perCampaign.get(cKey) ?? { ...EMPTY, title: a.campaign?.title ?? "—" };
    bump(cp);
    perCampaign.set(cKey, cp);
  }

  const shape = <T extends Agg>(m: Map<string, T>, limit?: number) => {
    const rows = [...m.values()]
      .map((v) => ({
        ...v,
        ctr: v.impressions ? (v.clicks / v.impressions) * 100 : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions);
    return limit ? rows.slice(0, limit) : rows;
  };

  return NextResponse.json({
    days,
    perAd: shape(perAd, 50),
    perPlacement: shape(perPlacement),
    perCampaign: shape(perCampaign, 50),
  });
}
