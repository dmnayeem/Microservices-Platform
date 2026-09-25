import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { financeGuard, reply, hideSalariesWhere, auditFinance } from "@/lib/company-finance/api";
import { createEntry, listEntries, type EntryInput } from "@/lib/company-finance/books";

export const runtime = "nodejs";

/** The company books: list with filters and totals. */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? 1) || 1;
  const data = await listEntries(
    {
      kind: sp.get("kind") ?? undefined,
      status: sp.get("status") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      employeeId: g.caller.can("finance.hr.view") ? sp.get("employeeId") ?? undefined : undefined,
      payeeId: sp.get("payeeId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      q: sp.get("q") ?? undefined,
    },
    page,
    Number(sp.get("pageSize") ?? 50) || 50,
    hideSalariesWhere(g.caller)
  );
  return NextResponse.json({ ...data, page });
}

/**
 * Record an entry. `markPaid` needs the approve permission as well — anyone
 * with "record" alone writes a PENDING entry for someone else to release.
 */
export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as EntryInput & {
    markPaid?: boolean;
    paidAt?: string | null;
  };

  if (body.markPaid && !g.caller.can("finance.entries.approve")) {
    return NextResponse.json(
      { error: "You can record this, but marking it paid needs the 'Approve & pay expenses' permission." },
      { status: 403 }
    );
  }
  // Recording someone's pay needs the HR permission too — otherwise "record
  // expenses" would be a way to write (and so learn) salaries.
  if (body.employeeId && !g.caller.can("finance.hr.view")) {
    return NextResponse.json({ error: "Paying an employee needs the 'View employees & salaries' permission." }, { status: 403 });
  }

  const res = await createEntry(g.caller.id, body, { markPaid: !!body.markPaid, paidAt: body.paidAt ?? null });
  if (res.ok) {
    await auditFinance(
      g.caller,
      body.markPaid ? "ENTRY_PAID" : "ENTRY_CREATED",
      "FinanceEntry",
      res.data.id,
      `${body.markPaid ? "Recorded and paid" : "Recorded"} ${body.kind?.toLowerCase() ?? "entry"} "${body.title}" — ${body.amount} ${body.currency}`,
      { kind: body.kind, amount: body.amount, currency: body.currency, period: body.period }
    );
  }
  return reply(res, 201);
}
