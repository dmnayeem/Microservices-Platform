import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum, type MoneyInput } from "@/lib/money";
import { requireActiveUser } from "@/lib/require-active";
import { planAutoRenewEnabled } from "@/lib/subscription-expiry";

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

    // "Pending" = an off-platform request whose PENDING ledger row is still
    // open. `isActive: false` alone also matches every expired or replaced
    // plan, which showed an old plan as "awaiting verification".
    const pendingSubscription = await findPendingRequest(session.user.id);
    const autoRenewAllowed = await planAutoRenewEnabled();

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
      autoRenewAllowed,
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
            proofUrl: pendingSub.proofUrl,
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

/** The user's open off-platform plan request (PENDING ledger row), if any. */
async function findPendingRequest(userId: string) {
  const ledger = await prisma.transaction.findFirst({
    where: { userId, status: "PENDING", reference: { startsWith: "subscription_" } },
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  });
  const subId = ledger?.reference?.slice("subscription_".length);
  if (!subId) return null;
  return prisma.subscription.findFirst({
    where: { id: subId, userId, isActive: false },
    include: { package: { select: { id: true, slug: true, name: true } } },
  });
}

// DELETE /api/packages/subscription — withdraw a PENDING off-platform request.
//
// This used to delete "the newest inactive subscription" — which, for anyone
// without a pending request, was an expired or replaced plan from their
// history. It never touched an active plan; for that, "cancel" now means
// switching auto-renew off (PATCH below), and the plan runs to its end date.
export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const pending = await findPendingRequest(userId);
    if (!pending) {
      return NextResponse.json(
        { error: "No pending subscription request to cancel" },
        { status: 400 }
      );
    }
    const pendingSub = pending as unknown as typeof pending & {
      package: { name: string } | null;
    };

    // Compare-and-set on the ledger row: an admin approving this request at
    // the same moment wins or loses cleanly — never both.
    const cancelled = await prisma.$transaction(async (tx) => {
      const settle = await tx.transaction.updateMany({
        where: { userId, reference: `subscription_${pendingSub.id}`, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (settle.count === 0) return false;
      // Same as an admin rejection: the request row goes (an unpaid request
      // whose term later "ran" would otherwise be summed as revenue); the
      // CANCELLED ledger row keeps the history.
      await tx.subscription.deleteMany({
        where: { id: pendingSub.id, userId, isActive: false },
      });
      return true;
    });
    if (!cancelled) {
      return NextResponse.json(
        { error: "This request was already processed." },
        { status: 409 }
      );
    }

    await prisma.notification.create({
      data: {
        userId,
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

// PATCH /api/packages/subscription { autoRenew: boolean } — turn auto-renew
// on/off for the ACTIVE paid plan. Renewal charges the wallet's CASH balance
// at expiry (lib/subscription-expiry). Turning it off is how a member
// "cancels": the plan keeps running until its end date and then stops.
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as { autoRenew?: unknown };
  if (typeof body.autoRenew !== "boolean") {
    return NextResponse.json({ error: "autoRenew must be true or false" }, { status: 400 });
  }
  const on = body.autoRenew;
  if (on) {
    const active = await requireActiveUser(userId);
    if (!active.ok) {
      return NextResponse.json({ error: active.message }, { status: active.httpStatus });
    }
    if (!(await planAutoRenewEnabled())) {
      return NextResponse.json(
        { error: "Auto-renew is switched off for all plans right now." },
        { status: 403 }
      );
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { packageId: true, packageExpiresAt: true },
  });
  const now = new Date();
  if (!user?.packageId || !user.packageExpiresAt || user.packageExpiresAt <= now) {
    return NextResponse.json({ error: "You have no active paid plan to renew." }, { status: 400 });
  }
  const r = await prisma.subscription.updateMany({
    where: {
      userId,
      packageId: user.packageId,
      isActive: true,
      endDate: { gt: now },
      // Only paid plans renew — a $0 row has nothing to charge.
      ...(on ? { amount: { gt: 0 } } : {}),
    },
    data: { autoRenew: on },
  });
  if (r.count === 0) {
    return NextResponse.json(
      { error: on ? "This plan can't auto-renew (it wasn't bought from your wallet)." : "No active plan found." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, autoRenew: on });
}
