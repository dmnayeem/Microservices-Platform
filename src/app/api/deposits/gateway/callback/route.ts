import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { toNum } from "@/lib/money";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { deliverToUser } from "@/lib/notify";
import { getPaymentProvider } from "@/lib/payments";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Hosted-checkout success/fail/IPN callback for any provider. Merges query +
 * form params, asks the provider to verify (bKash runs "execute" here), then
 * credits the matching PENDING deposit exactly once (status guard + unique
 * `deposit_<id>` reference). Real SSLCommerz deployments should also validate
 * val_id against their API before crediting.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  try {
    const form = await request.formData();
    for (const [k, v] of form.entries()) params[k] = String(v);
  } catch {
    // IPN may send JSON or query only — query params already captured.
  }

  const provider = getPaymentProvider(params.provider ?? "sslcommerz");
  if (!provider) {
    return NextResponse.redirect(`${APP_URL}/wallet?deposit=error`);
  }

  const { success, gatewayRef, amount: paidAmount } = await provider
    .verifyCallback({ params })
    .catch(() => ({
      success: false,
      gatewayRef: params.tran_id ?? params.paymentID ?? "",
      amount: undefined as number | undefined,
    }));

  if (!gatewayRef) {
    return NextResponse.redirect(`${APP_URL}/wallet?deposit=error`);
  }

  const deposit = await prisma.deposit.findFirst({ where: { gatewayRef } });
  if (!deposit) {
    return NextResponse.redirect(`${APP_URL}/wallet?deposit=notfound`);
  }

  // Cross-check the gateway-validated paid amount against what we recorded — a
  // mismatch (tampered/underpaid) is never credited.
  const amountOk =
    paidAmount === undefined ||
    Math.abs(Number(paidAmount) - toNum(deposit.amount)) <= 0.01;

  // Never credited, and never written either: this URL is public, so a
  // failed "verification" is exactly what anyone replaying a transaction id
  // would produce. Rejecting on it let a stranger void someone's deposit
  // while the real payment was still going through. A deposit that never
  // completes simply stays PENDING for the admin.
  if (!success || !amountOk) {
    return NextResponse.redirect(`${APP_URL}/wallet?deposit=failed`);
  }

  // Credit once. The `status === "PENDING"` read above is check-then-act, so
  // two concurrent gateway callbacks could both pass it. The approve is a
  // compare-and-set (`updateMany where status PENDING`): only the callback that
  // actually flips the row may credit; the loser sees count 0 and credits
  // nothing. The unique `deposit_<id>` ledger reference stays as a backstop.
  if (deposit.status === "PENDING") {
    try {
      const credited = await prisma.$transaction(async (tx) => {
        const flip = await tx.deposit.updateMany({
          where: { id: deposit.id, status: "PENDING" },
          data: { status: "APPROVED", reviewedAt: new Date() },
        });
        if (flip.count === 0) return false;
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
            description: `Deposit via ${provider.label}`,
            reference: `deposit_${deposit.id}`,
          },
        });
        return true;
      });
      if (credited) {
        void deliverToUser({ category: "money",
          userId: deposit.userId,
          title: "Deposit approved",
          message: `${usd(deposit.amount)} has been added to your balance.`,
          link: "/wallet",
        });
      }
    } catch (err) {
      if (!isDuplicateLedgerError(err)) throw err;
    }
  }

  return NextResponse.redirect(`${APP_URL}/wallet?deposit=success`);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
