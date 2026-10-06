import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { PACKAGES_TAG } from "@/lib/cache-tags";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";

// GET /api/packages - Get available packages
const cachedActivePackages = unstable_cache(
  async () =>
    prisma.package.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ["packages-active"],
  { revalidate: 300, tags: [PACKAGES_TAG] }
);

export async function GET() {
  try {
    const session = await auth();

    // SHARED and admin-mutated: cached behind a tag so an admin price change
    // propagates immediately instead of being pinned for a TTL. A stale price
    // here would be a user quoted one amount and charged another.
    const packages = await cachedActivePackages();

    let userPackageId: string | null = null;
    let userAccessLevel = 0;
    let userSubscription = null;

    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          packageId: true,
          packageExpiresAt: true,
          package: { select: { id: true, slug: true, accessLevel: true } },
        },
      });

      if (user) {
        userPackageId = user.packageId;
        userAccessLevel = user.package?.accessLevel ?? 0;

        userSubscription = await prisma.subscription.findFirst({
          where: {
            userId: session.user.id,
            isActive: true,
          },
          orderBy: { createdAt: "desc" },
          include: { package: { select: { slug: true, name: true } } },
        });
      }
    }

    const formattedPackages = packages.map((pkg) => ({
      id: pkg.id,
      tier: pkg.slug,
      slug: pkg.slug,
      name: pkg.name,
      description: pkg.description,
      pricing: {
        monthly: toNum(pkg.priceMonthly),
        yearly: toNumOrNull(pkg.priceYearly),
        monthlySavings: (() => {
          const pm = toNum(pkg.priceMonthly);
          const py = toNumOrNull(pkg.priceYearly);
          return py != null && pm > 0
            ? Math.round(((pm * 12 - py) / (pm * 12)) * 100)
            : 0;
        })(),
      },
      benefits: {
        dailyTaskLimit: pkg.dailyTaskLimit,
        withdrawalFee: pkg.withdrawalFeeDiscount,
        minWithdrawal: toNum(pkg.minWithdrawal),
        referralBonus: pkg.dailyReferralPoints,
        xpMultiplier: pkg.xpMultiplier,
        features: pkg.features,
      },
      isCurrentPackage: userPackageId === pkg.id,
      canUpgrade: pkg.accessLevel > userAccessLevel,
      canDowngrade: pkg.accessLevel < userAccessLevel,
    }));

    const userSub = userSubscription as
      | (typeof userSubscription & { package: { slug: string; name: string } | null })
      | null;

    return NextResponse.json({
      packages: formattedPackages,
      currentPackage: userPackageId,
      subscription: userSub
        ? {
            tier: userSub.package?.slug ?? "default",
            startDate: userSub.startDate,
            endDate: userSub.endDate,
            autoRenew: userSub.autoRenew,
            isActive: userSub.isActive,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching packages:", error);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 }
    );
  }
}

// POST /api/packages — retired (410).
//
// This was an older subscribe path that no screen calls any more. It created a
// pending request with no ledger row, no proof check and no duration rules,
// and its "already pending" test matched every expired plan. The plans page
// uses POST /api/packages/purchase, which is the one place plan money moves.
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint was retired. Use POST /api/packages/purchase." },
    { status: 410 }
  );
}
