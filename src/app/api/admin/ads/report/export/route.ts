import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

import { csvCell } from "@/lib/csv";
import { UNKNOWN_COUNTRY, countryLabel } from "@/lib/ad-geo";
import { isNetworkAdType } from "@/lib/ad-revenue";

/**
 * `GET /api/admin/ads/report/export?days=N&scope=ad|placement|campaign|daily`
 *
 * Ads were the one money domain with no export. Users, referrals, deposits and
 * analytics all have one; an advertiser asking "send me the numbers for August"
 * could only be answered by screenshotting a table.
 *
 * Two things this carries that the on-screen tables do not:
 *
 *  - **Ids.** The report tables identify a row by campaign title + placement
 *    name, which is ambiguous the moment two campaigns share a name and useless
 *    for reconciling against anything else.
 *  - **The house / network split**, so the reader can see why a row earns
 *    nothing rather than assuming the space is broken.
 *
 * `scope=daily` is the per-day, per-ad grain — the raw rows, for anyone who
 * wants to pivot them themselves.
 */
// One definition of "billed by Google, not by us" — see src/lib/ad-revenue.ts.
const isNetworkType = (t: string) => isNetworkAdType(t);

interface Agg {
  impressions: number;
  clicks: number;
  spend: number;
  houseImpressions: number;
  networkImpressions: number;
}
const zero = (): Agg => ({
  impressions: 0,
  clicks: 0,
  spend: 0,
  houseImpressions: 0,
  networkImpressions: 0,
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Ad revenue is finance: `finance.view` (super admin, finance admin, or a
  // named grant) — `ads.view` alone runs the ads, it does not see the money.
  if (!(await can(session.user.id, "finance.view"))) {
    return NextResponse.json({ error: "Ad revenue reports are finance-only — ask a super admin." }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.get("days")) || 30));
  const scope = (sp.get("scope") ?? "ad").toLowerCase();
  if (!["ad", "placement", "campaign", "daily", "country"].includes(scope)) {
    return NextResponse.json({ error: "Unknown scope" }, { status: 400 });
  }
  // Same two narrowing filters the on-screen report takes, read the same way —
  // an export that ignored them would answer a different question than the
  // table the reader was looking at when they pressed the button.
  const placementId = sp.get("placementId") || null;
  const campaignId = sp.get("campaignId") || null;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const stats = await prisma.adDailyStat.findMany({
    where: { date: { gte: since } },
    select: { adId: true, date: true, impressions: true, clicks: true, spendUsd: true },
    orderBy: { date: "asc" },
  });

  // Per-(ad, country) sums for the same window. Grouped by `adId` too, not by
  // country alone, because the house/network revenue gate lives on the Ad row —
  // grouping by country alone would have been one cheap query that reported
  // stale HOUSE self-billing as revenue and disagreed with every other scope.
  const countryStats =
    scope === "country"
      ? ((await prisma.adCountryDailyStat.groupBy({
          by: ["adId", "country"],
          where: { date: { gte: since } },
          _sum: { impressions: true, clicks: true, spendUsd: true },
        })) as unknown as Array<{
          adId: string;
          country: string;
          _sum: {
            impressions: number | null;
            clicks: number | null;
            spendUsd: unknown;
          };
        }>)
      : [];

  const adIds = [
    ...new Set([...stats.map((s) => s.adId), ...countryStats.map((s) => s.adId)]),
  ];
  const ads = adIds.length
    ? await prisma.ad.findMany({
        where: { id: { in: adIds } },
        select: {
          id: true,
          type: true,
          brandName: true,
          headline: true,
          campaign: { select: { id: true, title: true, isHouse: true } },
          placement: { select: { id: true, name: true } },
        },
      })
    : [];
  const adMap = new Map(ads.map((a) => [a.id, a]));
  const inFilter = (a: (typeof ads)[number] | undefined) =>
    !!a &&
    (!placementId || a.placement?.id === placementId) &&
    (!campaignId || a.campaign?.id === campaignId);

  const rows: string[][] = [];
  let header: string[] = [];
  const filename = `ads-${scope}-${days}d.csv`;

  // eCPM is against impressions this database can ever earn from — house bills
  // nothing by design and network revenue lives in Google's console.
  const ecpm = (a: Agg) => {
    const paid = Math.max(0, a.impressions - a.houseImpressions - a.networkImpressions);
    return paid > 0 ? (a.spend / paid) * 1000 : 0;
  };
  const ctr = (a: Agg) => (a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0);
  const n2 = (x: number) => x.toFixed(2);
  const n6 = (x: number) => x.toFixed(6);

  if (scope === "country") {
    // The breakdown the screen shows, byte for byte the same numbers: the same
    // window, the same filters, the same revenue gate, and the same explicit
    // `ZZ` bucket. The CSV must not disagree with the panel it was exported from.
    header = [
      "country_code",
      "country",
      "impressions",
      "clicks",
      "ctr_pct",
      "spend_usd",
      "impression_share_pct",
    ];
    const agg = new Map<string, Agg>();
    for (const r of countryStats) {
      const a = adMap.get(r.adId);
      if (!inFilter(a) || !a) continue;
      const code = r.country || UNKNOWN_COUNTRY;
      const cur = agg.get(code) ?? zero();
      cur.impressions += r._sum.impressions ?? 0;
      cur.clicks += r._sum.clicks ?? 0;
      if (!a.campaign?.isHouse && !isNetworkType(a.type)) {
        cur.spend += toNum(r._sum.spendUsd as Parameters<typeof toNum>[0]);
      }
      if (a.campaign?.isHouse) cur.houseImpressions += r._sum.impressions ?? 0;
      if (isNetworkType(a.type)) cur.networkImpressions += r._sum.impressions ?? 0;
      agg.set(code, cur);
    }
    const totalImpr = [...agg.values()].reduce((t, v) => t + v.impressions, 0);
    for (const [code, g] of [...agg.entries()].sort(
      (x, y) => y[1].impressions - x[1].impressions
    )) {
      rows.push([
        code,
        // "Unknown" spelled out, never blank — a blank cell in a spreadsheet
        // reads as a missing row and gets filtered away, which is exactly the
        // silent renormalisation this bucket exists to prevent.
        countryLabel(code),
        String(g.impressions),
        String(g.clicks),
        n2(ctr(g)),
        n6(g.spend),
        n2(totalImpr > 0 ? (g.impressions / totalImpr) * 100 : 0),
      ]);
    }
  } else if (scope === "daily") {
    header = [
      "date_utc",
      "ad_id",
      "ad_label",
      "ad_type",
      "campaign_id",
      "campaign",
      "is_house",
      "placement_id",
      "placement",
      "impressions",
      "clicks",
      "spend_usd",
    ];
    for (const s of stats) {
      const a = adMap.get(s.adId);
      if (!inFilter(a)) continue;
      rows.push([
        s.date.toISOString().slice(0, 10),
        s.adId,
        a?.brandName || a?.headline?.slice(0, 60) || "",
        a?.type ?? "",
        a?.campaign?.id ?? "",
        a?.campaign?.title ?? "",
        a?.campaign?.isHouse ? "yes" : "no",
        a?.placement?.id ?? "",
        a?.placement?.name ?? "",
        String(s.impressions),
        String(s.clicks),
        n6(toNum(s.spendUsd)),
      ]);
    }
  } else {
    const groups = new Map<string, Agg & { label: string[] }>();
    for (const s of stats) {
      const a = adMap.get(s.adId);
      if (!inFilter(a) || !a) continue;
      let key: string;
      let label: string[];
      if (scope === "ad") {
        key = s.adId;
        label = [
          s.adId,
          a.brandName || a.headline?.slice(0, 60) || "",
          a.type,
          a.campaign?.id ?? "",
          a.campaign?.title ?? "",
          a.placement?.name ?? "",
        ];
      } else if (scope === "placement") {
        key = a.placement?.id ?? "—";
        label = [a.placement?.id ?? "", a.placement?.name ?? ""];
      } else {
        key = a.campaign?.id ?? "—";
        label = [
          a.campaign?.id ?? "",
          a.campaign?.title ?? "",
          a.campaign?.isHouse ? "yes" : "no",
        ];
      }
      const cur = groups.get(key) ?? { ...zero(), label };
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      // Revenue only — house and network rows bill nothing into this database,
      // and house daily rows still carry historical self-billed spend from
      // before `recordClick` exempted house inventory. Matches the aggregation
      // in /api/admin/ads/report; the CSV must not disagree with the screen.
      if (!a.campaign?.isHouse && !isNetworkType(a.type)) {
        cur.spend += toNum(s.spendUsd);
      }
      if (a.campaign?.isHouse) cur.houseImpressions += s.impressions;
      if (isNetworkType(a.type)) cur.networkImpressions += s.impressions;
      groups.set(key, cur);
    }

    const metrics = ["impressions", "clicks", "ctr_pct", "spend_usd", "house_impr", "network_impr", "ecpm_usd"];
    header =
      scope === "ad"
        ? ["ad_id", "ad_label", "ad_type", "campaign_id", "campaign", "placement", ...metrics]
        : scope === "placement"
          ? ["placement_id", "placement", ...metrics, "requests", "fills", "fill_rate_pct"]
          : ["campaign_id", "campaign", "is_house", ...metrics];

    // Fill rate is only meaningful per placement — it is counted per space.
    const fillBy = new Map<string, { requests: number; fills: number }>();
    if (scope === "placement") {
      const serveRows = (await prisma.adServeDailyStat.groupBy({
        by: ["placementId"],
        where: { date: { gte: since } },
        _sum: { requests: true, fills: true },
      })) as unknown as Array<{
        placementId: string;
        _sum: { requests: number | null; fills: number | null };
      }>;
      for (const r of serveRows) {
        fillBy.set(r.placementId, {
          requests: r._sum.requests ?? 0,
          fills: r._sum.fills ?? 0,
        });
      }
    }

    const sorted = [...groups.entries()].sort(
      (a, b) => b[1].impressions - a[1].impressions
    );
    for (const [key, g] of sorted) {
      const base = [
        ...g.label,
        String(g.impressions),
        String(g.clicks),
        n2(ctr(g)),
        n6(g.spend),
        String(g.houseImpressions),
        String(g.networkImpressions),
        n6(ecpm(g)),
      ];
      if (scope === "placement") {
        const f = fillBy.get(key);
        base.push(
          f ? String(f.requests) : "",
          f ? String(f.fills) : "",
          // Blank, not 0 — no requests recorded means "not measured yet", and a
          // hard zero in a spreadsheet reads as "this space is broken".
          f && f.requests > 0 ? n2((f.fills / f.requests) * 100) : ""
        );
      }
      rows.push(base);
    }
  }

  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
