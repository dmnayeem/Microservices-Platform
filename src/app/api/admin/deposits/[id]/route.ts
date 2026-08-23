import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { deliverToUser } from "@/lib/notify";
import { isDuplicateLedgerError } from "@/lib/idempotency";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** See the note on the approve path — a retry here must not read as a failure. */
const ALREADY_REVIEWED =
  "This deposit was already reviewed by someone else. Reload to see its current status.";

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
    const rejected = await prisma.deposit.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", adminNote, reviewedBy: session.user.id, reviewedAt: new Date() },
    });
    if (rejected.count === 0) {
      return NextResponse.json({ error: ALREADY_REVIEWED }, { status: 409 });
    }
    void deliverToUser({
      userId: deposit.userId,
      title: "Deposit rejected",
      message: `Your deposit of ${usd(deposit.amount)} was not approved.${adminNote ? ` ${adminNote}` : ""}`,
      link: "/wallet",
    });
    await writeAudit({
      actorId: session.user.id,
      action: "DEPOSIT_REJECTED",
      entity: "Deposit",
      entityId: id,
      targetUserId: deposit.userId,
      summary: `Rejected a ${usd(deposit.amount)} deposit${adminNote ? ` — ${adminNote}` : ""}`,
      meta: { amount: Number(deposit.amount), method: deposit.method, adminNote },
    });
    return NextResponse.json({ success: true });
  }

  // Approve → credit cash balance + record transaction.
  //
  // The status predicate on the deposit update is what makes this idempotent —
  // the comment here used to claim "idempotent via status guard" above a plain
  // `update({ where: { id } })`, whose only guard was the check-then-act read
  // above. The ledger's unique reference did stop a genuine double-credit, but
  // it surfaced as an uncaught 500 rather than a clear message, which invites
  // exactly the retry that shouldn't happen on a money route.
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.deposit.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "APPROVED", adminNote, reviewedBy: session.user.id, reviewedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("ALREADY_REVIEWED");

      await tx.user.update({
        where: { id: deposit.userId },
        data: { cashBalance: { increment: deposit.amount } },
      });
      await tx.transaction.create({
        data: {
          userId: deposit.userId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.COMPLETED,
          points: 0,
          amount: deposit.amount,
          description: `Deposit via ${deposit.method}`,
          reference: `deposit_${deposit.id}`,
        },
      });
      await tx.notification.create({
        data: {
          userId: deposit.userId,
          type: "WALLET",
          title: "Deposit approved",
          message: `${usd(deposit.amount)} has been added to your balance.`,
        },
      });
    });
  } catch (error) {
    if (
      isDuplicateLedgerError(error) ||
      (error instanceof Error && error.message === "ALREADY_REVIEWED")
    ) {
      return NextResponse.json({ error: ALREADY_REVIEWED }, { status: 409 });
    }
    throw error;
  }

  void deliverToUser({
    userId: deposit.userId,
    title: "Deposit approved",
    message: `${usd(deposit.amount)} has been added to your balance.`,
    link: "/wallet",
  });

  await writeAudit({
    actorId: session.user.id,
    action: "DEPOSIT_APPROVED",
    entity: "Deposit",
    entityId: id,
    targetUserId: deposit.userId,
    summary: `Approved a ${usd(deposit.amount)} deposit (credited cash)`,
    meta: { amount: Number(deposit.amount), method: deposit.method, adminNote },
  });

  return NextResponse.json({ success: true });
}
