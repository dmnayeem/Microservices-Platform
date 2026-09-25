import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { financeGuard, hideSalariesWhere, auditFinance } from "@/lib/company-finance/api";
import { entryWhere } from "@/lib/company-finance/books";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * The books as CSV, for an accountant or a spreadsheet.
 *
 * Same filters and the same salary rule as the on-screen list — an export must
 * never show someone more than the screen would. Capped at 10,000 rows so one
 * click cannot pull the whole ledger into a single serverless response.
 */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Formula injection: a cell starting with = + - @ is executed by Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const sp = request.nextUrl.searchParams;
  const where: Prisma.FinanceEntryWhereInput = {
    AND: [
      entryWhere({
        kind: sp.get("kind") ?? undefined,
        status: sp.get("status") ?? undefined,
        categoryId: sp.get("categoryId") ?? undefined,
        payeeId: sp.get("payeeId") ?? undefined,
        from: sp.get("from") ?? undefined,
        to: sp.get("to") ?? undefined,
        q: sp.get("q") ?? undefined,
      }),
      hideSalariesWhere(g.caller),
    ],
  };

  type Named = { name: string | null } | null;
  type Row = Prisma.FinanceEntryGetPayload<object> & {
    category: { name: string };
    employee: Named;
    payee: Named;
    createdBy: Named;
    approvedBy: Named;
  };
  // Typed explicitly — see listFieldDefs in books.ts for why.
  const rows = (await prisma.financeEntry.findMany({
    where,
    orderBy: [{ period: "asc" }, { createdAt: "asc" }],
    take: 10_000,
    include: {
      category: { select: { name: true } },
      employee: { select: { name: true } },
      payee: { select: { name: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  })) as unknown as Row[];

  const header = [
    "Period", "Type", "Category", "Title", "Paid to", "Amount", "Currency", "Rate per USD",
    "Amount USD", "Tax", "Tax label", "Tax USD", "Status", "Paid on", "Method", "Reference",
    "Recorded by", "Approved by", "Void reason", "Id",
  ];
  const lines = rows.map((r) =>
    [
      r.period, r.kind, r.category.name, r.title, r.employee?.name ?? r.payee?.name ?? "",
      toNum(r.amount), r.currency, toNum(r.usdRate), toNum(r.amountUsd).toFixed(2),
      toNum(r.taxAmount), r.taxLabel ?? "", toNum(r.taxAmountUsd).toFixed(2), r.status,
      r.paidAt ? r.paidAt.toISOString().slice(0, 10) : "", r.paymentMethod ?? "", r.reference ?? "",
      r.createdBy?.name ?? "", r.approvedBy?.name ?? "", r.voidReason ?? "", r.id,
    ].map(cell).join(",")
  );

  // Exports leave the building, so they are logged like any other access.
  await auditFinance(g.caller, "EXPORTED", "FinanceEntry", null, `Exported ${rows.length} finance entries`,
    { filters: Object.fromEntries(sp.entries()) });

  return new NextResponse("﻿" + [header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="company-books-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
