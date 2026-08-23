import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments";

/**
 * Initiate a hosted-checkout deposit through any configured provider
 * (SSLCommerz, bKash, …). Creates a PENDING deposit, asks the provider for a
 * redirect URL, and persists the provider's gatewayRef so the callback can
 * settle it. Degrades to 400 when the chosen provider isn't configured so the
 * UI can fall back to a manual method.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }

  const providerKey = String(body.provider ?? "sslcommerz").toLowerCase();
  const provider = getPaymentProvider(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Unknown payment provider" }, { status: 400 });
  }
  if (!(await provider.isConfigured())) {
    return NextResponse.json(
      { error: `${provider.label} isn't available right now. Use a manual method.` },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const tranId = `dep_${session.user.id.slice(0, 8)}_${Date.now()}`;

  const deposit = await prisma.deposit.create({
    data: {
      userId: session.user.id,
      amount,
      method: provider.key.toUpperCase(),
      status: "PENDING",
      gatewayRef: tranId,
    },
  });

  try {
    const { redirectUrl, gatewayRef } = await provider.initCheckout({
      amount,
      depositId: deposit.id,
      tranId,
      appUrl,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
    });

    // The provider may hand back its own reference (e.g. bKash paymentID) —
    // persist it so the callback can match this deposit.
    if (gatewayRef && gatewayRef !== tranId) {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { gatewayRef },
      });
    }

    return NextResponse.json({ redirectUrl, depositId: deposit.id });
  } catch (err) {
    // This is a ROLLBACK, not a notification: it marks the deposit dead after
    // the gateway couldn't be reached. Swallowing a failure here silently leaves
    // a PENDING deposit with no gateway reference — a row an admin will later
    // find and have no way to explain. Log it so it is at least findable.
    await prisma.deposit
      .update({
        where: { id: deposit.id },
        data: { status: "REJECTED", adminNote: "Gateway init failed" },
      })
      .catch((rollbackErr) => {
        console.error(
          `[deposit] gateway init failed AND the rollback failed for deposit ${deposit.id} — it is stuck PENDING:`,
          rollbackErr
        );
      });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gateway unreachable" },
      { status: 502 }
    );
  }
  });
}
