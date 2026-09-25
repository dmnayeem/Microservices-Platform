import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { amountInWords } from "@/lib/amount-in-words";
import { EMPLOYMENT_TYPE_LABEL, periodLabel } from "@/lib/company-finance/constants";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import { printGuard } from "../../_guard";

export const dynamic = "force-dynamic";

/**
 * One person's payslip for one month, from their salary entry.
 *
 * Shows the configured salary next to what was actually recorded, because the
 * two differ exactly when there was a deduction, an advance or a part month —
 * and that difference is the thing an employee asks about.
 */
export default async function PayslipPrint({ params }: { params: Promise<{ id: string }> }) {
  const g = await printGuard("finance.view", "finance.hr.view");
  const { id } = await params;

  const e = await prisma.financeEntry.findUnique({
    where: { id },
    include: {
      employee: true,
      approvedBy: { select: { name: true } },
    },
  });
  if (!e || !e.employee) notFound();
  const emp = e.employee;
  const amount = toNum(e.amount);
  const configured = toNum(emp.salaryAmount);
  const sameCurrency = emp.salaryCurrency === e.currency;

  return (
    <PrintDoc
      title="Payslip"
      subtitle={`${periodLabel(e.period)}${e.status === "VOID" ? " — VOID" : e.status === "PENDING" ? " — not yet paid" : ""}`}
      printedBy={g.name}
      meta={[
        { label: "Employee", value: emp.name },
        { label: "Designation", value: emp.designation ?? "—" },
        { label: "Department", value: emp.department ?? "—" },
        { label: "Employment", value: EMPLOYMENT_TYPE_LABEL[emp.employmentType as keyof typeof EMPLOYMENT_TYPE_LABEL] ?? emp.employmentType },
        { label: "Joined", value: emp.joinDate ? emp.joinDate.toLocaleDateString("en-GB") : "—" },
        { label: "Payslip no.", value: `PS-${e.period.replace("-", "")}-${e.id.slice(-6).toUpperCase()}` },
        { label: "Paid by", value: e.paymentMethod ?? emp.paymentMethod ?? "—" },
        { label: "Paid on", value: e.paidAt ? e.paidAt.toLocaleDateString("en-GB") : "—" },
      ]}
      signatures={["Employee", "Accounts", "Approved by"]}
    >
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th className="num" style={{ width: 160 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Salary for {periodLabel(e.period)} ({emp.salaryCycle.toLowerCase()})</td>
            <td className="num">{paperMoney(sameCurrency ? configured : amount, e.currency)}</td>
          </tr>
          {sameCurrency && Math.abs(configured - amount) > 0.004 && (
            <tr>
              <td>{amount < configured ? "Deduction / adjustment" : "Addition / adjustment"}{e.description ? ` — ${e.description}` : ""}</td>
              <td className="num">{paperMoney(amount - configured, e.currency)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ textAlign: "right", fontWeight: 600 }}>Net pay</td>
            <td className="num" style={{ fontWeight: 700 }}>{paperMoney(amount, e.currency)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-[13px]">
        <span className="text-gray-500">In words:</span> <span className="font-semibold">{amountInWords(amount, e.currency)}</span>
      </p>
      {emp.commissionNote && <p className="mt-2 text-[11px] text-gray-500">Commission terms: {emp.commissionNote} (paid separately).</p>}
    </PrintDoc>
  );
}
