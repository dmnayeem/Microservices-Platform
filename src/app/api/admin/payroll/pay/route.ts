import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { usd } from "@/lib/utils";
import { isPeriod, payPayroll, type PayKind } from "@/lib/payroll/run";

/**
 * Pay one staff member one component of one period.
 *
 * The amount is never taken from the request. The client sends who, which
 * period and which component; the server recomputes what is owed from the saved
 * rates and the measured activity. A client that could name the amount is a
 * client that can pay itself anything.
 *
 * The payment credits the staff member's platform wallet — the only payout rail
 * this codebase has — and is idempotent on `payroll_<kind>_<period>` through the
 * ledger's unique reference, so a retry cannot pay twice.
 */

const REASONS: Record<string, string> = {
  DISABLED: "Payroll is switched off. Turn it on before paying anyone.",
  NOT_STAFF: "That account is not on the payroll sheet for this period.",
  NOTHING_OWED: "Nothing is owed for that period.",
  ALREADY_PAID: "Already paid for that period.",
  BAD_PERIOD: "That period can't be paid — it hasn't started yet, or it is before this account existed.",
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "payroll.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as { period?: unknown; userId?: unknown; kind?: unknown };

  if (!isPeriod(b.period)) {
    return NextResponse.json({ error: "Bad period" }, { status: 400 });
  }
  if (typeof b.userId !== "string" || b.userId.length === 0) {
    return NextResponse.json({ error: "Bad user" }, { status: 400 });
  }
  if (b.kind !== "salary" && b.kind !== "commission") {
    return NextResponse.json({ error: "Bad kind" }, { status: 400 });
  }
  const kind = b.kind as PayKind;

  const result = await payPayroll({
    period: b.period,
    userId: b.userId,
    kind,
  });

  if (!result.ok) {
    // Recorded even when it does not pay: an attempt to pay someone twice is
    // exactly the thing a finance trail should show.
    await writeAudit({
      actorId: session.user.id,
      action: "PAYROLL_PAY_REJECTED",
      entity: "Payroll",
      entityId: `${kind}:${b.period}`,
      targetUserId: b.userId,
      summary: `Payroll ${kind} for ${b.period} not paid — ${result.reason}`,
      meta: { period: b.period, kind, reason: result.reason },
    });
    return NextResponse.json(
      { error: REASONS[result.reason] ?? result.reason },
      { status: 409 }
    );
  }

  await writeAudit({
    actorId: session.user.id,
    action: "PAYROLL_PAID",
    entity: "Payroll",
    entityId: result.transactionId,
    targetUserId: b.userId,
    summary: `Paid ${usd(result.paidUsd)} ${kind} for ${b.period} to their platform wallet`,
    meta: {
      period: b.period,
      kind,
      amountUsd: result.paidUsd,
      transactionId: result.transactionId,
      rail: "platform_wallet",
    },
  });

  return NextResponse.json({ ok: true, paidUsd: result.paidUsd });
}
