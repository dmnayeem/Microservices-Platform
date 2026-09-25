import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { amountInWords } from "@/lib/amount-in-words";
import { periodLabel, type LineItem } from "@/lib/company-finance/constants";
import { PAY_CATEGORY_SLUGS } from "@/lib/company-finance/api";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import { printGuard } from "../../_guard";

export const dynamic = "force-dynamic";

/**
 * One entry, printed as the paper the office actually uses:
 *   - a conveyance bill (itemised trips) for the Conveyance category,
 *   - a payment voucher / expense bill for any other expense,
 *   - a money receipt for other income,
 *   - a tax payment voucher for tax paid to the authority.
 */
export default async function VoucherPrint({ params }: { params: Promise<{ id: string }> }) {
  const g = await printGuard("finance.view");
  const { id } = await params;

  const e = await prisma.financeEntry.findUnique({
    where: { id },
    include: {
      category: { select: { name: true, slug: true } },
      employee: { select: { name: true, designation: true, department: true } },
      payee: { select: { name: true, address: true, taxId: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  if (!e) notFound();
  // The same salary rule as the screen: a pay row is not printable by someone
  // who may not see pay. 404 rather than 403, so its existence is not confirmed.
  const isPay = !!e.employeeId || e.source === "SALARY" || PAY_CATEGORY_SLUGS.includes(e.category.slug ?? "");
  if (isPay && !g.can("finance.hr.view")) notFound();
  if (e.source === "SALARY" && e.employeeId) redirect(`/admin/finance/company/print/payslip/${e.id}`);

  const lines = (Array.isArray(e.lineItems) ? e.lineItems : []) as unknown as LineItem[];
  const conveyance = e.category.slug === "conveyance";
  const amount = toNum(e.amount);
  const tax = toNum(e.taxAmount);
  const voucherNo = `${e.kind === "INCOME" ? "RCV" : e.kind === "TAX_PAYMENT" ? "TAX" : conveyance ? "CNV" : "PV"}-${e.period.replace("-", "")}-${e.id.slice(-6).toUpperCase()}`;
  const paidTo = e.employee?.name ?? e.payee?.name ?? "—";

  const title =
    e.kind === "INCOME"
      ? "Money Receipt"
      : e.kind === "TAX_PAYMENT"
        ? "Tax Payment Voucher"
        : conveyance
          ? "Conveyance Bill"
          : "Payment Voucher";

  return (
    <PrintDoc
      title={title}
      subtitle={e.status === "VOID" ? "VOID — this entry was cancelled" : e.status === "PENDING" ? "Pending — not yet paid" : undefined}
      printedBy={g.name}
      meta={[
        { label: "Voucher no.", value: voucherNo },
        { label: "Date", value: (e.paidAt ?? e.createdAt).toLocaleDateString("en-GB") },
        { label: e.kind === "INCOME" ? "Received from" : conveyance ? "Claimant" : "Paid to", value: paidTo },
        { label: "For the month of", value: periodLabel(e.period) },
        ...(e.employee?.designation ? [{ label: "Designation", value: e.employee.designation }] : []),
        ...(e.payee?.taxId ? [{ label: "Payee BIN/TIN", value: e.payee.taxId }] : []),
        { label: "Head of account", value: e.category.name },
        { label: "Payment method", value: e.paymentMethod ?? "—" },
        ...(e.reference ? [{ label: "Reference", value: e.reference }] : []),
      ]}
      signatures={
        e.kind === "INCOME"
          ? ["Received by", "Accounts"]
          : conveyance
            ? ["Claimant", "Checked by", "Approved by"]
            : ["Prepared by", "Approved by", "Received by"]
      }
    >
      {conveyance && lines.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>SL</th>
              <th style={{ width: 86 }}>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Purpose</th>
              <th style={{ width: 90 }}>Mode</th>
              <th className="num" style={{ width: 100 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{l.date ? new Date(l.date).toLocaleDateString("en-GB") : ""}</td>
                <td>{l.from ?? ""}</td>
                <td>{l.to ?? ""}</td>
                <td>{l.from && l.to && l.description === `${l.from} → ${l.to}` ? "" : l.description}</td>
                <td>{l.mode ?? ""}</td>
                <td className="num">{paperMoney(l.amount, e.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{ textAlign: "right", fontWeight: 600 }}>Total</td>
              <td className="num" style={{ fontWeight: 700 }}>{paperMoney(amount, e.currency)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>SL</th>
              <th>Particulars</th>
              {lines.some((l) => l.qty) && <th className="num" style={{ width: 60 }}>Qty</th>}
              <th className="num" style={{ width: 120 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(lines.length ? lines : [{ description: e.title + (e.description ? ` — ${e.description}` : ""), amount }]).map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{l.description}{l.date ? <span style={{ color: "#6b7280" }}> ({new Date(l.date).toLocaleDateString("en-GB")})</span> : null}</td>
                {lines.some((x) => x.qty) && <td className="num">{l.qty ?? ""}</td>}
                <td className="num">{paperMoney(l.amount, e.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {tax > 0 && (
              <tr>
                <td colSpan={lines.some((x) => x.qty) ? 3 : 2} style={{ textAlign: "right", color: "#6b7280" }}>
                  of which {e.taxLabel ?? "tax"}
                </td>
                <td className="num" style={{ color: "#6b7280" }}>{paperMoney(tax, e.currency)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={lines.some((x) => x.qty) ? 3 : 2} style={{ textAlign: "right", fontWeight: 600 }}>Total</td>
              <td className="num" style={{ fontWeight: 700 }}>{paperMoney(amount, e.currency)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className="mt-3 text-[13px]">
        <span className="text-gray-500">In words:</span> <span className="font-semibold">{amountInWords(amount, e.currency)}</span>
      </p>
      {e.currency !== "USD" && (
        <p className="text-[11px] text-gray-500">
          ≈ {paperMoney(toNum(e.amountUsd), "USD")} at {toNum(e.usdRate)} {e.currency} per USD, the rate recorded with this entry.
        </p>
      )}
      {e.status === "VOID" && e.voidReason && <p className="mt-2 text-[12px] font-semibold text-red-700">Void reason: {e.voidReason}</p>}
      <p className="mt-2 text-[11px] text-gray-500">
        Recorded by {e.createdBy?.name ?? "—"}
        {e.approvedBy?.name ? ` · approved by ${e.approvedBy.name}` : ""}
        {e.attachments.length ? ` · ${e.attachments.length} receipt(s) on file` : ""}
      </p>
    </PrintDoc>
  );
}
