import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { entryWhere } from "@/lib/company-finance/books";
import { hideSalariesWhere } from "@/lib/company-finance/api";
import { ENTRY_KIND_LABEL, periodLabel, type EntryKind } from "@/lib/company-finance/constants";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import type { Permission } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { printGuard } from "../_guard";

export const dynamic = "force-dynamic";

/**
 * The expense list, printed with the same filters as the screen and the same
 * salary rule — a printout must never show more than the screen does.
 */
export default async function EntriesPrint({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await printGuard("finance.view");
  const sp = await searchParams;

  const where: Prisma.FinanceEntryWhereInput = {
    AND: [
      entryWhere({
        kind: sp.kind,
        status: sp.status,
        categoryId: sp.categoryId,
        payeeId: sp.payeeId,
        from: sp.from,
        to: sp.to,
        q: sp.q,
      }),
      hideSalariesWhere({ id: g.userId, role: "USER", perms: new Set(), can: (p: Permission) => g.can(p) }),
    ],
  };

  type Row = {
    id: string;
    kind: string;
    period: string;
    title: string;
    amount: unknown;
    currency: string;
    amountUsd: unknown;
    taxAmountUsd: unknown;
    status: string;
    paidAt: Date | null;
    reference: string | null;
    category: { name: string };
    employee: { name: string } | null;
    payee: { name: string } | null;
  };
  const rows = (await prisma.financeEntry.findMany({
    where,
    orderBy: [{ period: "asc" }, { createdAt: "asc" }],
    take: 2000,
    include: {
      category: { select: { name: true } },
      employee: { select: { name: true } },
      payee: { select: { name: true } },
    },
  })) as unknown as Row[];

  const live = rows.filter((r) => r.status !== "VOID");
  const totalUsd = live.reduce((s, r) => s + toNum(r.amountUsd as never), 0);
  const paidUsd = live.filter((r) => r.status === "PAID").reduce((s, r) => s + toNum(r.amountUsd as never), 0);
  const taxUsd = live.reduce((s, r) => s + toNum(r.taxAmountUsd as never), 0);
  const range = sp.from || sp.to ? `${sp.from ? periodLabel(sp.from) : "…"} – ${sp.to ? periodLabel(sp.to) : "…"}` : "All months";

  return (
    <PrintDoc
      title={sp.kind ? `${ENTRY_KIND_LABEL[sp.kind as EntryKind] ?? "Entries"} report` : "Expense & income report"}
      subtitle={`${range}${sp.status ? ` · ${sp.status.toLowerCase()} only` : ""}${g.can("finance.hr.view") ? "" : " · salaries excluded"}`}
      printedBy={g.name}
      landscape
      signatures={["Prepared by", "Checked by", "Approved by"]}
    >
      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>SL</th>
            <th style={{ width: 70 }}>Month</th>
            <th>Particulars</th>
            <th>Head</th>
            <th>Paid to</th>
            <th className="num">Amount</th>
            <th className="num">USD</th>
            <th style={{ width: 70 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: "center", color: "#6b7280" }}>No entries match.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.id} style={r.status === "VOID" ? { color: "#9ca3af", textDecoration: "line-through" } : undefined}>
                <td>{i + 1}</td>
                <td>{periodLabel(r.period)}</td>
                <td>{r.title}{r.reference ? <span style={{ color: "#6b7280" }}> · {r.reference}</span> : null}</td>
                <td>{r.category.name}</td>
                <td>{r.employee?.name ?? r.payee?.name ?? ""}</td>
                <td className="num">{paperMoney(toNum(r.amount as never), r.currency)}</td>
                <td className="num">{paperMoney(toNum(r.amountUsd as never), "USD")}</td>
                <td>{r.status === "PAID" ? "Paid" : r.status === "PENDING" ? "Owed" : "Void"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="mt-3 text-[13px]">
        <p><span className="pd-muted">Total (excluding void):</span> <span className="font-semibold">{paperMoney(totalUsd, "USD")}</span></p>
        <p className="text-[12px] pd-muted2">Paid {paperMoney(paidUsd, "USD")} · owed {paperMoney(totalUsd - paidUsd, "USD")} · tax inside these {paperMoney(taxUsd, "USD")}</p>
        {rows.length === 2000 && <p className="text-[11px] pd-danger">Only the first 2,000 entries are printed — narrow the filter.</p>}
      </div>
    </PrintDoc>
  );
}
