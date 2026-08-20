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

  if (!success || !amountOk) {
    if (deposit.status === "PENDING") {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "REJECTED", adminNote: "Gateway payment not completed" },
      });
    }
    return NextResponse.redirect(`${APP_URL}/wallet?deposit=failed`);
  }

  // Credit once. The `status === "PENDING"` check is check-then-act, so two
  // concurrent gateway callbacks could both pass it; the ledger's unique
  // (userId, reference) on `deposit_<id>` makes the loser fail with P2002, which
  // we swallow — the deposit is already credited, so fall through to success.
  if (deposit.status === "PENDING") {
    try {
      await prisma.$transaction([
        prisma.deposit.update({
          where: { id: deposit.id },
          data: { status: "APPROVED", reviewedAt: new Date() },
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
            description: `Deposit via ${provider.label}`,
            reference: `deposit_${deposit.id}`,
          },
        }),
      ]);
      void deliverToUser({
        userId: deposit.userId,
        title: "Deposit approved",
        message: `${usd(deposit.amount)} has been added to your balance.`,
        link: "/wallet",
      });
    } catch (err) {
      if (!isDuplicateLedgerError(err)) throw err;
    }
  }

  return NextResponse.redirect(`${APP_URL}/wallet?deposit=success`);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
