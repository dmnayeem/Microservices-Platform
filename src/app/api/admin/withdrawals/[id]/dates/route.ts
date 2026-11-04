import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Move a withdrawal's request date and/or its paid (processed) date earlier
 * or later. SUPER_ADMIN and FINANCE_ADMIN only, read from the database rather
 * than a permission, so no grant can hand it to another role.
 *
 * Only the two dates change. Status, amounts and the ledger rows are left
 * alone, and every change is written to the audit log with before and after.
 */
const DATE_EDITORS = new Set(["SUPER_ADMIN", "FINANCE_ADMIN"]);

const iso = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const schema = z
  .object({ createdAt: iso.optional(), processedAt: iso.optional() })
  .refine((b) => b.createdAt || b.processedAt, { message: "Nothing to change" });

const fmt = (d: Date | null) => (d ? format(d, "MMM d, yyyy HH:mm") : "—");

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!actor || !DATE_EDITORS.has(actor.role)) {
    return NextResponse.json({ error: "Only a super admin or finance admin can change these dates" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid date" }, { status: 400 });
  }
  const b = parsed.data;

  const { id } = await params;
  const w = await prisma.withdrawal.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, createdAt: true, processedAt: true, reviewedAt: true },
  });
  if (!w) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  if (b.processedAt && !w.processedAt) {
    return NextResponse.json({ error: "This withdrawal has no paid date yet" }, { status: 400 });
  }

  const createdAt = b.createdAt ?? w.createdAt;
  const processedAt = b.processedAt ?? w.processedAt;
  if (processedAt && processedAt < createdAt) {
    return NextResponse.json({ error: "The paid date can't be before the request date" }, { status: 400 });
  }

  // The member's tracker shows requested → approved → paid, so the approval
  // time is kept between the two dates rather than left out of order.
  let reviewedAt = w.reviewedAt;
  if (reviewedAt && reviewedAt < createdAt) reviewedAt = createdAt;
  if (reviewedAt && processedAt && reviewedAt > processedAt) reviewedAt = processedAt;

  await prisma.$transaction([
    prisma.withdrawal.update({
      where: { id: w.id },
      data: {
        ...(b.createdAt ? { createdAt } : {}),
        ...(b.processedAt ? { processedAt } : {}),
        ...(reviewedAt?.getTime() !== w.reviewedAt?.getTime() ? { reviewedAt } : {}),
      },
    }),
    // The ledger rows the member sees in their wallet history move with them.
    // The request's row (`withdrawal_<id>`) is dated by the request; the
    // rejection refund, and the paid row of a withdrawal from before request
    // rows existed (reference = the bare id), are dated by the payout.
    ...(b.createdAt
      ? [
          prisma.transaction.updateMany({
            where: { userId: w.userId, type: "WITHDRAWAL", reference: `withdrawal_${w.id}` },
            data: { createdAt },
          }),
        ]
      : []),
    ...(b.processedAt && processedAt
      ? [
          prisma.transaction.updateMany({
            where: {
              userId: w.userId,
              OR: [
                { type: "REFUND", reference: `withdrawal_refund_${w.id}` },
                { type: "WITHDRAWAL", reference: w.id },
              ],
            },
            data: { createdAt: processedAt },
          }),
        ]
      : []),
  ]);

  const parts = [
    b.createdAt && `request date ${fmt(w.createdAt)} → ${fmt(createdAt)}`,
    b.processedAt && `paid date ${fmt(w.processedAt)} → ${fmt(processedAt)}`,
  ].filter(Boolean);
  await writeAudit({
    actorId: session.user.id,
    action: "WITHDRAWAL_DATES_CHANGED",
    entity: "Withdrawal",
    entityId: w.id,
    targetUserId: w.userId,
    summary: `Changed withdrawal ${parts.join(", ")}`,
    meta: {
      before: { createdAt: w.createdAt.toISOString(), processedAt: w.processedAt?.toISOString() ?? null },
      after: { createdAt: createdAt.toISOString(), processedAt: processedAt?.toISOString() ?? null },
    },
  });

  return NextResponse.json({ ok: true });
}
