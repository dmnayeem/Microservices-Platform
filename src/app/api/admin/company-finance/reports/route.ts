import { NextRequest, NextResponse } from "next/server";
import { financeGuard } from "@/lib/company-finance/api";
import { profitAndLoss, taxRegister } from "@/lib/company-finance/reports";
import { isPeriod, periodOf, shiftPeriod } from "@/lib/company-finance/constants";

export const runtime = "nodejs";

/** `?type=pnl|tax&from=YYYY-MM&to=YYYY-MM` — defaults to the last 6 months. */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const sp = request.nextUrl.searchParams;
  const now = periodOf(new Date());
  const to = isPeriod(sp.get("to")) ? sp.get("to")! : now;
  const from = isPeriod(sp.get("from")) ? sp.get("from")! : shiftPeriod(to, -5);
  if (from > to) return NextResponse.json({ error: "The start month is after the end month" }, { status: 400 });

  if (sp.get("type") === "tax") {
    return NextResponse.json({ from, to, register: await taxRegister(from, to) });
  }
  const pnl = await profitAndLoss(from, to);
  return NextResponse.json({ from, to, pnl });
}
