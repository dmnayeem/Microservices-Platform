import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum, type MoneyInput } from "@/lib/money";

// GET /api/packages/subscription - Get user's subscription status
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        packageId: true,
        packageExpiresAt: true,
        package: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      include: { package: { select: { id: true, slug: true, name: true } } },
    });

    const pendingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        isActive: false,
      },
      orderBy: { createdAt: "desc" },
      include: { package: { select: { id: true, slug: true, name: true } } },
    });

    const subscriptionHistory = await prisma.subscription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { package: { select: { slug: true, name: true } } },
    });

    type SubWithPkg<T> = T & { package: { id: string; slug: string; name: string } | null };
    // `minWithdrawal` is typed `MoneyInput`, not `number`: the column is
    // Decimal(18,6), and a cast that claims `number` invites the next reader to
    // do arithmetic on it — where `+` would concatenate strings rather than add.
    // Everything that leaves this route goes through `toNum` first.
    const pkg = (
      user as unknown as {
        package: {
          id: string;
          slug: string;
          name: string;
          features: string[];
          dailyTaskLimit: number;
          withdrawalFeeDiscount: number;
          minWithdrawal: MoneyInput;
        } | null;
      }
    ).package;
    const activeSub = activeSubscription as unknown as SubWithPkg<typeof activeSubscription> | null;
    const pendingSub = pendingSubscription as unknown as SubWithPkg<typeof pendingSubscription> | null;
    const history = subscriptionHistory as unknown as Array<SubWithPkg<(typeof subscriptionHistory)[number]>>;

    return NextResponse.json({
      currentPackage: {
        id: pkg?.id ?? null,
        tier: pkg?.slug ?? "default",
        name: pkg?.name ?? "Free",
        expiresAt: user.packageExpiresAt,
        features: pkg?.features ?? [],
        dailyTaskLimit: pkg?.dailyTaskLimit ?? -1,
        withdrawalFee: pkg?.withdrawalFeeDiscount ?? 0,
        minWithdrawal: toNum(pkg?.minWithdrawal ?? 5),
      },
      activeSubscription: activeSub
        ? {
            id: activeSub.id,
            tier: activeSub.package?.slug ?? "—",
            packageName: activeSub.package?.name ?? "—",
            startDate: activeSub.startDate,
            endDate: activeSub.endDate,
            amount: toNum(activeSub.amount),
            autoRenew: activeSub.autoRenew,
            paymentMethod: activeSub.paymentMethod,
          }
        : null,
      pendingSubscription: pendingSub
        ? {
            id: pendingSub.id,
            tier: pendingSub.package?.slug ?? "—",
            packageName: pendingSub.package?.name ?? "—",
            amount: toNum(pendingSub.amount),
            transactionId: pendingSub.transactionId,
            paymentMethod: pendingSub.paymentMethod,
            submittedAt: pendingSub.createdAt,
            status: "PENDING_VERIFICATION",
          }
        : null,
      history: history.map((sub) => ({
        id: sub.id,
        tier: sub.package?.slug ?? "—",
        packageName: sub.package?.name ?? "—",
        amount: toNum(sub.amount),
        startDate: sub.startDate,
        endDate: sub.endDate,
        isActive: sub.isActive,
        paymentMethod: sub.paymentMethod,
        createdAt: sub.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

// DELETE /api/packages/subscription - Cancel pending subscription request
export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pendingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        isActive: false,
      },
      orderBy: { createdAt: "desc" },
      include: { package: { select: { name: true } } },
    });

    if (!pendingSubscription) {
      return NextResponse.json(
        { error: "No pending subscription to cancel" },
        { status: 400 }
      );
    }

    const pendingSub = pendingSubscription as unknown as typeof pendingSubscription & {
      package: { name: string } | null;
    };

    await prisma.subscription.delete({
      where: { id: pendingSub.id },
    });

    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "SYSTEM",
        title: "Subscription Request Cancelled",
        message: `Your pending subscription request for ${pendingSub.package?.name ?? "the package"} has been cancelled.`,
        data: {
          subscriptionId: pendingSub.id,
          packageId: pendingSub.packageId,
        },
      },
    });

    return NextResponse.json({
      message: "Pending subscription request cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
