import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { listEmployees, saveEmployee, type EmployeeInput } from "@/lib/company-finance/hr";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.hr.view");
  if ("res" in g) return g.res;
  const sp = request.nextUrl.searchParams;
  const employees = await listEmployees({
    status: sp.get("status") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  return NextResponse.json({ employees });
}

export async function POST(request: NextRequest) {
  const g = await financeGuard(["finance.hr.view", "finance.hr.manage"]);
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as EmployeeInput;
  const res = await saveEmployee(null, body);
  if (res.ok) {
    await auditFinance(g.caller, "EMPLOYEE_CREATED", "Employee", res.data.id,
      `Added employee ${body.name}${body.designation ? ` (${body.designation})` : ""}`,
      { salary: body.salaryAmount, currency: body.salaryCurrency, cycle: body.salaryCycle });
  }
  return reply(res, 201);
}
