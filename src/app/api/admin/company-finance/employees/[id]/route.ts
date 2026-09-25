import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { saveEmployee, type EmployeeInput } from "@/lib/company-finance/hr";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.hr.view");
  if ("res" in g) return g.res;
  const { id } = await params;
  const e = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!e) return NextResponse.json({ error: "That employee no longer exists" }, { status: 404 });

  // Their pay history, newest first — the thing an HR record is opened for.
  const history = await prisma.financeEntry.findMany({
    where: { employeeId: id, status: { not: "VOID" } },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    take: 36,
    select: { id: true, title: true, period: true, status: true, amount: true, currency: true, paidAt: true, source: true },
  });

  return NextResponse.json({
    employee: {
      ...e,
      salaryAmount: toNum(e.salaryAmount),
      commissionPct: e.commissionPct === null ? null : toNum(e.commissionPct),
    },
    history: history.map((h) => ({ ...h, amount: toNum(h.amount) })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard(["finance.hr.view", "finance.hr.manage"]);
  if ("res" in g) return g.res;
  const { id } = await params;
  const before = await prisma.employee.findUnique({
    where: { id },
    select: { name: true, salaryAmount: true, salaryCurrency: true, status: true },
  });
  if (!before) return NextResponse.json({ error: "That employee no longer exists" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as EmployeeInput;
  const res = await saveEmployee(id, body);
  if (res.ok) {
    // A pay change is the single most important thing to be able to trace
    // later, so it gets its own action, with the before and after.
    const payChanged =
      toNum(before.salaryAmount) !== Number(body.salaryAmount) || before.salaryCurrency !== body.salaryCurrency;
    await auditFinance(
      g.caller,
      payChanged ? "EMPLOYEE_PAY_CHANGED" : "EMPLOYEE_EDITED",
      "Employee",
      id,
      payChanged
        ? `Changed ${before.name}'s pay: ${toNum(before.salaryAmount)} ${before.salaryCurrency} → ${body.salaryAmount} ${body.salaryCurrency}`
        : `Edited employee ${body.name}${before.status !== body.status ? ` (status ${before.status} → ${body.status})` : ""}`,
      { before: { salary: toNum(before.salaryAmount), currency: before.salaryCurrency, status: before.status } }
    );
  }
  return reply(res);
}
