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

  // The amount the admin says actually arrived. A manual deposit's `amount` is
  // typed in by the USER, so it is a claim, not a fact — the bank slip is the
  // fact. Without this the admin's only options were to credit a number they
  // knew was wrong or to reject a real payment.
  const rawCorrected =
    body.amount === undefined || body.amount === null || body.amount === ""
      ? null
      : Number(body.amount);
  if (
    rawCorrected !== null &&
    (!Number.isFinite(rawCorrected) || rawCorrected <= 0 || rawCorrected > 1_000_000)
  ) {
    return NextResponse.json(
      { error: "Enter the amount actually received, greater than 0." },
      { status: 400 }
    );
  }
  // Decimal(18, 6) column, but money the admin reads off a slip is 2dp.
  const correctedAmount =
    rawCorrected === null ? null : Math.round(rawCorrected * 100) / 100;

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
    void deliverToUser({ category: "money",
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
  const requestedAmount = Number(deposit.amount);
  const creditedAmount = correctedAmount ?? requestedAmount;
  const wasCorrected =
    correctedAmount !== null &&
    Math.abs(correctedAmount - requestedAmount) >= 0.005;

  // A silently altered amount is worse than no correction at all, so the
  // original travels with the record: in the note the user sees on their own
  // deposit, in the ledger row's metadata, and in the audit trail below.
  const correctionNote = wasCorrected
    ? `Amount corrected from ${usd(requestedAmount)} to ${usd(creditedAmount)}.`
    : null;
  const finalNote =
    [correctionNote, adminNote].filter(Boolean).join(" ") || null;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.deposit.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "APPROVED",
          // The row is what finance reconciles against, so it carries the
          // amount that was actually credited — never the user's claim with a
          // different number quietly in the ledger beside it.
          ...(wasCorrected ? { amount: creditedAmount } : {}),
          adminNote: finalNote,
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw new Error("ALREADY_REVIEWED");

      await tx.user.update({
        where: { id: deposit.userId },
        data: { cashBalance: { increment: creditedAmount } },
      });
      await tx.transaction.create({
        data: {
          userId: deposit.userId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.COMPLETED,
          points: 0,
          amount: creditedAmount,
          description: `Deposit via ${deposit.method}`,
          // Unchanged, and the whole idempotency story: a deposit already
          // credited collides here whatever amount the second attempt names.
          reference: `deposit_${deposit.id}`,
          ...(wasCorrected
            ? {
                metadata: {
                  correctedBy: session.user.id,
                  requestedAmount,
                  creditedAmount,
                },
              }
            : {}),
        },
      });
      await tx.notification.create({
        data: {
          userId: deposit.userId,
          type: "WALLET",
          title: "Deposit approved",
          message: wasCorrected
            ? `${usd(creditedAmount)} has been added to your balance. You submitted ${usd(requestedAmount)}; an admin adjusted it to the amount actually received.`
            : `${usd(creditedAmount)} has been added to your balance.`,
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

  void deliverToUser({ category: "money",
    userId: deposit.userId,
    title: "Deposit approved",
    message: wasCorrected
      ? `${usd(creditedAmount)} has been added to your balance (adjusted from the ${usd(requestedAmount)} you submitted).`
      : `${usd(creditedAmount)} has been added to your balance.`,
    link: "/wallet",
  });

  // A cut of the deposit to whoever invited them, if the admin has that on.
  // AFTER the transaction commits and fire-and-forget: a referral bonus must
  // never be able to fail a deposit that has already been credited.
  void import("@/lib/referral-bonus").then(({ awardReferralMoneyBonus }) =>
    // The CORRECTED amount: the referrer's cut is a percentage of money that
    // actually arrived, not of a number the invitee typed.
    awardReferralMoneyBonus(deposit.userId, "DEPOSIT", creditedAmount, id).catch(
      () => {}
    )
  );

  if (wasCorrected) {
    // Its own row, with `targetUserId` set, so the change is visible on the
    // affected account's activity feed and not only on the deposit record.
    await writeAudit({
      actorId: session.user.id,
      action: "DEPOSIT_AMOUNT_CORRECTED",
      entity: "Deposit",
      entityId: id,
      targetUserId: deposit.userId,
      summary: `Corrected a deposit from ${usd(requestedAmount)} to ${usd(creditedAmount)} before approving`,
      meta: {
        requestedAmount,
        creditedAmount,
        delta: Math.round((creditedAmount - requestedAmount) * 100) / 100,
        method: deposit.method,
        adminNote,
      },
    });
  }

  await writeAudit({
    actorId: session.user.id,
    action: "DEPOSIT_APPROVED",
    entity: "Deposit",
    entityId: id,
    targetUserId: deposit.userId,
    summary: `Approved a ${usd(creditedAmount)} deposit (credited cash)${wasCorrected ? ` — user submitted ${usd(requestedAmount)}` : ""}`,
    meta: {
      amount: creditedAmount,
      requestedAmount,
      corrected: wasCorrected,
      method: deposit.method,
      adminNote,
    },
  });

  return NextResponse.json({ success: true });
}
