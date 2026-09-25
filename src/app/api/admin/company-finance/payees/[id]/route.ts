import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { savePayee, type PayeeInput } from "@/lib/company-finance/books";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const { id } = await params;
  const cur = await prisma.payee.findUnique({ where: { id }, select: { name: true, paymentDetails: true } });
  if (!cur) return NextResponse.json({ error: "That payee no longer exists" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as PayeeInput;
  const res = await savePayee(id, body);
  if (res.ok) {
    // Changing where a vendor is paid is the classic diversion fraud, so it is
    // called out by name in the log rather than buried in "edited".
    const detailsChanged = (cur.paymentDetails ?? "") !== (body.paymentDetails ?? "");
    await auditFinance(
      g.caller,
      detailsChanged ? "PAYEE_PAYMENT_DETAILS_CHANGED" : "PAYEE_EDITED",
      "Payee",
      id,
      detailsChanged ? `Changed ${cur.name}'s payment details` : `Edited payee ${body.name}`,
      detailsChanged ? { before: cur.paymentDetails, after: body.paymentDetails ?? null } : undefined
    );
  }
  return reply(res);
}
