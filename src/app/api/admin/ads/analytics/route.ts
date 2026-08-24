import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// GET /api/admin/ads/analytics?days=14 — platform-wide ad time-series from
// AdDailyStat + lifetime totals.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
      select: { date: true, impressions: true, clicks: true, spendUsd: true },
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
    prisma.adCreditLedger.aggregate({
      where: { kind: "PURCHASE" },
      _sum: { delta: true },
    }),
  ]);

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
      cur.spendUsd += toNum(s.spendUsd);
    }
  }

  const lifetimeImpr = totals._sum.impressions ?? 0;
  const lifetimeClicks = totals._sum.clicks ?? 0;
  const windowSpend = [...byDay.values()].reduce((s, v) => s + v.spendUsd, 0);
  const windowImpr = [...byDay.values()].reduce((s, v) => s + v.impressions, 0);
  const requests = serve._sum.requests ?? 0;
  const fills = serve._sum.fills ?? 0;

  return NextResponse.json({
    series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    totals: {
      impressions: lifetimeImpr,
      clicks: lifetimeClicks,
      ctr: lifetimeImpr > 0 ? (lifetimeClicks / lifetimeImpr) * 100 : 0,
    },
    revenue: {
      /** Billed spend in the selected window. */
      windowSpend,
      /** Lifetime billed spend across every non-house campaign. */
      lifetime: toNum(paidCampaigns._sum.spentTotal),
      /** Undrawn advertiser budget — revenue not yet earned. */
      unspent: toNum(paidCampaigns._sum.budget),
      /** Real money taken for ad credit, which `spentTotal` is not. */
      cashCollected: toNum(cashIn._sum.delta),
      /** Window revenue per thousand impressions. */
      ecpm: windowImpr > 0 ? (windowSpend / windowImpr) * 1000 : 0,
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
