import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
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

// POST /api/packages - Subscribe to a package (submit payment request with transaction ID)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { packageId, packageSlug, billingPeriod, paymentMethod, transactionId, paymentScreenshot: _paymentScreenshot } = body;

    if ((!packageId && !packageSlug) || !paymentMethod || !transactionId) {
      return NextResponse.json(
        { error: "Package, payment method, and transaction ID are required" },
        { status: 400 }
      );
    }

    const pkg = await prisma.package.findFirst({
      where: packageId ? { id: packageId } : { slug: packageSlug },
    });

    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const price = billingPeriod === "yearly" && pkg.priceYearly
      ? pkg.priceYearly
      : pkg.priceMonthly;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        packageId: true,
        packageExpiresAt: true,
        package: { select: { accessLevel: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Reject downgrade-or-same purchases (except from default plan upward).
    const userLevel = user.package?.accessLevel ?? 0;
    if (pkg.accessLevel <= userLevel && user.packageId === pkg.id) {
      return NextResponse.json(
        { error: "You're already on this plan." },
        { status: 400 }
      );
    }

    const pendingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        isActive: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (pendingSubscription) {
      return NextResponse.json(
        { error: "You already have a pending subscription request. Please wait for admin approval." },
        { status: 400 }
      );
    }

    const startDate = new Date();
    const endDate = new Date();
    if (billingPeriod === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId: session.user.id,
        packageId: pkg.id,
        startDate,
        endDate,
        amount: price,
        paymentMethod: paymentMethod,
        transactionId,
        isActive: false,
        autoRenew: false,
      },
    });

    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "SYSTEM",
        title: "Package Subscription Submitted",
        message: `Your subscription request for ${pkg.name} (${usd(price)}) with transaction ID "${transactionId}" has been submitted and is pending admin verification.`,
        data: {
          subscriptionId: subscription.id,
          packageId: pkg.id,
          price,
          billingPeriod,
          transactionId,
        },
      },
    });

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        packageId: pkg.id,
        packageName: pkg.name,
        price: toNum(price),
        billingPeriod,
        status: "PENDING_VERIFICATION",
        transactionId,
        startDate,
        endDate,
      },
      message: "Subscription request submitted successfully. Admin will verify your payment and activate your package.",
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}
