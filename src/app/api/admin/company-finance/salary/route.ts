import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { recordSalary, salarySheet } from "@/lib/company-finance/hr";
import { isPeriod, periodLabel, periodOf } from "@/lib/company-finance/constants";

export const runtime = "nodejs";

/** One month's payroll: who is owed, what, and whether it is recorded/paid. */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.hr.view");
  if ("res" in g) return g.res;
  const p = request.nextUrl.searchParams.get("period");
  const period = isPeriod(p) ? p : periodOf(new Date());
  return NextResponse.json({ period, rows: await salarySheet(period) });
}

/**
 * Record salaries for a month — one employee, or everyone on the sheet.
 *
 * Paying (as opposed to recording as owed) needs the approve permission as
 * well: whoever prepares payroll and whoever releases it can be two people.
 */
export async function POST(request: NextRequest) {
  const g = await financeGuard(["finance.hr.view", "finance.hr.manage"]);
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as {
    period?: string;
    employeeId?: string;
    all?: boolean;
    amount?: number | null;
    markPaid?: boolean;
    paidAt?: string | null;
    paymentMethod?: string | null;
    reference?: string | null;
    note?: string | null;
  };

  if (!isPeriod(body.period)) {
    return NextResponse.json({ error: "Pick the month" }, { status: 400 });
  }
  if (body.markPaid && !g.caller.can("finance.entries.approve")) {
    return NextResponse.json(
      { error: "You can record salaries as owed, but paying them needs the 'Approve & pay expenses' permission." },
      { status: 403 }
    );
  }

  if (body.all) {
    // Every employee on the sheet who has nothing recorded yet. Each call is
    // idempotent on its own, so a retry of a half-finished run completes it
    // rather than doubling it.
    const sheet = await salarySheet(body.period);
    const todo = sheet.filter((r) => !r.entry && r.salaryAmount > 0 && r.status !== "LEFT");
    let done = 0;
    const errors: string[] = [];
    for (const r of todo) {
      const res = await recordSalary(g.caller.id, {
        employeeId: r.id,
        period: body.period,
        markPaid: !!body.markPaid,
        paidAt: body.paidAt ?? null,
      });
      if (res.ok) done++;
      else errors.push(`${r.name}: ${res.error}`);
    }
    await auditFinance(
      g.caller,
      body.markPaid ? "PAYROLL_PAID" : "PAYROLL_RECORDED",
      "FinanceEntry",
      null,
      `${body.markPaid ? "Paid" : "Recorded"} ${periodLabel(body.period)} salaries for ${done} employee(s)`,
      { period: body.period, count: done, errors }
    );
    return NextResponse.json({ ok: true, recorded: done, skipped: sheet.length - todo.length, errors });
  }

  if (!body.employeeId) return NextResponse.json({ error: "Pick an employee" }, { status: 400 });
  const res = await recordSalary(g.caller.id, {
    employeeId: body.employeeId,
    period: body.period,
    amount: body.amount ?? null,
    markPaid: !!body.markPaid,
    paidAt: body.paidAt ?? null,
    paymentMethod: body.paymentMethod ?? null,
    reference: body.reference ?? null,
    note: body.note ?? null,
  });
  if (res.ok && !res.data.duplicate) {
    await auditFinance(g.caller, body.markPaid ? "SALARY_PAID" : "SALARY_RECORDED", "FinanceEntry", res.data.id,
      `${body.markPaid ? "Paid" : "Recorded"} a ${periodLabel(body.period)} salary`, { employeeId: body.employeeId });
  }
  if (res.ok && res.data.duplicate) {
    return NextResponse.json(
      { error: `This month's salary is already recorded for them. Open the entry to pay or void it.`, id: res.data.id },
      { status: 409 }
    );
  }
  return reply(res, 201);
}
