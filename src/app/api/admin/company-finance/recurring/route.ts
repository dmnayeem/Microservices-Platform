import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import {
  generateRecurring,
  listRecurring,
  saveRecurring,
  summariseRecurring,
  type RecurringInput,
} from "@/lib/company-finance/recurring";

export const runtime = "nodejs";

export async function GET() {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const rows = await listRecurring();
  // A recurring salary shows who is paid what — same rule as the entry list.
  const visible = g.caller.can("finance.hr.view") ? rows : rows.filter((r) => !r.employeeId);
  return NextResponse.json({ recurring: visible });
}

/** Create a template, or `{ generate: true }` to write this month's entries now. */
export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as RecurringInput & { generate?: boolean };

  if (body.generate) {
    const s = await generateRecurring({ actorId: g.caller.id });
    await auditFinance(g.caller, "RECURRING_GENERATED", "RecurringEntry", null, summariseRecurring(s), s);
    return NextResponse.json({ ok: true, ...s, message: summariseRecurring(s) });
  }

  const res = await saveRecurring(null, body);
  if (res.ok) {
    await auditFinance(g.caller, "RECURRING_CREATED", "RecurringEntry", res.data.id,
      `Set up recurring "${body.title}" — ${body.amount} ${body.currency} from ${body.startPeriod}`);
  }
  return reply(res, 201);
}
