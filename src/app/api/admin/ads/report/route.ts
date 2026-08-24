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
  /** Impressions served by the platform's OWN inventory (isHouse campaigns). */
  houseImpressions: number;
  /** Impressions served by AdSense / Ad Manager — revenue lives in Google's console. */
  networkImpressions: number;
}
const EMPTY: Agg = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  houseImpressions: 0,
  networkImpressions: 0,
};

const isNetworkType = (t: string) => t === "ADSENSE" || t === "GAM";

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
      campaign: { select: { id: true, title: true, isHouse: true } },
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
    const house = !!a.campaign?.isHouse;
    const network = isNetworkType(a.type);
    const bump = (cur: Agg) => {
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      cur.spend += spend;
      if (house) cur.houseImpressions += s.impressions;
      if (network) cur.networkImpressions += s.impressions;
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
      .map((v) => {
        // eCPM against impressions this database can ever earn from.
        //
        // Two kinds are excluded, for the same reason and with the same effect:
        //
        //  - **House** inventory bills nothing by design (see recordClick —
        //    billing it would report income that never existed).
        //  - **Network** (AdSense / Ad Manager) revenue is reported in Google's
        //    console and never reaches this database, so its impressions can
        //    only ever sit in the denominator with a structurally empty
        //    numerator.
        //
        // Leave either in and a space that is working perfectly reads as a
        // failure — which is the opposite of what the number is for. Network was
        // the one missed when this was first written.
        const paidImpr = Math.max(
          0,
          v.impressions - v.houseImpressions - v.networkImpressions
        );
        return {
          ...v,
          paidImpressions: paidImpr,
          ctr: v.impressions ? (v.clicks / v.impressions) * 100 : 0,
          ecpm: paidImpr > 0 ? (v.spend / paidImpr) * 1000 : 0,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);
    return limit ? rows.slice(0, limit) : rows;
  };

  // Fill rate — requests vs requests that produced an ad. Keyed by placement id,
  // so it lines up with `perPlacement` above.
  const serveRows = await prisma.adServeDailyStat.groupBy({
    by: ["placementId"],
    where: { date: { gte: since } },
    _sum: { requests: true, fills: true },
  });
  const fillBy = new Map(
    (serveRows as unknown as Array<{
      placementId: string;
      _sum: { requests: number | null; fills: number | null };
    }>).map((r) => [
      r.placementId,
      { requests: r._sum.requests ?? 0, fills: r._sum.fills ?? 0 },
    ])
  );

  return NextResponse.json({
    days,
    perAd: shape(perAd, 50),
    perPlacement: [...perPlacement.entries()].map(([id, v]) => {
      const shaped = shape(new Map([[id, v]]))[0];
      const f = fillBy.get(id) ?? { requests: 0, fills: 0 };
      return {
        ...shaped,
        requests: f.requests,
        fills: f.fills,
        // Zero requests means "not measured yet", not "0% filled" — the counters
        // only start from the day they shipped. The UI must show a dash, so this
        // reports null rather than a misleading 0.
        fillRate: f.requests > 0 ? (f.fills / f.requests) * 100 : null,
      };
    }).sort((a, b) => b.impressions - a.impressions),
    perCampaign: shape(perCampaign, 50),
  });
}
