import { NextRequest } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { saveRecurring, type RecurringInput } from "@/lib/company-finance/recurring";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as RecurringInput;
  const res = await saveRecurring(id, body);
  if (res.ok) {
    await auditFinance(g.caller, "RECURRING_EDITED", "RecurringEntry", id,
      `${body.isActive === false ? "Stopped" : "Edited"} recurring "${body.title}"`);
  }
  return reply(res);
}
