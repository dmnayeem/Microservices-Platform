import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface CountedValue {
  value: string;
  count: number;
}

interface PlanCount {
  id: string;
  slug: string;
  name: string;
  count: number;
}

interface FilterOptions {
  countries: CountedValue[];
  cities: CountedValue[];
  genderCounts: { male: number; female: number; other: number };
  packageTierCounts: PlanCount[];
  blueVerifiedCounts: { yes: number; no: number };
  totalActiveUsers: number;
}

/**
 * Pre-aggregate distinct dropdown values from the active-user pool. Cached
 * for 60s — the values change slowly and the form can tolerate 1-min staleness.
 */
const computeFilterOptions = unstable_cache(
  async (): Promise<FilterOptions> => {
    const baseWhere = { status: "ACTIVE" as const };

    type CountryGroup = { country: string | null; _count: { country: number } };
    type CityGroup = { city: string | null; _count: { city: number } };

    const [
      countryGroupsRaw,
      cityGroupsRaw,
      maleCount,
      femaleCount,
      otherCount,
      planGroupsRaw,
      plans,
      blueYes,
      blueNo,
      total,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["country"],
        where: { ...baseWhere, country: { not: null } },
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 100,
      }),
      prisma.user.groupBy({
        by: ["city"],
        where: { ...baseWhere, city: { not: null } },
        _count: { city: true },
        orderBy: { _count: { city: "desc" } },
        take: 100,
      }),
      prisma.user.count({
        where: { ...baseWhere, gender: { equals: "male", mode: "insensitive" } },
      }),
      prisma.user.count({
        where: {
          ...baseWhere,
          gender: { equals: "female", mode: "insensitive" },
        },
      }),
      prisma.user.count({
        where: {
          ...baseWhere,
          gender: { not: null, notIn: ["male", "Male", "MALE", "female", "Female", "FEMALE"] },
        },
      }),
      prisma.user.groupBy({
        by: ["packageId"],
        where: baseWhere,
        _count: { id: true },
      }),
      prisma.package.findMany({
        select: { id: true, slug: true, name: true, order: true },
        orderBy: [{ order: "asc" }, { accessLevel: "asc" }],
      }),
      prisma.user.count({ where: { ...baseWhere, isBlueVerified: true } }),
      prisma.user.count({ where: { ...baseWhere, isBlueVerified: false } }),
      prisma.user.count({ where: baseWhere }),
    ]);

    const countryGroups = countryGroupsRaw as CountryGroup[];
    const cityGroups = cityGroupsRaw as CityGroup[];
    type PlanGroup = { packageId: string | null; _count: { id: number } };
    const planCountMap = new Map<string, number>();
    for (const g of planGroupsRaw as PlanGroup[]) {
      if (g.packageId) planCountMap.set(g.packageId, g._count.id);
    }

    return {
      countries: countryGroups
        .filter((g) => g.country)
        .map((g) => ({
          value: g.country as string,
          count: g._count.country,
        })),
      cities: cityGroups
        .filter((g) => g.city)
        .map((g) => ({
          value: g.city as string,
          count: g._count.city,
        })),
      genderCounts: {
        male: maleCount,
        female: femaleCount,
        other: otherCount,
      },
      packageTierCounts: plans.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        count: planCountMap.get(p.id) ?? 0,
      })),
      blueVerifiedCounts: { yes: blueYes, no: blueNo },
      totalActiveUsers: total,
    };
  },
  ["boost-followers:filter-options"],
  { revalidate: 60 }
);

// GET /api/admin/users/[id]/boost-followers/filter-options
// Returns the dropdown option lists for the boost-followers filter form.
// The :id segment is not used (options are target-agnostic) but the route
// lives under the user-scoped namespace for permission consistency.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const options = await computeFilterOptions();
  return NextResponse.json(options);
}
