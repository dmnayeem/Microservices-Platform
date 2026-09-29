import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { CPA_VIEW, parseRange, requireCpaAdmin, seesMoney } from "@/lib/cpa/admin";

// GET /api/admin/cpa/reports?from=&to=&offerId=
// Per-offer figures for the window (clicks by click time, conversions by
// conversion time):
//   clicks, uniqueUsers, pending, held, approved, rejected, reversed,
//   conversionRate (approved+held / unique clickers, %), pointsPaid (APPROVED),
//   and — finance.view only, else null — revenueUsd (network payout on
//   APPROVED), costUsd (pointsPaid at the current points rate), profitUsd.
export async function GET(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;

  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp);
  const offerId = sp.get("offerId") || null;

  const clickConds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (range.gte) clickConds.push(Prisma.sql`"createdAt" >= ${range.gte}`);
  if (range.lt) clickConds.push(Prisma.sql`"createdAt" < ${range.lt}`);
  if (offerId) clickConds.push(Prisma.sql`"offerId" = ${offerId}`);

  const convWhere: Prisma.CpaConversionWhereInput = {};
  if (range.gte || range.lt) convWhere.createdAt = range;
  if (offerId) convWhere.offerId = offerId;

  const [offers, clickRows, convGroups, money, rate] = await Promise.all([
    prisma.cpaOffer.findMany({
      where: offerId ? { id: offerId } : undefined,
      select: { id: true, title: true, network: true, status: true, points: true, payoutUsd: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    prisma.$queryRaw<{ offerId: string; clicks: number; users: number }[]>`
      SELECT "offerId", COUNT(*)::int AS clicks, COUNT(DISTINCT "userId")::int AS users
        FROM "CpaClick"
       WHERE ${Prisma.join(clickConds, " AND ")}
       GROUP BY "offerId"`,
    prisma.cpaConversion.groupBy({
      by: ["offerId", "status"],
      where: convWhere,
      _count: { _all: true },
      _sum: { points: true, payoutUsd: true },
    }) as unknown as Promise<
      {
        offerId: string;
        status: string;
        _count: { _all: number };
        _sum: { points: number | null; payoutUsd: unknown };
      }[]
    >,
    seesMoney(gate.userId),
    getPointsPerUsd(),
  ]);

  const clicksBy = new Map(clickRows.map((r) => [r.offerId, r]));
  type Agg = { count: Record<string, number>; points: Record<string, number>; payout: Record<string, number> };
  const agg = new Map<string, Agg>();
  for (const g of convGroups) {
    const a = agg.get(g.offerId) ?? { count: {}, points: {}, payout: {} };
    a.count[g.status] = g._count._all;
    a.points[g.status] = g._sum.points ?? 0;
    a.payout[g.status] = Number(g._sum.payoutUsd ?? 0);
    agg.set(g.offerId, a);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const rows = offers.map((o) => {
    const c = clicksBy.get(o.id);
    const a = agg.get(o.id) ?? { count: {}, points: {}, payout: {} };
    const n = (s: string) => a.count[s] ?? 0;
    const users = c?.users ?? 0;
    const pointsPaid = a.points.APPROVED ?? 0;
    const revenue = a.payout.APPROVED ?? 0;
    const cost = rate > 0 ? pointsPaid / rate : 0;
    return {
      offerId: o.id,
      title: o.title,
      network: o.network,
      status: o.status,
      clicks: c?.clicks ?? 0,
      uniqueUsers: users,
      pending: n("PENDING"),
      held: n("HELD"),
      approved: n("APPROVED"),
      rejected: n("REJECTED"),
      reversed: n("REVERSED"),
      conversionRate: users > 0 ? round(((n("APPROVED") + n("HELD")) / users) * 100) : 0,
      pointsPaid,
      revenueUsd: money ? round(revenue) : null,
      costUsd: money ? round(cost) : null,
      profitUsd: money ? round(revenue - cost) : null,
    };
  });

  const sum = (k: "clicks" | "uniqueUsers" | "pending" | "held" | "approved" | "rejected" | "reversed" | "pointsPaid") =>
    rows.reduce((s, r) => s + r[k], 0);
  const sumMoney = (k: "revenueUsd" | "costUsd" | "profitUsd") =>
    money ? round(rows.reduce((s, r) => s + (r[k] ?? 0), 0)) : null;

  return NextResponse.json({
    rows,
    totals: {
      clicks: sum("clicks"),
      uniqueUsers: sum("uniqueUsers"),
      pending: sum("pending"),
      held: sum("held"),
      approved: sum("approved"),
      rejected: sum("rejected"),
      reversed: sum("reversed"),
      pointsPaid: sum("pointsPaid"),
      revenueUsd: sumMoney("revenueUsd"),
      costUsd: sumMoney("costUsd"),
      profitUsd: sumMoney("profitUsd"),
    },
    pointsPerUsd: rate,
    seesMoney: money,
  });
}
