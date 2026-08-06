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

  const [stats, totals] = await Promise.all([
    prisma.adDailyStat.findMany({
      where: { date: { gte: since } },
      select: { date: true, impressions: true, clicks: true, spendUsd: true },
    }),
    prisma.ad.aggregate({ _sum: { impressions: true, clicks: true } }),
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

  return NextResponse.json({
    series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    totals: {
      impressions: lifetimeImpr,
      clicks: lifetimeClicks,
      ctr: lifetimeImpr > 0 ? (lifetimeClicks / lifetimeImpr) * 100 : 0,
    },
  });
}
