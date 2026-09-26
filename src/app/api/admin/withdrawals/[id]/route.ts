import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { runAchievementCheck } from "@/lib/achievements";
import { toNum } from "@/lib/money";
import { can } from "@/lib/permissions";
import { deliverToUser } from "@/lib/notify";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { ownMediaKey } from "@/lib/media-url";
import type { CelebrationPayload } from "@/lib/celebration";

/** A file in this platform's own media store — never an arbitrary link. */
function isOwnMediaUrl(u: string): boolean {
  return ownMediaKey(u) !== null || /^\/api\/media\/(media|task-proofs)\/[\w./-]+$/.test(u);
}

const METHOD_LABEL: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BINANCE: "Binance",
  BITGET: "Bitget",
  PAYPAL: "PayPal",
};
const methodLabel = (m: string) => METHOD_LABEL[m] ?? m.replace(/_/g, " ").toLowerCase();

/** " ending 4321", from whatever the account details hold — never the full number. */
function accountTail(details: unknown): string {
  const d = (details ?? {}) as Record<string, unknown>;
  const raw = [d.accountNumber, d.number, d.phone, d.account, d.address, d.email].find(
    (v) => typeof v === "string" && v.trim()
  );
  if (typeof raw !== "string") return "";
  const t = raw.replace(/\s+/g, "");
  return t.length > 4 ? ` ending ${t.slice(-4)}` : "";
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Shown when a status compare-and-set matched nothing — another admin (or a
 * retried request) already moved this withdrawal on. Deliberately specific:
 * "Failed to process withdrawal" would invite the operator to try again, and on
 * this route a second attempt used to be how money escaped.
 */
const ALREADY_HANDLED =
  "This withdrawal was already actioned by someone else. Reload to see its current status.";

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
    // Recorded with a payment and shown to the user: the account the money was
    // sent from, and up to five screenshots of the payment. Screenshots must be
    // files uploaded to this platform (the media library), never an arbitrary
    // link that would be put in front of the user.
    const paidFrom =
      typeof body.paidFrom === "string" && body.paidFrom.trim() ? body.paidFrom.trim().slice(0, 200) : null;
    const note = typeof adminNote === "string" && adminNote.trim() ? adminNote.trim().slice(0, 2000) : null;
    const proofIn: unknown[] = Array.isArray(body.proofUrls) ? body.proofUrls : [];
    const proofUrls = proofIn
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => u.trim());
    if (proofUrls.length > 5 || proofUrls.some((u) => !isOwnMediaUrl(u))) {
      return NextResponse.json(
        { error: "Payment screenshots must be up to 5 files uploaded here (use the upload button)." },
        { status: 400 }
      );
    }

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

      // Move to PROCESSING — admin will send payment then mark_paid.
      // The status check above reads a row fetched earlier, so it is
      // check-then-act; the predicate here is what actually decides. See the
      // note on `mark_paid` for why that matters on this route.
      const claimed = await prisma.withdrawal.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          processedBy: session.user.id,
          transactionId: transactionId || null,
        },
      });
      if (claimed.count === 0) {
        return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
      }
      const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_APPROVED",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Approved a ${usd(toNum(existingWithdrawal.netAmount))} withdrawal (processing)`,
        meta: { adminNote: adminNote ?? null, transactionId: transactionId ?? null },
      });

      void deliverToUser({
        userId: existingWithdrawal.userId,
        title: "Your withdrawal is being processed",
        message: `Your withdrawal of ${usd(existingWithdrawal.netAmount)} to ${methodLabel(existingWithdrawal.method)} was approved. We will send the payment and email you the reference when it is done.`,
        link: "/withdrawal#history",
        transactional: true,
        style: "UPDATE",
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

      // Interactive, opening with a status compare-and-set.
      //
      // What this replaced: an array `$transaction` whose withdrawal update had
      // no status predicate, gated only by the check-then-act above against a
      // row read at the top of the handler. Because `mark_paid` and `reject`
      // write DIFFERENT ledger references (`<id>` vs `withdrawal_refund_<id>`),
      // the `@@unique([userId, reference])` guard did not catch the cross-action
      // race — so an admin rejecting while another marked paid produced BOTH: the
      // money was sent off-platform AND the user was refunded in full. Real cash,
      // gone, with no error anywhere.
      const withdrawal = await prisma.$transaction(async (tx) => {
        const claimed = await tx.withdrawal.updateMany({
          where: { id, status: "PROCESSING" },
          data: {
            status: "COMPLETED",
            processedBy: session.user.id,
            processedAt: new Date(),
            transactionId,
            adminNote: note,
            paidFrom,
            paymentProof: proofUrls,
          },
        });
        if (claimed.count === 0) return null;

        await tx.user.update({
          where: { id: existingWithdrawal.userId },
          data: {
            totalWithdrawals: { increment: existingWithdrawal.amount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WITHDRAWAL",
            status: "COMPLETED",
            points: 0,
            amount: -existingWithdrawal.amount,
            description: `Withdrawal via ${existingWithdrawal.method}`,
            reference: id,
          },
        });
        await tx.notification.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WALLET",
            title: "Withdrawal completed",
            message: `Your withdrawal of ${usd(existingWithdrawal.netAmount)} via ${existingWithdrawal.method} has been paid. Reference: ${transactionId}`,
            // "Payment received" is a moment worth a popup, not only a bell row.
            popup: true,
            data: {
              withdrawalId: id,
              popup: {
                kind: "payment",
                headline: "Payment sent to you",
                amount: usd(existingWithdrawal.netAmount),
                sub: `via ${methodLabel(existingWithdrawal.method)} · Ref ${String(transactionId).trim()}`,
                cta: { label: "See the details", href: "/withdrawal#history" },
              } satisfies CelebrationPayload,
            } as object,
          },
        });
        return tx.withdrawal.findUnique({ where: { id } });
      });

      if (!withdrawal) {
        return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
      }

      // A completed withdrawal is what `withdrawals_made` counts. Best-effort —
      // it can never fail a payout that has already gone out.
      void runAchievementCheck(existingWithdrawal.userId);

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_PAID",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Marked a ${usd(toNum(existingWithdrawal.netAmount))} withdrawal as paid`,
        meta: { transactionId, adminNote: note, paidFrom, proofCount: proofUrls.length },
      });

      // The payment receipt. Transactional: it goes out even to a user who
      // turned notification emails off — they need to know they were paid, and
      // with what reference, to find the money in their own account.
      void deliverToUser({
        userId: existingWithdrawal.userId,
        title: "Your withdrawal has been paid",
        message: [
          `We sent ${usd(existingWithdrawal.netAmount)} to your ${methodLabel(existingWithdrawal.method)} account${accountTail(existingWithdrawal.accountDetails)}.`,
          `Payment reference: ${String(transactionId).trim()}`,
          paidFrom ? `Sent from: ${paidFrom}` : null,
          toNum(existingWithdrawal.fee) > 0
            ? `Requested ${usd(existingWithdrawal.amount)} − fee ${usd(existingWithdrawal.fee)} = ${usd(existingWithdrawal.netAmount)}.`
            : null,
          note ? `Note from our team: ${note}` : null,
          proofUrls.length ? "A screenshot of the payment is attached to this withdrawal under My withdrawals." : null,
        ]
          .filter(Boolean)
          .join("\n"),
        link: "/withdrawal#history",
        transactional: true,
        style: "SUCCESS",
      });

      // A cut to whoever invited them, if the admin has that on. Paid on the
      // GROSS amount, and only once the money has actually gone out — a bonus
      // for a payout that later failed would have to be clawed back. Outside
      // the transaction and fire-and-forget: this must never be able to fail a
      // withdrawal that is already marked paid.
      void import("@/lib/referral-bonus").then(({ awardReferralMoneyBonus }) =>
        awardReferralMoneyBonus(
          existingWithdrawal.userId,
          "WITHDRAWAL",
          toNum(existingWithdrawal.amount),
          id
        ).catch(() => {})
      );

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

      // Same compare-and-set as `mark_paid`, and for the same reason: these two
      // actions race each other and their differing ledger references meant the
      // unique constraint never noticed.
      const withdrawal = await prisma.$transaction(async (tx) => {
        const claimed = await tx.withdrawal.updateMany({
          where: { id, status: { in: ["PENDING", "PROCESSING"] } },
          data: {
            status: "REJECTED",
            processedBy: session.user.id,
            processedAt: new Date(),
            rejectionReason: rejectionReason || "Rejected by admin",
          },
        });
        if (claimed.count === 0) return null;

        await tx.user.update({
          where: { id: existingWithdrawal.userId },
          data: {
            pointsBalance: { increment: refundPoints },
            cashBalance: { increment: refundCash },
          },
        });
        await tx.transaction.create({
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
        });
        await tx.notification.create({
          data: {
            userId: existingWithdrawal.userId,
            type: "WALLET",
            title: "Withdrawal rejected",
            message: `Your withdrawal of ${usd(existingWithdrawal.amount)} was rejected and refunded. Reason: ${
              rejectionReason || "Not specified"
            }${adminNote ? `\n\n${adminNote}` : ""}`,
          },
        });
        return tx.withdrawal.findUnique({ where: { id } });
      });

      if (!withdrawal) {
        return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
      }

      await writeAudit({
        actorId: session.user.id,
        action: "WITHDRAWAL_REJECTED",
        entity: "Withdrawal",
        entityId: id,
        targetUserId: existingWithdrawal.userId,
        summary: `Rejected & refunded a ${usd(toNum(existingWithdrawal.amount))} withdrawal`,
        meta: { rejectionReason: rejectionReason ?? null, adminNote: adminNote ?? null },
      });

      // Rejection is a service notice too: their money came back and they
      // should know why.
      void deliverToUser({
        userId: existingWithdrawal.userId,
        title: "Your withdrawal was not paid — money returned",
        message: [
          `Your withdrawal of ${usd(existingWithdrawal.amount)} to ${methodLabel(existingWithdrawal.method)} was rejected, and the full amount is back in your wallet.`,
          rejectionReason ? `Reason: ${rejectionReason}` : null,
          note ? `Note from our team: ${note}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        link: "/withdrawal#history",
        transactional: true,
        style: "IMPORTANT",
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
    // A replayed request reuses the same ledger reference → P2002 on
    // (userId, reference). The first attempt already settled; say so rather
    // than returning a 500 the operator will retry.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
    }
    console.error("Error processing withdrawal:", error);
    return NextResponse.json(
      { error: "Failed to process withdrawal" },
      { status: 500 }
    );
  }
}
