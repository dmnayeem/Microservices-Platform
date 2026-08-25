import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { settleInvoice } from "@/lib/invoices";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Mark an invoice paid, or void it.
 *
 * "Mark paid" is the moment the money means something: it credits the
 * advertiser's balance and activates any slot booking the invoice settles. It is
 * safe to click twice — `settleInvoice` claims the status conditionally and the
 * ad-credit ledger is uniquely indexed on `(userId, reference)`, so a second
 * call credits nothing rather than doubling it.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      advertiserId: true,
      totalUsd: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "settle") {
    const result = await settleInvoice(id, {
      paymentRef: body.paymentRef ? String(body.paymentRef).slice(0, 120) : null,
    });
    if (!result.ok) {
      const status = result.reason === "ALREADY_PAID" ? 409 : 400;
      return NextResponse.json(
        {
          error:
            result.reason === "ALREADY_PAID"
              ? "This invoice has already been settled."
              : result.reason === "NOT_PAYABLE"
                ? "A voided invoice cannot be paid."
                : "Invoice not found.",
          code: result.reason,
        },
        { status }
      );
    }
    await writeAudit({
      actorId: session.user.id,
      action: "INVOICE_SETTLED",
      entity: "Invoice",
      entityId: id,
      targetUserId: existing.advertiserId,
      summary: `Marked ${existing.number} paid — ${usd(toNum(existing.totalUsd))}, credited ${usd(result.creditedUsd)}`,
      meta: {
        creditedUsd: result.creditedUsd,
        activatedBookings: result.activatedBookings,
      },
    });
    return NextResponse.json({ success: true, ...result });
  }

  if (body.action === "void") {
    if (existing.status === "PAID") {
      // Voiding a paid invoice would leave credit that no document explains.
      // A refund is a different operation and should look like one.
      return NextResponse.json(
        { error: "A paid invoice cannot be voided — issue a credit note instead." },
        { status: 400 }
      );
    }
    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status: "VOID" },
    });
    await writeAudit({
      actorId: session.user.id,
      action: "INVOICE_VOIDED",
      entity: "Invoice",
      entityId: id,
      targetUserId: existing.advertiserId,
      summary: `Voided ${existing.number}`,
    });
    return NextResponse.json({ success: true, invoice });
  }

  // Notes and the due date are editable while it is still a bill; the amounts
  // are not, because a total that changes after the client has the document is
  // how disputes start. Reissue instead.
  const data: Record<string, unknown> = {};
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  }
  if (body.dueAt !== undefined) {
    const d = body.dueAt ? new Date(String(body.dueAt)) : null;
    if (d && isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }
    data.dueAt = d;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  if (existing.status === "PAID" || existing.status === "VOID") {
    return NextResponse.json(
      { error: "A settled or voided invoice can no longer be edited." },
      { status: 400 }
    );
  }
  const invoice = await prisma.invoice.update({ where: { id }, data });
  return NextResponse.json({ success: true, invoice });
}
