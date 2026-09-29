import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { getPointsPerUsd } from "@/lib/economy";
import {
  CPA_MANAGE,
  CPA_VIEW,
  cpaOfferData,
  cpaOfferSchema,
  cpaOfferWarnings,
  requireCpaAdmin,
} from "@/lib/cpa/admin";
import { CPA_STATUSES } from "@/lib/cpa/eligibility";

// GET /api/admin/cpa/offers?status=&q= — every offer, with conversion counts by status.
export async function GET(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  const where: Prisma.CpaOfferWhereInput = {};
  if (status && (CPA_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { network: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const offers = await prisma.cpaOffer.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  const ids = offers.map((o) => o.id);
  const groups = ids.length
    ? ((await prisma.cpaConversion.groupBy({
        by: ["offerId", "status"],
        where: { offerId: { in: ids } },
        _count: { _all: true },
      })) as unknown as { offerId: string; status: string; _count: { _all: number } }[])
    : [];
  const counts = new Map<string, Record<string, number>>();
  for (const g of groups) {
    const m = counts.get(g.offerId) ?? {};
    m[g.status] = g._count._all;
    counts.set(g.offerId, m);
  }
  const rate = await getPointsPerUsd();
  return NextResponse.json({
    offers: offers.map((o) => ({
      ...o,
      payoutUsd: o.payoutUsd == null ? null : Number(o.payoutUsd),
      conversionsByStatus: counts.get(o.id) ?? {},
      warnings: cpaOfferWarnings(o, rate),
    })),
    pointsPerUsd: rate,
  });
}

// POST /api/admin/cpa/offers — create.
export async function POST(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = cpaOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = cpaOfferData(parsed.data, body);
  const offer = await prisma.cpaOffer.create({
    data: { ...(data as Prisma.CpaOfferCreateInput), createdById: gate.userId },
  });

  await writeAudit({
    actorId: gate.userId,
    action: "CPA_OFFER_CREATED",
    entity: "CpaOffer",
    entityId: offer.id,
    summary: `Created CPA offer "${offer.title}" (${offer.network}, ${offer.points} pts, ${offer.status})`,
    meta: { offerId: offer.id, points: offer.points, status: offer.status },
  });

  const rate = await getPointsPerUsd();
  return NextResponse.json({
    offer: { ...offer, payoutUsd: offer.payoutUsd == null ? null : Number(offer.payoutUsd) },
    warnings: cpaOfferWarnings(offer, rate),
  });
}
