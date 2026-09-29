import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parsePage } from "@/lib/paginate";
import { csvFilename, csvResponse, toCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/audit";
import { CPA_VIEW, parseRange, requireCpaAdmin } from "@/lib/cpa/admin";

const CSV_MAX = 20_000;

// GET /api/admin/cpa/clicks?offerId=&userId=&q=&country=&from=&to=&page=&pageSize=[&format=csv]
// Each click with the user, time, location, clickId and the status of that
// user's conversion on the offer (null = none yet). format=csv exports up to
// 20,000 rows for the same filters.
export async function GET(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;

  const sp = new URL(request.url).searchParams;
  const where: Prisma.CpaClickWhereInput = {};
  const offerId = sp.get("offerId");
  if (offerId) where.offerId = offerId;
  const userId = sp.get("userId");
  if (userId) where.userId = userId;
  const country = sp.get("country");
  if (country) where.country = country.toUpperCase();
  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { id: q },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  const range = parseRange(sp);
  if (range.gte || range.lt) where.createdAt = range;

  const csv = sp.get("format") === "csv";
  const page = parsePage(sp.get("page"));
  const pageSize = csv ? CSV_MAX : Math.min(200, Math.max(1, Number(sp.get("pageSize")) || 50));

  const total = csv ? 0 : await prisma.cpaClick.count({ where });
  const clicks = await prisma.cpaClick.findMany({
    where,
    orderBy: { createdAt: "desc" as const },
    skip: csv ? 0 : (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      offerId: true,
      userId: true,
      username: true,
      country: true,
      district: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      offer: { select: { id: true, title: true, network: true } },
    },
  });

  // Status of each (offer, user)'s conversion.
  const pairs = clicks.map((c) => ({ offerId: c.offerId, userId: c.userId }));
  const convs = pairs.length
    ? await prisma.cpaConversion.findMany({
        where: {
          offerId: { in: [...new Set(pairs.map((p) => p.offerId))] },
          userId: { in: [...new Set(pairs.map((p) => p.userId))] },
        },
        select: { offerId: true, userId: true, status: true, clickId: true },
      })
    : [];
  const statusOf = new Map(convs.map((c) => [`${c.offerId}:${c.userId}`, c]));

  const rows = clicks.map((c) => {
    const conv = statusOf.get(`${c.offerId}:${c.userId}`);
    return {
      clickId: c.id,
      offer: c.offer,
      userId: c.userId,
      username: c.username,
      country: c.country,
      district: c.district,
      ip: c.ip,
      userAgent: c.userAgent,
      createdAt: c.createdAt,
      conversionStatus: conv?.status ?? null,
      /** True when the conversion was made from THIS click. */
      convertedHere: !!conv && conv.clickId === c.id,
    };
  });

  if (csv) {
    await writeAudit({
      actorId: gate.userId,
      action: "CPA_CLICKS_EXPORTED",
      entity: "CpaClick",
      summary: `Exported ${rows.length} CPA clicks to CSV`,
      meta: { filters: Object.fromEntries(sp.entries()), rows: rows.length },
    });
    return csvResponse(
      toCsv(
        ["Time (UTC)", "Click ID", "Offer", "Network", "User ID", "Username", "Country", "District", "IP", "Conversion"],
        rows.map((r) => [
          r.createdAt.toISOString(),
          r.clickId,
          r.offer.title,
          r.offer.network,
          r.userId,
          r.username,
          r.country,
          r.district,
          r.ip,
          r.conversionStatus ?? "",
        ])
      ),
      csvFilename("cpa-clicks")
    );
  }

  return NextResponse.json({ clicks: rows, total, page, pageSize });
}
