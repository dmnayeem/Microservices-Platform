import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";

const MANUAL_METHODS = new Set([
  "MANUAL_BKASH",
  "MANUAL_NAGAD",
  "MANUAL_ROCKET",
  "MANUAL_BANK",
]);

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
  return NextResponse.json({ deposits });
}

/** Create a manual deposit request (PENDING → admin approves and credits). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(request, session.user.id, async () => {
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const method = String(body.method || "");
  const txnId = body.txnId ? String(body.txnId).trim() : null;
  const proofUrl = body.proofUrl ? String(body.proofUrl).trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  if (!MANUAL_METHODS.has(method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
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
      method,
      txnId,
      proofUrl,
      status: "PENDING",
    },
  });

  return NextResponse.json({ success: true, deposit });
  });
}
