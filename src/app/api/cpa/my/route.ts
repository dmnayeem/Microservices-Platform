import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePage } from "@/lib/paginate";
import { CPA_MY_CONVERSION_SELECT } from "@/lib/cpa/public";

// GET /api/cpa/my?page=&status= — the user's CPA history, newest first.
// { conversions: [{ ...Conversion, offer: { id, title, network, logoUrl } }],
//   total, page, pageSize, totals: { [status]: { count, points } } }
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Super-admin page visibility: refuse when /cpa is hidden for this user.
  const pageHidden = await assertPageVisible(userId, "/cpa");
  if (pageHidden) return pageHidden;

  const sp = new URL(request.url).searchParams;
  const page = parsePage(sp.get("page"));
  const pageSize = 20;
  const status = sp.get("status");
  const where = { userId, ...(status ? { status } : {}) };

  const [total, conversions, groups] = await Promise.all([
    prisma.cpaConversion.count({ where }),
    prisma.cpaConversion.findMany({
      where,
      orderBy: { createdAt: "desc" as const },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...CPA_MY_CONVERSION_SELECT,
        offer: { select: { id: true, title: true, network: true, logoUrl: true } },
      },
    }),
    prisma.cpaConversion.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
      _sum: { points: true },
    }) as unknown as Promise<
      { status: string; _count: { _all: number }; _sum: { points: number | null } }[]
    >,
  ]);

  return NextResponse.json({
    conversions,
    total,
    page,
    pageSize,
    totals: Object.fromEntries(
      groups.map((g) => [g.status, { count: g._count._all, points: g._sum.points ?? 0 }])
    ),
  });
}
