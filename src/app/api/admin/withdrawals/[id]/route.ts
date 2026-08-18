import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import { can } from "@/lib/permissions";
import { deliverToUser } from "@/lib/notify";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "withdrawals.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            level: true,
            kycStatus: true,
            package: { select: { slug: true, name: true } },
            cashBalance: true,
            totalWithdrawals: true,
          },
        },
      },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    }

    return NextResponse.json({
      withdrawal: {
        ...withdrawal,
        amount: toNum(withdrawal.amount),
        fee: toNum(withdrawal.fee),
        netAmount: toNum(withdrawal.netAmount),
      },
    });
  } catch (error) {
    console.error("Error fetching withdrawal:", error);
    return NextResponse.json(
      { error: "Failed to fetch withdrawal" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "withdrawals.process"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, transactionId, rejectionReason, adminNote } = body;

    // Check if withdrawal exists
    const existingWithdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existingWithdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    }

    // Status-aware action validation per admin_oo.md §5.07
    // PENDING → PROCESSING ('approve') or REJECTED ('reject')
    // PROCESSING → COMPLETED ('mark_paid') or REJECTED ('reject')
    if (action === "approve") {
      if (existingWithdrawal.status !== "PENDING") {
        return NextResponse.json(
          { error: "Only PENDING withdrawals can be approved" },
          { status: 400 }
        );
      }

      // Move to PROCESSING — admin will send payment then mark_paid
      const withdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: "PROCESSING",
          processedBy: session.user.id,
          transactionId: transactionId || null,
        },
      });

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_APPROVED",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Approved a $${toNum(existingWithdrawal.netAmount).toFixed(2)} withdrawal (processing)`,
        meta: { adminNote: adminNote ?? null, transactionId: transactionId ?? null },
      });

      return NextResponse.json({
        success: true,
        withdrawal,
        message: "Withdrawal approved & marked as Processing",
      });
    } else if (action === "mark_paid" || action === "complete") {
      if (existingWithdrawal.status !== "PROCESSING") {
        return NextResponse.json(
          { error: "Only PROCESSING withdrawals can be marked paid" },
          { status: 400 }
        );
      }
      if (!transactionId || !String(transactionId).trim()) {
        return NextResponse.json(
          { error: "Transaction reference is required to mark as paid" },
          { status: 400 }
        );
      }

      const [withdrawal] = await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id },
          data: {
            status: "COMPLETED",
            processedBy: session.user.id,
            processedAt: new Date(),
            transactionId,
          },
        }),
        prisma.user.update({
          where: { id: existingWithdrawal.userId },
          data: {
            totalWithdrawals: { increment: existingWithdrawal.amount },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WITHDRAWAL",
            status: "COMPLETED",
            points: 0,
            amount: -existingWithdrawal.amount,
            description: `Withdrawal via ${existingWithdrawal.method}`,
            reference: id,
          },
        }),
        prisma.notification.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WALLET",
            title: "Withdrawal completed",
            message: `Your withdrawal of $${existingWithdrawal.netAmount.toFixed(
              2
            )} via ${existingWithdrawal.method} has been paid. Reference: ${transactionId}`,
          },
        }),
      ]);

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_PAID",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Marked a $${toNum(existingWithdrawal.netAmount).toFixed(2)} withdrawal as paid`,
        meta: { transactionId, adminNote: adminNote ?? null },
      });

      void deliverToUser({
        userId: existingWithdrawal.userId,
        title: "Withdrawal completed",
        message: `Your withdrawal of $${existingWithdrawal.netAmount.toFixed(2)} via ${existingWithdrawal.method} has been paid.`,
        link: "/wallet",
      });

      return NextResponse.json({
        success: true,
        withdrawal,
        message: "Withdrawal marked as paid",
      });
    } else if (action === "reject") {
      if (
        existingWithdrawal.status !== "PENDING" &&
        existingWithdrawal.status !== "PROCESSING"
      ) {
        return NextResponse.json(
          { error: "Only PENDING or PROCESSING withdrawals can be rejected" },
          { status: 400 }
        );
      }

      // Refund in the SAME currency the hold was taken in. New withdrawals hold
      // CASH (txn points == 0, amount < 0); legacy in-flight withdrawals held
      // POINTS (txn points < 0). Read the original WITHDRAWAL transaction and
      // refund accordingly — never mint the other currency.
      const debitTx = await prisma.transaction.findFirst({
        where: { reference: `withdrawal_${id}`, type: "WITHDRAWAL" },
        select: { points: true },
      });
      const heldPoints = debitTx ? Math.abs(debitTx.points) : 0;
      const refundPoints = heldPoints > 0 ? heldPoints : 0;
      // Cash hold when no points were held (new-style). Refund the gross amount.
      const refundCash = heldPoints > 0 ? 0 : toNum(existingWithdrawal.amount);

      const [withdrawal] = await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id },
          data: {
            status: "REJECTED",
            processedBy: session.user.id,
            processedAt: new Date(),
            rejectionReason: rejectionReason || "Rejected by admin",
          },
        }),
        prisma.user.update({
          where: { id: existingWithdrawal.userId },
          data: {
            pointsBalance: { increment: refundPoints },
            cashBalance: { increment: refundCash },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "REFUND",
            status: "COMPLETED",
            points: refundPoints,
            amount: refundCash,
            description: `Withdrawal rejected: ${
              rejectionReason || "Rejected by admin"
            }`,
            reference: `withdrawal_refund_${id}`,
          },
        }),
        prisma.notification.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WALLET",
            title: "Withdrawal rejected",
            message: `Your withdrawal of $${existingWithdrawal.amount.toFixed(
              2
            )} was rejected and refunded. Reason: ${
              rejectionReason || "Not specified"
            }${adminNote ? `\n\n${adminNote}` : ""}`,
          },
        }),
      ]);

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_REJECTED",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Rejected & refunded a $${toNum(existingWithdrawal.amount).toFixed(2)} withdrawal`,
        meta: { rejectionReason: rejectionReason ?? null, adminNote: adminNote ?? null },
      });

      return NextResponse.json({
        success: true,
        withdrawal,
        message: "Withdrawal rejected and refunded",
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    return NextResponse.json(
      { error: "Failed to process withdrawal" },
      { status: 500 }
    );
  }
}
