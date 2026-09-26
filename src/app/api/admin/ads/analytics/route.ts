import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { isNetworkAdType } from "@/lib/ad-revenue";

// GET /api/admin/ads/analytics?days=14 — platform-wide ad time-series from
// AdDailyStat + lifetime totals.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Ad revenue is finance: `finance.view` (super admin, finance admin, or a
  // named grant) — `ads.view` alone runs the ads, it does not see the money.
  const seesMoney = await can(session.user.id, "finance.view");
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") || "14"), 7),
    90
  );

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [stats, totals, paidCampaigns, serve, cashIn] = await Promise.all([
    prisma.adDailyStat.findMany({
      where: { date: { gte: since } },
      // `adId` so the eCPM denominator can drop house and network impressions —
      // see the note where `paidImpr` is computed below.
      select: { adId: true, date: true, impressions: true, clicks: true, spendUsd: true },
    }),
    prisma.ad.aggregate({ _sum: { impressions: true, clicks: true } }),
    // Lifetime revenue. `spentTotal` is authoritative — it was written at the
    // CPC in force at the time, so it does not rewrite history when the price
    // changes. House campaigns are excluded: they bill nothing by design, and
    // counting them would report income that never existed.
    prisma.adCampaign.aggregate({
      where: { isHouse: false },
      _sum: { spentTotal: true, budget: true },
    }),
    // Fill rate over the same window.
    prisma.adServeDailyStat.aggregate({
      where: { date: { gte: since } },
      _sum: { requests: true, fills: true },
    }),
    // Cash actually RECEIVED, which is a different thing from credit consumed
    // and was surfaced nowhere in admin.
    //
    // NOT an aggregate on `delta`: `delta` is the CREDITED amount, bonus
    // included. With `ads.credit_bonus_pct` at 10, $100 of real cash would be
    // reported as $110 received. `buyAdCredits` writes the real figure into
    // `metadata.paidUsd`, so the rows are summed by hand and only fall back to
    // `delta` for rows written before that field existed.
    prisma.adCreditLedger.findMany({
      where: { kind: "PURCHASE" },
      select: { delta: true, metadata: true },
    }),
  ]);

  const cashCollected = cashIn.reduce((sum, row) => {
    const paid = (row.metadata as { paidUsd?: unknown } | null)?.paidUsd;
    const n = Number(paid);
    return sum + (Number.isFinite(n) && n > 0 ? n : toNum(row.delta));
  }, 0);

  // Which ads in the window can earn the platform anything at all. Resolved
  // BEFORE the day buckets are filled, because `spendUsd` has to be filtered on
  // it: `AdDailyStat.spendUsd` is written per click and historically carried
  // house spend (the demo campaign billed itself before `recordClick` learned to
  // skip house inventory). Those rows are still in the table, so a plain
  // `sum(spendUsd)` reports money that never existed as ad revenue — right next
  // to `revenue.lifetime`, which correctly excludes house and therefore
  // disagrees with it. Network ads bill nothing here either (their revenue is in
  // Google's console), so the same set gates both the numerator and the eCPM
  // denominator.
  const adIds = [...new Set(stats.map((s) => s.adId))];
  const adRows = adIds.length
    ? await prisma.ad.findMany({
        where: { id: { in: adIds } },
        select: { id: true, type: true, campaign: { select: { isHouse: true } } },
      })
    : [];
  const earning = new Set(
    adRows
      .filter((a) => !a.campaign?.isHouse && !isNetworkAdType(a.type))
      .map((a) => a.id)
  );

  const byDay = new Map<
    string,
    { impressions: number; clicks: number; spendUsd: number }
  >();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), {
      impressions: 0,
      clicks: 0,
      spendUsd: 0,
    });
  }
  for (const s of stats) {
    const cur = byDay.get(s.date.toISOString().slice(0, 10));
    if (cur) {
      cur.impressions += s.impressions;
      cur.clicks += s.clicks;
      // Revenue only — see the note on `earning` above.
      if (earning.has(s.adId)) cur.spendUsd += toNum(s.spendUsd);
    }
  }

  const lifetimeImpr = totals._sum.impressions ?? 0;
  const lifetimeClicks = totals._sum.clicks ?? 0;
  const windowSpend = [...byDay.values()].reduce((s, v) => s + v.spendUsd, 0);

  // Platform eCPM divides by the impressions this database can ever earn from.
  // House inventory bills nothing by design, and network (AdSense / Ad Manager)
  // revenue is reported in Google's console and never reaches here — so both can
  // only sit in the denominator with an empty numerator and drag the figure
  // down. Network was the one missed when this was first written. The set is
  // built above, because the spend numerator needs the same filter.
  const paidImpr = stats.reduce(
    (sum, s) => sum + (earning.has(s.adId) ? s.impressions : 0),
    0
  );
  const requests = serve._sum.requests ?? 0;
  const fills = serve._sum.fills ?? 0;

  return NextResponse.json({
    series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    totals: {
      impressions: lifetimeImpr,
      clicks: lifetimeClicks,
      ctr: lifetimeImpr > 0 ? (lifetimeClicks / lifetimeImpr) * 100 : 0,
    },
    revenue: !seesMoney ? null : {
      /** Billed spend in the selected window. */
      windowSpend,
      /** Lifetime billed spend across every non-house campaign. */
      lifetime: toNum(paidCampaigns._sum.spentTotal),
      /** Undrawn advertiser budget — revenue not yet earned. */
      unspent: toNum(paidCampaigns._sum.budget),
      /** Real money taken for ad credit, which `spentTotal` is not. */
      cashCollected,
      /** Window revenue per thousand EARNING impressions (see above). */
      ecpm: paidImpr > 0 ? (windowSpend / paidImpr) * 1000 : 0,
      /** How many of the window's impressions could earn anything at all. */
      paidImpressions: paidImpr,
    },
    fill: {
      requests,
      fills,
      // null, not 0 — the counters only start from the day they shipped, and a
      // hard 0% would read as "every space is broken".
      rate: requests > 0 ? (fills / requests) * 100 : null,
    },
  });
}
