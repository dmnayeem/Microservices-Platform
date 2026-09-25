import { salarySheet } from "@/lib/company-finance/hr";
import { amountInWords } from "@/lib/amount-in-words";
import { isPeriod, periodLabel, periodOf } from "@/lib/company-finance/constants";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import { printGuard } from "../_guard";

export const dynamic = "force-dynamic";

/**
 * The month's salary sheet: one line per employee, what they are owed, what
 * has been paid, and a column for the employee's own signature — which is what
 * makes a cash payroll auditable at all.
 *
 * Amounts are shown in each person's own salary currency and totalled per
 * currency; a taka salary and a dollar salary are never added into one number.
 */
export default async function SalarySheetPrint({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const g = await printGuard("finance.view", "finance.hr.view");
  const { period: raw } = await searchParams;
  const period = isPeriod(raw) ? raw : periodOf(new Date());
  const rows = await salarySheet(period);

  const totals = new Map<string, { owed: number; paid: number }>();
  for (const r of rows) {
    const cur = r.entry?.currency ?? r.salaryCurrency;
    const t = totals.get(cur) ?? { owed: 0, paid: 0 };
    const amt = r.entry?.amount ?? r.salaryAmount;
    if (r.entry?.status === "PAID") t.paid += amt;
    else t.owed += amt;
    totals.set(cur, t);
  }

  return (
    <PrintDoc
      title="Salary Sheet"
      subtitle={`For the month of ${periodLabel(period)}`}
      printedBy={g.name}
      landscape
      meta={[
        { label: "Month", value: periodLabel(period) },
        { label: "Employees", value: String(rows.length) },
      ]}
      signatures={["Prepared by", "Checked by", "Accounts", "Approved by"]}
    >
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>SL</th>
            <th>Name</th>
            <th>Designation</th>
            <th>Paid by</th>
            <th className="num">Salary</th>
            <th className="num">This month</th>
            <th style={{ width: 70 }}>Status</th>
            <th style={{ width: 150 }}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "#6b7280" }}>No employees on the books this month.</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.designation ?? ""}</td>
                <td>{r.paymentMethod ?? ""}</td>
                <td className="num">{r.salaryAmount > 0 ? paperMoney(r.salaryAmount, r.salaryCurrency) : "—"}</td>
                <td className="num">
                  {r.entry ? paperMoney(r.entry.amount, r.entry.currency) : <span style={{ color: "#9ca3af" }}>not recorded</span>}
                </td>
                <td>{r.entry ? (r.entry.status === "PAID" ? "Paid" : "Owed") : "—"}</td>
                <td style={{ height: 34 }} />
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-[13px]">
        {[...totals.entries()].map(([cur, t]) => (
          <div key={cur}>
            <p>
              <span className="pd-muted">Total {cur}:</span>{" "}
              <span className="font-semibold">{paperMoney(t.paid + t.owed, cur)}</span>
              <span className="pd-muted"> — paid {paperMoney(t.paid, cur)}, still owed {paperMoney(t.owed, cur)}</span>
            </p>
            <p className="text-[12px] pd-muted2">In words: {amountInWords(t.paid + t.owed, cur)}</p>
          </div>
        ))}
      </div>
    </PrintDoc>
  );
}
