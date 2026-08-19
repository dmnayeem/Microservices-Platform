import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { AD_STATUS } from "@/lib/ad-review";

/**
 * The review queue, filtered and paginated SERVER-side.
 *
 * The old approvals tab filtered `status === "PENDING"` on the client out of a
 * `take: 200` payload ordered newest-first — so once the platform had 200 newer
 * ads, an older pending submission was simply unreachable. Oldest-first is the
 * default here because a review queue is a FIFO, not a feed.
 */

const STATE_WHERE: Record<string, Prisma.AdWhereInput> = {
  pending: { status: AD_STATUS.PENDING },
  changes: { status: AD_STATUS.CHANGES_REQUESTED },
  rejected: { status: AD_STATUS.REJECTED },
  approved: { status: { in: [AD_STATUS.ACTIVE, AD_STATUS.PAUSED] }, reviewedAt: { not: null } },
  all: {},
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const state = sp.get("state") ?? "pending";
  const q = (sp.get("q") ?? "").trim();
  const placement = sp.get("placement") ?? "";
  const advertiserId = sp.get("advertiserId") ?? "";
  const format = sp.get("format") ?? "";
  const sort = sp.get("sort") ?? (state === "pending" ? "oldest" : "newest");
  const cursor = sp.get("cursor") ?? "";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 25, 1), 100);

  const where: Prisma.AdWhereInput = {
    ...(STATE_WHERE[state] ?? STATE_WHERE.pending),
    ...(placement ? { placement: { name: placement } } : {}),
    ...(format ? { format } : {}),
    ...(advertiserId ? { campaign: { advertiserId } } : {}),
    ...(q
      ? {
          OR: [
            { headline: { contains: q, mode: "insensitive" } },
            { brandName: { contains: q, mode: "insensitive" } },
            { targetUrl: { contains: q, mode: "insensitive" } },
            { campaign: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.AdOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ submittedAt: "asc" }, { createdAt: "asc" }]
      : [{ submittedAt: "desc" }, { createdAt: "desc" }];

  const [rows, counts] = await Promise.all([
    prisma.ad.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            budget: true,
            spentTotal: true,
            startAt: true,
            endAt: true,
            advertiser: { select: { id: true, name: true, username: true } },
          },
        },
        placement: { select: { id: true, name: true } },
      },
    }),
    // Tab badges — one grouped query instead of five counts.
    prisma.ad.groupBy({ by: ["status"], _count: { _all: true } }) as unknown as Promise<
      { status: string; _count: { _all: number } }[]
    >,
  ]);

  const hasMore = rows.length > limit;
  const ads = hasMore ? rows.slice(0, limit) : rows;

  const byStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  ) as Record<string, number>;

  return NextResponse.json({
    ads,
    nextCursor: hasMore ? ads[ads.length - 1]?.id ?? null : null,
    counts: {
      pending: byStatus[AD_STATUS.PENDING] ?? 0,
      changes: byStatus[AD_STATUS.CHANGES_REQUESTED] ?? 0,
      rejected: byStatus[AD_STATUS.REJECTED] ?? 0,
      approved: (byStatus[AD_STATUS.ACTIVE] ?? 0) + (byStatus[AD_STATUS.PAUSED] ?? 0),
    },
  });
}
