import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { csvFilename, csvResponse, toCsv } from "@/lib/csv";
import { parseDay } from "@/lib/finance/platform-income";
import {
  autoGranularity,
  earliestMoneyDate,
  getFlows,
  GRANULARITIES,
} from "@/lib/finance/flows";

/**
 * The Cash flow tab's reconciliation table as CSV (UTF-8 with BOM, so Excel
 * opens it with the right encoding): one row per day / week / month with
 * opening position, inflow, outflow, net and closing position.
 *
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD&g=day|week|month` — UTC days, inclusive. No
 * `from` = since records began; no `to` = now. Gated on `finance.view`, like
 * the ledger export.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "finance.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const f = parseDay(sp.get("from"));
  const t = parseDay(sp.get("to"));
  const from = f ?? (await earliestMoneyDate());
  const to = t ? new Date(t.getTime() + 86_400_000 - 1) : new Date();
  if (from > to) return NextResponse.json({ error: "from is after to" }, { status: 400 });
  const granularity = GRANULARITIES.find((g) => g.id === sp.get("g"))?.id ?? autoGranularity(from, to);

  try {
    const flows = await getFlows({ from, to, granularity });
    const r2 = (n: number) => n.toFixed(2);
    const csv = toCsv(
      ["Period start (UTC)", "Period", "Opening position USD", "Inflow USD", "Outflow USD", "Net USD", "Closing position USD"],
      [
        ...flows.periods.map((p) => [p.key, p.label, r2(p.openingUsd), r2(p.inflowUsd), r2(p.outflowUsd), r2(p.netUsd), r2(p.closingUsd)]),
        ["", "Range total", r2(flows.openingUsd), r2(flows.inflowUsd), r2(flows.outflowUsd), r2(flows.netUsd), r2(flows.closingUsd)],
        [],
        [
          "",
          "Position = platform revenue minus member payouts and wallet payroll since records began (accrual; excludes Company-book expenses; not a bank balance). Finance test users excluded.",
        ],
      ]
    );
    return csvResponse(csv, csvFilename(`finance-reconciliation-${flows.granularity}`)) as unknown as NextResponse;
  } catch {
    return NextResponse.json({ error: "Could not build the report right now." }, { status: 503 });
  }
}
