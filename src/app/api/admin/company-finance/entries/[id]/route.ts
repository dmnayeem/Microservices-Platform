import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { financeGuard, reply, auditFinance, PAY_CATEGORY_SLUGS } from "@/lib/company-finance/api";
import { markEntryPaid, updateEntry, voidEntry, type EntryInput } from "@/lib/company-finance/books";

export const runtime = "nodejs";

/** Load an entry, refusing a pay row to anyone who may not see pay. */
async function loadVisible(id: string, canSeePay: boolean) {
  const e = await prisma.financeEntry.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true, kind: true, color: true } },
      employee: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!e) return { error: "That entry no longer exists", status: 404 } as const;
  const isPay =
    !!e.employeeId || e.source === "SALARY" || PAY_CATEGORY_SLUGS.includes(e.category.slug ?? "");
  // 404, not 403: a clerk should not be able to confirm a salary row exists by
  // probing ids.
  if (isPay && !canSeePay) return { error: "That entry no longer exists", status: 404 } as const;
  return { entry: e } as const;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const { id } = await params;
  const r = await loadVisible(id, g.caller.can("finance.hr.view"));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const e = r.entry;
  return NextResponse.json({
    entry: {
      ...e,
      amount: toNum(e.amount),
      usdRate: toNum(e.usdRate),
      amountUsd: toNum(e.amountUsd),
      taxAmount: toNum(e.taxAmount),
      taxAmountUsd: toNum(e.taxAmountUsd),
    },
  });
}

/** Edit a PENDING entry. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const { id } = await params;
  const r = await loadVisible(id, g.caller.can("finance.hr.view"));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = (await request.json().catch(() => ({}))) as EntryInput;
  if (body.employeeId && !g.caller.can("finance.hr.view")) {
    return NextResponse.json({ error: "Paying an employee needs the 'View employees & salaries' permission." }, { status: 403 });
  }
  const res = await updateEntry(id, body);
  if (res.ok) {
    await auditFinance(g.caller, "ENTRY_EDITED", "FinanceEntry", id, `Edited "${r.entry.title}"`, {
      before: { amount: toNum(r.entry.amount), currency: r.entry.currency, period: r.entry.period },
      after: { amount: body.amount, currency: body.currency, period: body.period },
    });
  }
  return reply(res);
}

/** Pay or void. Both need the approve permission. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.entries.approve");
  if ("res" in g) return g.res;
  const { id } = await params;
  const r = await loadVisible(id, g.caller.can("finance.hr.view"));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    paidAt?: string | null;
    paymentMethod?: string | null;
    reference?: string | null;
  };

  if (body.action === "pay") {
    const res = await markEntryPaid(id, g.caller.id, body);
    if (res.ok) {
      await auditFinance(
        g.caller,
        "ENTRY_PAID",
        "FinanceEntry",
        id,
        `Paid "${r.entry.title}" — ${toNum(r.entry.amount)} ${r.entry.currency}`,
        { paymentMethod: body.paymentMethod ?? null, reference: body.reference ?? null }
      );
    }
    return reply(res);
  }

  if (body.action === "void") {
    const res = await voidEntry(id, g.caller.id, body.reason ?? "");
    if (res.ok) {
      await auditFinance(
        g.caller,
        "ENTRY_VOIDED",
        "FinanceEntry",
        id,
        `Voided "${r.entry.title}" (was ${r.entry.status.toLowerCase()}) — ${body.reason}`,
        { wasStatus: r.entry.status, amount: toNum(r.entry.amount), currency: r.entry.currency }
      );
    }
    return reply(res);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
