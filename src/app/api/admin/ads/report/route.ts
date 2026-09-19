import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { UNKNOWN_COUNTRY, countryLabel, countryFlag } from "@/lib/ad-geo";
import { countryDetailMap, type CountryDetail } from "@/lib/country-codes";
import { isNetworkAdType } from "@/lib/ad-revenue";

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

// One definition of "billed by Google, not by us" — see src/lib/ad-revenue.ts.
const isNetworkType = (t: string) => isNetworkAdType(t);

/** One country's slice of the window. */
export interface CountryRow {
  code: string;
  label: string;
  /** Emoji flag from the `Country` table; "" for the unknown bucket. */
  flag: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  /** Share of the window's impressions, 0–100. Drives the "Unknown" disclosure. */
  share: number;
}

/**
 * Fold the per-(ad, country) sums into a per-country breakdown.
 *
 * Two things this must get right, and both were easy to get wrong:
 *
 *  - **Spend passes the same revenue gate as every other panel.** House
 *    inventory bills nothing by design and its daily rows still carry $1.95 of
 *    historical self-billing from before `recordClick` exempted it; network
 *    (AdSense/GAM) revenue is reported in Google's console and never reaches
 *    this database. Summing `spendUsd` blind here would make the country panel
 *    disagree with the placement panel next to it on the same screen.
 *  - **Unknown is a row, not a gap.** Events recorded before this shipped, and
 *    any request that arrives without an edge country header, are stored as
 *    `ZZ`. They stay in the output with their real share, because a country
 *    chart that quietly drops its unknowns tells the owner his traffic is 100%
 *    from wherever happens to be tagged.
 */
function buildPerCountry<
  A extends { type: string; campaign: { isHouse: boolean } | null },
>(
  rows: Array<{
    adId: string;
    country: string;
    _sum: { impressions: number | null; clicks: number | null; spendUsd: unknown };
  }>,
  // Generic over the ad shape so the caller's `inFilter` — which reads
  // placement/campaign ids this function has no business knowing about — is the
  // SAME predicate the per-ad/per-placement/per-campaign loops use. Two
  // predicates would be two filters, and the country panel would eventually be
  // describing a different slice of traffic than the table beside it.
  adMap: Map<string, A>,
  inFilter: (a: A | undefined) => boolean,
  sort: "impressions" | "clicks" | "ctr" | "spend",
  /**
   * The canonical `Country` table, keyed by ISO2 — the SAME 196 rows every
   * dropdown on the platform offers.
   *
   * A bare "BD" in a revenue table is a code the owner has to decode; worse, it
   * cannot be told apart from a code that is not a country at all. Labelling
   * from the platform's own list (rather than only `Intl.DisplayNames`) means
   * the report names a country exactly as the admin named it when they targeted
   * it. `Intl` stays as the fallback for a code the table does not carry.
   */
  detail: Map<string, CountryDetail>
): {
  perCountry: CountryRow[];
  countrySort: string;
  countryTotals: {
    impressions: number;
    clicks: number;
    spend: number;
    /** Impressions with no resolvable country, and their share of the window. */
    unknownImpressions: number;
    unknownShare: number;
    countries: number;
  };
} {
  const agg = new Map<string, { impressions: number; clicks: number; spend: number }>();
  for (const r of rows) {
    const a = adMap.get(r.adId);
    if (!inFilter(a) || !a) continue;
    const code = r.country || UNKNOWN_COUNTRY;
    const cur = agg.get(code) ?? { impressions: 0, clicks: 0, spend: 0 };
    cur.impressions += r._sum.impressions ?? 0;
    cur.clicks += r._sum.clicks ?? 0;
    // Same gate as `perAd`/`perPlacement`/`perCampaign` above and as the CSV.
    if (!a.campaign?.isHouse && !isNetworkType(a.type)) {
      cur.spend += toNum(r._sum.spendUsd as Parameters<typeof toNum>[0]);
    }
    agg.set(code, cur);
  }

  const totalImpr = [...agg.values()].reduce((s, v) => s + v.impressions, 0);
  const perCountry: CountryRow[] = [...agg.entries()].map(([code, v]) => ({
    code,
    label: detail.get(code)?.name ?? countryLabel(code),
    flag: detail.get(code)?.flag ?? countryFlag(code) ?? "",
    impressions: v.impressions,
    clicks: v.clicks,
    ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
    spend: v.spend,
    share: totalImpr > 0 ? (v.impressions / totalImpr) * 100 : 0,
  }));
  perCountry.sort((a, b) => b[sort] - a[sort] || b.impressions - a.impressions);

  const unknown = agg.get(UNKNOWN_COUNTRY);
  return {
    perCountry,
    countrySort: sort,
    countryTotals: {
      impressions: totalImpr,
      clicks: [...agg.values()].reduce((s, v) => s + v.clicks, 0),
      spend: [...agg.values()].reduce((s, v) => s + v.spend, 0),
      unknownImpressions: unknown?.impressions ?? 0,
      unknownShare: totalImpr > 0 ? ((unknown?.impressions ?? 0) / totalImpr) * 100 : 0,
      // Real, identified countries — the unknown bucket is not one of them.
      countries: [...agg.keys()].filter((c) => c !== UNKNOWN_COUNTRY).length,
    },
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || 14));
  // Narrowing filters. Every section below — including the country breakdown —
  // reads the SAME two values, so the country panel can never be describing a
  // different slice of traffic than the placement table beside it.
  const placementId = sp.get("placementId") || null;
  const campaignId = sp.get("campaignId") || null;
  const COUNTRY_SORTS = ["impressions", "clicks", "ctr", "spend"] as const;
  type CountrySort = (typeof COUNTRY_SORTS)[number];
  const countrySortRaw = (sp.get("countrySort") ?? "impressions") as CountrySort;
  const countrySort: CountrySort = COUNTRY_SORTS.includes(countrySortRaw)
    ? countrySortRaw
    : "impressions";
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [stats, countryStats] = await Promise.all([
    prisma.adDailyStat.findMany({
      where: { date: { gte: since } },
      select: { adId: true, impressions: true, clicks: true, spendUsd: true },
    }),
    // Grouped in the database: one row per (ad, country) for the window, so the
    // API never holds a row per ad per country per DAY.
    //
    // Grouped by `adId` as well as `country` — NOT by country alone — because
    // spend has to pass the same house/network revenue gate the rest of this
    // report applies, and that gate lives on the Ad row. A `groupBy(["country"])`
    // would have been one cheap query that silently reported $1.95 of stale
    // HOUSE self-billing as revenue.
    prisma.adCountryDailyStat.groupBy({
      by: ["adId", "country"],
      where: { date: { gte: since } },
      _sum: { impressions: true, clicks: true, spendUsd: true },
    }) as unknown as Promise<
      Array<{
        adId: string;
        country: string;
        _sum: {
          impressions: number | null;
          clicks: number | null;
          spendUsd: unknown;
        };
      }>
    >,
  ]);

  const adIds = [
    ...new Set([
      ...stats.map((s) => s.adId),
      ...countryStats.map((s) => s.adId),
    ]),
  ];
  const ads = adIds.length
    ? await prisma.ad.findMany({
        where: { id: { in: adIds } },
        select: {
          id: true,
          type: true,
          campaign: { select: { id: true, title: true, isHouse: true } },
          placement: { select: { id: true, name: true } },
        },
      })
    : [];
  const adMap = new Map(ads.map((a) => [a.id, a]));
  /** Does this ad fall inside the caller's placement/campaign filter? */
  const inFilter = (a: (typeof ads)[number] | undefined) =>
    !!a &&
    (!placementId || a.placement?.id === placementId) &&
    (!campaignId || a.campaign?.id === campaignId);

  // Built before the empty-window short-circuit: a window with no AdDailyStat
  // rows still has to return a well-formed (empty) country section, or the UI
  // renders a panel that looks broken rather than a panel that says "nothing
  // here yet".
  const countryNames = await countryDetailMap();
  const perCountry = buildPerCountry(
    countryStats,
    adMap,
    inFilter,
    countrySort,
    countryNames
  );

  /**
   * How much of this window the country breakdown actually describes.
   *
   * Every share in that panel is a share of the country table's OWN total, so
   * they add to 100% however little of the window was attributed. Per-country
   * recording began partway through this platform's life — before that, every
   * impression was counted but none carried a country — so a wide date range
   * shows a panel that looks complete while describing a fraction of the
   * traffic in the totals beside it. That is what "the report doesn't show the
   * right numbers" was.
   *
   * Same treatment as `fillRate` below: report the measurement honestly and
   * let the UI say so, rather than presenting a number that reads as whole.
   */
  const windowImpressions = stats.reduce(
    (sum, s) => (inFilter(adMap.get(s.adId)) ? sum + s.impressions : sum),
    0
  );
  const attributedImpressions = perCountry.perCountry.reduce(
    (sum, r) => sum + r.impressions,
    0
  );
  const countryCoverage = {
    windowImpressions,
    attributedImpressions,
    /** 0–100, or null when the window has no impressions to compare against. */
    coveragePct:
      windowImpressions > 0
        ? Math.min(100, (attributedImpressions / windowImpressions) * 100)
        : null,
  };

  if (stats.length === 0) {
    return NextResponse.json({
      days,
      perAd: [],
      perPlacement: [],
      perCampaign: [],
      ...perCountry,
      countryCoverage,
    });
  }

  const perAd = new Map<string, Agg & { type: string; campaign: string; placement: string }>();
  const perPlacement = new Map<string, Agg & { name: string }>();
  const perCampaign = new Map<string, Agg & { title: string }>();

  for (const s of stats) {
    const a = adMap.get(s.adId);
    if (!inFilter(a) || !a) continue;
    const spend = toNum(s.spendUsd);
    const house = !!a.campaign?.isHouse;
    const network = isNetworkType(a.type);
    const bump = (cur: Agg) => {
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      // Spend is REVENUE here, so only inventory that can actually bill counts.
      //
      // `AdDailyStat.spendUsd` is not safe to sum blind: house rows carry
      // historical spend from before `recordClick` learned to skip house
      // inventory (the demo campaign billed itself down from its seeded budget),
      // and those rows are still in the table. `AdCampaign.spentTotal` was
      // corrected; the daily rollup never was — which is why this report and
      // /admin/finance disagreed. Network ads bill nothing into this database
      // either. Same rule, same set, as the eCPM denominator below.
      if (!house && !network) cur.spend += spend;
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
    where: { date: { gte: since }, ...(placementId ? { placementId } : {}) },
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
    ...perCountry,
    countryCoverage,
  });
}
