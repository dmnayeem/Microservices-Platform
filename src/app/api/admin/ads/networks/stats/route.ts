import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { adNetworkOf } from "@/lib/ad-serve";
import { incomeByNetworkKey } from "@/lib/finance/platform-income";

/**
 * What each ad network is actually doing, for /admin/ads/networks: how many
 * ads point at it (and how many are live), and — from the measurement layer
 * (`AdMeasureDaily.network`) — what it served, the valid viewable
 * impressions and clicks over the window. Revenue is what the owner entered
 * at Finance → Platform income (linked by network), shown only to finance.
 *
 * GET /api/admin/ads/networks/stats?days=7|30|90
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [view, money] = await Promise.all([
    can(session.user.id, "ads.view"),
    can(session.user.id, "finance.view"),
  ]);
  if (!view) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const asked = Number(req.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90].includes(asked) ? asked : 7;
  const today = new Date(new Date().toISOString().slice(0, 10));
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);

  const [ads, measured, revenue] = await Promise.all([
    prisma.ad.findMany({ select: { type: true, networkId: true, status: true } }),
    prisma.adMeasureDaily.groupBy({
      by: ["network"],
      where: { date: { gte: from } },
      _sum: { served: true, validViews: true, invalidViews: true, validClicks: true },
    }) as unknown as Promise<
      {
        network: string;
        _sum: { served: number | null; validViews: number | null; invalidViews: number | null; validClicks: number | null };
      }[]
    >,
    // Entered at Finance → Platform income, linked by the platform's network.
    money
      ? incomeByNetworkKey({ from, to: today }).then((m) =>
          [...m.entries()].map(([network, usd]) => ({ network, usd }))
        )
      : Promise.resolve([] as { network: string; usd: number }[]),
  ]);

  type Row = {
    ads: number;
    active: number;
    paused: number;
    served: number;
    validViews: number;
    invalidViews: number;
    clicks: number;
    revenueUsd: number | null;
  };
  const rows: Record<string, Row> = {};
  const row = (id: string) =>
    (rows[id] ??= {
      ads: 0,
      active: 0,
      paused: 0,
      served: 0,
      validViews: 0,
      invalidViews: 0,
      clicks: 0,
      revenueUsd: money ? 0 : null,
    });

  for (const a of ads) {
    const r = row(adNetworkOf(a));
    r.ads++;
    if (a.status === "ACTIVE") r.active++;
    else if (a.status === "PAUSED") r.paused++;
  }
  for (const m of measured) {
    const r = row(m.network);
    r.served += m._sum.served ?? 0;
    r.validViews += m._sum.validViews ?? 0;
    r.invalidViews += m._sum.invalidViews ?? 0;
    r.clicks += m._sum.validClicks ?? 0;
  }
  for (const v of revenue) {
    const r = row(v.network);
    if (r.revenueUsd !== null) r.revenueUsd += v.usd;
  }

  return NextResponse.json({ days, money, rows });
}
