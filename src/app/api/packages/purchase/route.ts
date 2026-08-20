import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { lt, toNum } from "@/lib/money";

const schema = z.object({
  packageId: z.string().min(1),
  duration: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "LIFETIME"]),
  method: z.enum(["POINTS", "CASH", "CARD", "BKASH", "NAGAD", "BINANCE"]),
});

const DURATION_DAYS: Record<string, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
  LIFETIME: 36500, // 100 years effectively forever
};

const DURATION_DISCOUNT: Record<string, number> = {
  MONTHLY: 0,
  QUARTERLY: 0.1,
  YEARLY: 0.2,
  LIFETIME: 0.5,
};

const DURATION_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  LIFETIME: 36,
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const pkg = await prisma.package.findUnique({
    where: { id: v.data.packageId },
  });
  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }
  // Free/default plan: activate directly — no charge, no payment step, no
  // admin verification. This is the self-serve "Switch to Free" / activation path.
  if (toNum(pkg.priceMonthly) === 0 && pkg.priceYearly == null) {
    const now = new Date();
    const freeExpiry =
      pkg.validityDays && pkg.validityDays > 0
        ? new Date(now.getTime() + pkg.validityDays * 86_400_000)
        : null; // null = permanent (free plans usually never expire)
    // Subscription.endDate is non-null; for a permanent free plan use a far-future
    // sentinel — real access is governed by User.packageExpiresAt (null = forever).
    const subEnd =
      freeExpiry ?? new Date(now.getTime() + DURATION_DAYS.LIFETIME * 86_400_000);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { packageId: pkg.id, packageExpiresAt: freeExpiry },
      });
      const subscription = await tx.subscription.create({
        data: {
          userId,
          packageId: pkg.id,
          startDate: now,
          endDate: subEnd,
          amount: 0,
          isActive: true,
          autoRenew: false,
        },
        select: { id: true },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: "PURCHASE",
          status: "COMPLETED",
          amount: 0,
          points: 0,
          description: `${pkg.name} plan activated`,
          reference: `subscription_${subscription.id}`,
        },
      });
    });
    return NextResponse.json({
      success: true,
      activated: true,
      expiresAt: freeExpiry ? freeExpiry.toISOString() : null,
      checkoutUrl: null,
      message: `${pkg.name} activated`,
    });
  }

  const months = DURATION_MONTHS[v.data.duration];
  const discount = DURATION_DISCOUNT[v.data.duration];
  const totalUsd = toNum(pkg.priceMonthly) * months * (1 - discount);
  const pointsPerUsd = await getPointsPerUsd();
  const totalPoints = Math.ceil(totalUsd * pointsPerUsd);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cashBalance: true, pointsBalance: true, packageExpiresAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Validate funds for non-redirect methods
  if (v.data.method === "CASH") {
    if (lt(user.cashBalance, totalUsd)) {
      return NextResponse.json(
        {
          error: "Insufficient cash balance",
          details: `Need ${usd(totalUsd)}, have ${usd(toNum(user.cashBalance))}`,
        },
        { status: 400 }
      );
    }
  } else if (v.data.method === "POINTS") {
    if (user.pointsBalance < totalPoints) {
      return NextResponse.json(
        {
          error: "Insufficient points",
          details: `Need ${totalPoints} pts, have ${user.pointsBalance} pts`,
        },
        { status: 400 }
      );
    }
  }
  // CARD / BKASH / NAGAD / BINANCE would normally redirect to a payment processor,
  // but for now we record an intent and require admin to verify.
  const isOffPlatform = ["CARD", "BKASH", "NAGAD", "BINANCE"].includes(
    v.data.method
  );

  // Don't let a user stack multiple off-platform (admin-verified) requests.
  if (isOffPlatform) {
    const pending = await prisma.subscription.findFirst({
      where: { userId, isActive: false },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { error: "You already have a pending subscription request awaiting verification." },
        { status: 400 }
      );
    }
  }

  // Compute end date — extend from current expiry if user already has the same tier active
  const now = new Date();
  const baseDate =
    user.packageExpiresAt && user.packageExpiresAt > now
      ? user.packageExpiresAt
      : now;
  const endDate = new Date(baseDate);
  endDate.setDate(endDate.getDate() + DURATION_DAYS[v.data.duration]);

  // Apply purchase. Debits use an atomic CAS (`balance >= amount`) so a concurrent
  // double-submit can't overspend (the pre-checks above are check-then-act).
  let activatedSubscriptionId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      if (v.data.method === "CASH") {
        const debit = await tx.user.updateMany({
          where: { id: userId, cashBalance: { gte: totalUsd } },
          data: { cashBalance: { decrement: totalUsd } },
        });
        if (debit.count === 0) throw new Error("INSUFFICIENT");
      } else if (v.data.method === "POINTS") {
        const debit = await tx.user.updateMany({
          where: { id: userId, pointsBalance: { gte: totalPoints } },
          data: { pointsBalance: { decrement: totalPoints } },
        });
        if (debit.count === 0) throw new Error("INSUFFICIENT");
      }

      if (!isOffPlatform) {
        // Activate immediately
        await tx.user.update({
          where: { id: userId },
          data: {
            packageId: pkg.id,
            packageExpiresAt: endDate,
          },
        });
      }

      const subscription = await tx.subscription.create({
        data: {
          userId,
          packageId: pkg.id,
          startDate: now,
          endDate,
          amount: totalUsd,
          paymentMethod:
            v.data.method === "BKASH"
              ? PaymentMethod.BKASH
              : v.data.method === "NAGAD"
                ? PaymentMethod.NAGAD
                : v.data.method === "BINANCE"
                  ? PaymentMethod.BINANCE
                  : null,
          isActive: !isOffPlatform,
          autoRenew: false,
        },
        select: { id: true },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "PURCHASE",
          status: isOffPlatform ? "PENDING" : "COMPLETED",
          amount: totalUsd,
          points: v.data.method === "POINTS" ? totalPoints : 0,
          description: `${pkg.name} subscription (${v.data.duration})`,
          reference: `subscription_${subscription.id}`,
        },
      });

      // Only an immediately-activated (on-platform) purchase triggers the
      // referrer bonus; off-platform stays pending admin verification.
      if (!isOffPlatform) activatedSubscriptionId = subscription.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }
    throw err;
  }

  // Referral subscription bonus (feature #9) — pay the referrer when their
  // invitee upgrades. Best-effort, idempotent per subscription.
  if (activatedSubscriptionId) {
    try {
      const { awardReferralSubscriptionBonus } = await import(
        "@/lib/referral-bonus"
      );
      await awardReferralSubscriptionBonus(userId, activatedSubscriptionId);
    } catch {
      /* never block the purchase on the bonus */
    }
  }

  return NextResponse.json({
    success: true,
    activated: !isOffPlatform,
    expiresAt: endDate.toISOString(),
    checkoutUrl: null, // No redirect — admin verification required for off-platform methods
    message: isOffPlatform
      ? "Order created. Admin will verify and activate your subscription shortly."
      : `${pkg.name} activated until ${endDate.toLocaleDateString()}`,
  });
  });
}
