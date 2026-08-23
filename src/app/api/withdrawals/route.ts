import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/require-active";
import { toNum } from "@/lib/money";
import {
  WithdrawalStatus,
  PaymentMethod,
  TransactionType,
  TransactionStatus,
  NotificationType,
  KYCStatus,
} from "@/generated/prisma";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getWithdrawalConfig } from "@/lib/withdrawal";

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

  // Money leaving the platform. `User.status` was checked only at login, and
  // the JWT lives 30 days with no status claim — so an account banned for fraud
  // could still file a withdrawal for whatever the fraud had earned. This route
  // reads the strict check: an unverified account cannot take money out either.
  const active = await requireVerifiedUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json(
      { error: active.message },
      { status: active.httpStatus }
    );
  }

  // Money route. `withIdempotency` + the unique ledger constraints are what make
  // this CORRECT under retries; this limiter is so a flood can't make the
  // database the thing that absorbs the attack.
  const limited = await enforceDbRateLimit(
    request,
    "withdraw",
    session.user.id,
    10,
    60_000
  );
  if (limited) return limited;

  return withIdempotency(request, session.user.id, async () => {
  try {
    const body = await request.json();
    const { amount } = body;
    let method = body.method;
    let accountDetails = body.accountDetails;

    // The client sends the saved method's id (`methodId`). Resolve it
    // server-side so we trust the stored enum + account details (never the
    // client-supplied ones) and confirm the method belongs to this user.
    if (body.methodId) {
      const pm = await prisma.userPaymentMethod.findFirst({
        where: { id: body.methodId, userId: session.user.id },
        select: { method: true, accountNumber: true, accountName: true },
      });
      if (!pm) {
        return NextResponse.json(
          { error: "Payment method not found" },
          { status: 400 }
        );
      }
      method = pm.method;
      accountDetails = {
        accountNumber: pm.accountNumber,
        accountName: pm.accountName ?? undefined,
      };
    }

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
        cashBalance: true,
        kycStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admin-configured limits + fee (Financial settings ∪ the user's package),
    // the SAME source the client display uses — so they always agree.
    const wcfg = await getWithdrawalConfig(session.user.id);
    if (!wcfg.enabled) {
      return NextResponse.json(
        {
          error: wcfg.subscriptionRequired
            ? "An active subscription is required to withdraw."
            : "Withdrawals are disabled for your plan",
        },
        { status: 403 }
      );
    }
    if (amount < wcfg.min) {
      return NextResponse.json(
        { error: `Minimum withdrawal is $${wcfg.min}` },
        { status: 400 }
      );
    }
    if (amount > wcfg.max) {
      return NextResponse.json(
        { error: `Maximum withdrawal is $${wcfg.max}` },
        { status: 400 }
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

    // Withdrawals now draw from the withdrawable CASH balance (USD). Points are
    // earned separately and must be converted to cash first (see /api/wallet/convert);
    // only cash is withdrawable under the unified wallet model.
    const availableCash = toNum(user.cashBalance);

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

    // Pending/processing withdrawals already decremented cashBalance at request
    // time (the CAS hold below), so the current balance already excludes them —
    // this pre-check is just for a friendly error; the atomic CAS is the guard.
    if (amount > availableCash) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    // Calculate fee — admin-configured percentage (package discount already
    // applied in getWithdrawalConfig), matching what the client showed.
    const fee = amount * (wcfg.feePct / 100);
    const netAmount = amount - fee;

    // Atomic + no-overspend: hold the CASH with a CAS guard, then create the
    // withdrawal + transaction in ONE transaction. Concurrent requests can't
    // both pass (the second matches 0 rows and aborts) → no overdraft race.
    let withdrawal;
    try {
      withdrawal = await prisma.$transaction(async (tx) => {
        const held = await tx.user.updateMany({
          where: { id: session.user.id, cashBalance: { gte: amount } },
          data: { cashBalance: { decrement: amount } },
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
            points: 0,
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
        message: `Your withdrawal request for ${usd(amount)} via ${method} has been submitted and is pending approval. You'll receive your funds within ${wcfg.payoutMessage} after approval.`,
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
        estimatedProcessingTime: wcfg.payoutMessage,
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
