import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { userCanFeature } from "@/lib/packages";
import { targetingToUserWhereResolved } from "@/lib/ad-audience";

// Distinct country codes + package slugs present among ACTIVE users, WITH counts,
// so the audience builder dropdowns auto-populate from real data. Cached briefly.
const getOptionLists = unstable_cache(
  async () => {
    const baseWhere = { status: "ACTIVE" as const };
    const [countryGroups, planGroups, packages] = await Promise.all([
      prisma.user.groupBy({
        by: ["country"],
        where: { ...baseWhere, country: { not: null } },
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 100,
      }),
      prisma.user.groupBy({ by: ["packageId"], where: baseWhere, _count: { id: true } }),
      prisma.package.findMany({
        select: { id: true, slug: true, name: true, order: true },
        orderBy: [{ order: "asc" }],
      }),
    ]);
    const planCount = new Map<string, number>();
    for (const g of planGroups as { packageId: string | null; _count: { id: number } }[]) {
      if (g.packageId) planCount.set(g.packageId, g._count.id);
    }
    return {
      countries: (countryGroups as { country: string | null; _count: { country: number } }[])
        .filter((g) => g.country)
        .map((g) => ({ code: g.country as string, count: g._count.country })),
      packages: packages.map((p) => ({
        slug: p.slug,
        name: p.name,
        count: planCount.get(p.id) ?? 0,
      })),
    };
  },
  ["ads:audience:options"],
  { revalidate: 120 }
);

// POST /api/ads/audience — live reach estimate for a targeting object + the
// data-driven option lists. Usable by admins (ads.view), advertisers, and
// members who can boost a post (the boost composer reuses the same builder).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role as UserRole | undefined;
  const allowed =
    hasPermission(role, "ads.view") ||
    (await userCanFeature(session.user.id, "advertiser")) ||
    (await userCanFeature(session.user.id, "boost"));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const where = await targetingToUserWhereResolved(body.targeting ?? {});

  const [count, total, options] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    getOptionLists(),
  ]);

  return NextResponse.json({ count, total, ...options });
}
