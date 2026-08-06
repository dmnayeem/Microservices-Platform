import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { deliverToUser } from "@/lib/notify";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Admin: approve (credit cashBalance) or reject a pending deposit. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "withdrawals.process"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  const adminNote = body.adminNote ? String(body.adminNote) : null;
  if (!action) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const deposit = await prisma.deposit.findUnique({ where: { id } });
  if (!deposit) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }
  if (deposit.status !== "PENDING") {
    return NextResponse.json({ error: "Deposit already reviewed" }, { status: 400 });
  }

  if (action === "reject") {
    await prisma.deposit.update({
      where: { id },
      data: { status: "REJECTED", adminNote, reviewedBy: session.user.id, reviewedAt: new Date() },
    });
    void deliverToUser({
      userId: deposit.userId,
      title: "Deposit rejected",
      message: `Your deposit of $${deposit.amount.toFixed(2)} was not approved.${adminNote ? ` ${adminNote}` : ""}`,
      link: "/wallet",
    });
    return NextResponse.json({ success: true });
  }

  // Approve → credit cash balance + record transaction (idempotent via status guard).
  await prisma.$transaction([
    prisma.deposit.update({
      where: { id },
      data: { status: "APPROVED", adminNote, reviewedBy: session.user.id, reviewedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: { cashBalance: { increment: deposit.amount } },
    }),
    prisma.transaction.create({
      data: {
        userId: deposit.userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        points: 0,
        amount: deposit.amount,
        description: `Deposit via ${deposit.method}`,
        reference: `deposit_${deposit.id}`,
      },
    }),
    prisma.notification.create({
      data: {
        userId: deposit.userId,
        type: "WALLET",
        title: "Deposit approved",
        message: `$${deposit.amount.toFixed(2)} has been added to your balance.`,
      },
    }),
  ]);

  void deliverToUser({
    userId: deposit.userId,
    title: "Deposit approved",
    message: `$${deposit.amount.toFixed(2)} has been added to your balance.`,
    link: "/wallet",
  });

  return NextResponse.json({ success: true });
}
