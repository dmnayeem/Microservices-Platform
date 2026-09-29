import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parsePage } from "@/lib/paginate";
import {
  CPA_VIEW,
  parseRange,
  requireCpaAdmin,
  seesMoney,
} from "@/lib/cpa/admin";
import { CPA_CONVERSION_STATUSES } from "@/lib/cpa/eligibility";

// GET /api/admin/cpa/conversions?status=&offerId=&userId=&q=&from=&to=&page=&pageSize=
// The review queue. `q` matches username / email / name. `payoutUsd` is null
// for admins without finance.view.
export async function GET(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;

  const sp = new URL(request.url).searchParams;
  const page = parsePage(sp.get("page"));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 25));

  const where: Prisma.CpaConversionWhereInput = {};
  const status = sp.get("status");
  if (status && (CPA_CONVERSION_STATUSES as readonly string[]).includes(status))
    where.status = status;
  const offerId = sp.get("offerId");
  if (offerId) where.offerId = offerId;
  const userId = sp.get("userId");
  if (userId) where.userId = userId;
  const q = sp.get("q")?.trim();
  if (q) {
    where.user = {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    };
  }
  const range = parseRange(sp);
  if (range.gte || range.lt) where.createdAt = range;

  const rows = await prisma.cpaConversion.findMany({
    where,
    orderBy: { createdAt: "desc" as const },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      status: true,
      points: true,
      payoutUsd: true,
      proofImages: true,
      proofText: true,
      postbackVerified: true,
      txid: true,
      clickId: true,
      reviewedById: true,
      reviewedAt: true,
      rejectionReason: true,
      heldUntil: true,
      creditedAt: true,
      reversedAt: true,
      createdAt: true,
      offer: {
        select: {
          id: true,
          title: true,
          network: true,
          logoUrl: true,
          holdHours: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          avatar: true,
          country: true,
        },
      },
    },
  });
  const [total, money, byStatus] = await Promise.all([
    prisma.cpaConversion.count({ where }),
    seesMoney(gate.userId),
    prisma.cpaConversion.groupBy({
      by: ["status"],
      where: { ...where, status: undefined },
      _count: { _all: true },
    }) as unknown as Promise<{ status: string; _count: { _all: number } }[]>,
  ]);

  const clickIds = rows.map((r) => r.clickId).filter((x): x is string => !!x);
  const clicks = clickIds.length
    ? await prisma.cpaClick.findMany({
        where: { id: { in: clickIds } },
        select: {
          id: true,
          country: true,
          district: true,
          ip: true,
          userAgent: true,
          createdAt: true,
        },
      })
    : [];
  const clickById = new Map(clicks.map((c) => [c.id, c]));

  return NextResponse.json({
    conversions: rows.map((r) => ({
      id: r.id,
      status: r.status,
      offer: r.offer,
      user: r.user,
      points: r.points,
      payoutUsd: money && r.payoutUsd != null ? Number(r.payoutUsd) : null,
      proofImages: r.proofImages,
      proofText: r.proofText,
      postbackVerified: r.postbackVerified,
      txid: r.txid,
      clickId: r.clickId,
      click: r.clickId ? (clickById.get(r.clickId) ?? null) : null,
      reviewedById: r.reviewedById,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
      heldUntil: r.heldUntil,
      creditedAt: r.creditedAt,
      reversedAt: r.reversedAt,
      createdAt: r.createdAt,
    })),
    counts: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    total,
    page,
    pageSize,
    seesMoney: money,
  });
}
