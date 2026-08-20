import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { getEnabledDepositMethods } from "@/lib/deposit-methods";
import { toNum } from "@/lib/money";

/** List the current user's deposits. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deposits = await prisma.deposit.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // amount is a Prisma Decimal → serializes to a string; the client does
  // amount.toFixed(), so convert to a real number here (else the page crashes).
  return NextResponse.json({
    deposits: deposits.map((d) => ({ ...d, amount: toNum(d.amount) })),
  });
}

/** Create a manual deposit request (PENDING → admin approves and credits). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Money route. `withIdempotency` + the unique ledger constraints are what make
  // this CORRECT under retries; this limiter is so a flood can't make the
  // database the thing that absorbs the attack.
  const limited = await enforceDbRateLimit(
    request,
    "deposit",
    session.user.id,
    10,
    60_000
  );
  if (limited) return limited;

  return withIdempotency(request, session.user.id, async () => {
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const method = String(body.method || "");
  const txnId = body.txnId ? String(body.txnId).trim() : null;
  const proofUrl = body.proofUrl ? String(body.proofUrl).trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  // Validate against the admin-configured, enabled deposit methods.
  const enabled = await getEnabledDepositMethods();
  const picked = enabled.find((m) => m.key === method);
  if (!picked) {
    return NextResponse.json({ error: "Invalid or unavailable payment method" }, { status: 400 });
  }
  if (amount < picked.minAmount || (picked.maxAmount > 0 && amount > picked.maxAmount)) {
    return NextResponse.json(
      { error: `${picked.label}: amount must be $${picked.minAmount}–$${picked.maxAmount}.` },
      { status: 400 }
    );
  }
  if (!txnId) {
    return NextResponse.json(
      { error: "Transaction ID is required" },
      { status: 400 }
    );
  }

  const deposit = await prisma.deposit.create({
    data: {
      userId: session.user.id,
      amount,
      method: picked.key,
      txnId,
      proofUrl,
      status: "PENDING",
    },
  });

  return NextResponse.json({ success: true, deposit });
  });
}
