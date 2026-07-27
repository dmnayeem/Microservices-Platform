import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getPointsPerUsd } from "@/lib/economy";
import {
  WithdrawalStatus,
  PaymentMethod,
  TransactionType,
  TransactionStatus,
  NotificationType,
  KYCStatus,
} from "@/generated/prisma";
import {
  getEffectivePackage,
  resolveUserFeature,
  parseFeatureOverrides,
} from "@/lib/packages";
import { getUiToggles } from "@/lib/ui-toggles-server";

// Fee configuration per payment method
const PAYMENT_FEES: Record<PaymentMethod, { percentage: number; fixed: number }> = {
  BKASH: { percentage: 1.5, fixed: 0 },
  NAGAD: { percentage: 1.5, fixed: 0 },
  ROCKET: { percentage: 1.8, fixed: 0 },
  BINANCE: { percentage: 0.5, fixed: 0 },
  PAYPAL: { percentage: 2.5, fixed: 0 },
};

// Minimum withdrawal per method
const MIN_WITHDRAWAL: Record<PaymentMethod, number> = {
  BKASH: 5,
  NAGAD: 5,
  ROCKET: 5,
  BINANCE: 20,
  PAYPAL: 10,
};

// GET /api/withdrawals - Get user's withdrawal history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as WithdrawalStatus | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (status) {
      where.status = status;
    }

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.withdrawal.count({ where }),
    ]);

    // Get summary stats
    // Get all withdrawals for summary stats
    const allUserWithdrawals = await prisma.withdrawal.findMany({
      where: { userId: session.user.id },
      select: { status: true, amount: true },
    });

    const summary = {
      pending: 0,
      pendingCount: 0,
      completed: 0,
      completedCount: 0,
      rejected: 0,
      rejectedCount: 0,
    };

    allUserWithdrawals.forEach((w) => {
      switch (w.status) {
        case "PENDING":
        case "PROCESSING":
          summary.pending += toNum(w.amount);
          summary.pendingCount++;
          break;
        case "COMPLETED":
          summary.completed += toNum(w.amount);
          summary.completedCount++;
          break;
        case "REJECTED":
        case "CANCELLED":
          summary.rejected += toNum(w.amount);
          summary.rejectedCount++;
          break;
      }
    });

    return NextResponse.json({
      withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary,
    });
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    return NextResponse.json(
      { error: "Failed to fetch withdrawals" },
      { status: 500 }
    );
  }
}

// POST /api/withdrawals - Request a new withdrawal
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
  try {
    const body = await request.json();
    const { amount, method, accountDetails } = body;

    // Validate payment method
    if (!Object.keys(PaymentMethod).includes(method)) {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid withdrawal amount" },
        { status: 400 }
      );
    }

    // Check minimum withdrawal for method
    const minAmount = MIN_WITHDRAWAL[method as PaymentMethod];
    if (amount < minAmount) {
      return NextResponse.json(
        { error: `Minimum withdrawal for ${method} is $${minAmount}` },
        { status: 400 }
      );
    }

    // Validate account details
    if (!accountDetails || !accountDetails.accountNumber) {
      return NextResponse.json(
        { error: "Account details are required" },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        pointsBalance: true,
        kycStatus: true,
        featureOverrides: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Effective package (handles expiry + isDefault fallback).
    const userPackage = await getEffectivePackage(session.user.id);

    if (
      !resolveUserFeature(
        userPackage,
        parseFeatureOverrides(user.featureOverrides),
        "withdrawals"
      )
    ) {
      return NextResponse.json(
        { error: "Withdrawals are disabled for your plan" },
        { status: 403 }
      );
    }

    // KYC gate. When the admin toggle is on, ALL withdrawals require KYC;
    // otherwise KYC is only required for amounts over $100.
    const { requireKycForWithdrawal } = await getUiToggles();
    if (
      (requireKycForWithdrawal || amount > 100) &&
      user.kycStatus !== KYCStatus.APPROVED
    ) {
      return NextResponse.json(
        {
          error: requireKycForWithdrawal
            ? "Complete KYC verification to withdraw."
            : "KYC verification required for withdrawals over $100",
        },
        { status: 403 }
      );
    }

    // Use the resolved package row directly — no extra fetch needed.
    const packageInfo = userPackage
      ? {
          minWithdrawal: userPackage.minWithdrawal,
          withdrawalFee: userPackage.withdrawalFeeDiscount,
        }
      : null;

    // Check package minimum withdrawal
    const packageMinWithdrawal = packageInfo?.minWithdrawal || 5;
    if (amount < packageMinWithdrawal) {
      return NextResponse.json(
        { error: `Minimum withdrawal for your package is $${packageMinWithdrawal}` },
        { status: 400 }
      );
    }

    // Convert amount to points needed (admin-configurable rate)
    const pointsPerUsd = await getPointsPerUsd();
    const pointsNeeded = Math.ceil(amount * pointsPerUsd);

    // Check pending withdrawals
    const pendingWithdrawalsList = await prisma.withdrawal.findMany({
      where: {
        userId: session.user.id,
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
      },
      select: { amount: true },
    });
    const pendingWithdrawalsTotal = pendingWithdrawalsList.reduce((sum, w) => sum + toNum(w.amount), 0);

    // Check cooldown (24 hours between withdrawals)
    const lastWithdrawal = await prisma.withdrawal.findFirst({
      where: {
        userId: session.user.id,
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING, WithdrawalStatus.COMPLETED] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastWithdrawal) {
      const hoursSinceLastWithdrawal =
        (Date.now() - lastWithdrawal.createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastWithdrawal < 24) {
        const waitHours = Math.ceil(24 - hoursSinceLastWithdrawal);
        return NextResponse.json(
          { error: `Please wait ${waitHours} more hours before requesting another withdrawal` },
          { status: 400 }
        );
      }
    }

    // Check if user has enough balance (including pending)
    const pendingAmountPoints = pendingWithdrawalsTotal * pointsPerUsd;
    const availablePoints = user.pointsBalance - pendingAmountPoints;

    if (pointsNeeded > availablePoints) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    // Calculate fee
    const feeConfig = PAYMENT_FEES[method as PaymentMethod];
    const packageFeeDiscount = packageInfo?.withdrawalFee || 0; // Package can reduce fee
    const feePercentage = Math.max(0, feeConfig.percentage - packageFeeDiscount);
    const fee = (amount * feePercentage / 100) + feeConfig.fixed;
    const netAmount = amount - fee;

    // Atomic + no-overspend: hold the points with a CAS guard, then create the
    // withdrawal + transaction in ONE transaction. Concurrent requests can't
    // both pass (the second matches 0 rows and aborts) → no overdraft race.
    let withdrawal;
    try {
      withdrawal = await prisma.$transaction(async (tx) => {
        const held = await tx.user.updateMany({
          where: { id: session.user.id, pointsBalance: { gte: pointsNeeded } },
          data: { pointsBalance: { decrement: pointsNeeded } },
        });
        if (held.count === 0) throw new Error("INSUFFICIENT_BALANCE");

        const w = await tx.withdrawal.create({
          data: {
            userId: session.user.id,
            amount,
            fee,
            netAmount,
            method: method as PaymentMethod,
            accountDetails,
            status: WithdrawalStatus.PENDING,
          },
        });

        await tx.transaction.create({
          data: {
            userId: session.user.id,
            type: TransactionType.WITHDRAWAL,
            status: TransactionStatus.PENDING,
            points: -pointsNeeded,
            amount: -amount,
            description: `Withdrawal request via ${method}`,
            reference: `withdrawal_${w.id}`,
            metadata: { withdrawalId: w.id, method, fee, netAmount },
          },
        });
        return w;
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }
      throw e;
    }

    // Create notification
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: NotificationType.WALLET,
        title: "Withdrawal Request Submitted",
        message: `Your withdrawal request for $${amount.toFixed(2)} via ${method} has been submitted and is pending approval.`,
        data: {
          withdrawalId: withdrawal.id,
          amount,
          method,
          netAmount,
        },
      },
    });

    return NextResponse.json({
      withdrawal,
      message: "Withdrawal request submitted successfully",
      details: {
        amount,
        fee,
        netAmount,
        method,
        status: "PENDING",
        estimatedProcessingTime: "1-3 business days",
      },
    });
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    return NextResponse.json(
      { error: "Failed to create withdrawal" },
      { status: 500 }
    );
  }
  });
}
