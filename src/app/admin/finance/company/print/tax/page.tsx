import { taxRegister } from "@/lib/company-finance/reports";
import { isPeriod, periodLabel, periodOf, shiftPeriod } from "@/lib/company-finance/constants";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import { printGuard } from "../_guard";

export const dynamic = "force-dynamic";

export default async function TaxPrint({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const g = await printGuard("finance.view");
  const sp = await searchParams;
  const to = isPeriod(sp.to) ? sp.to : periodOf(new Date());
  const from = isPeriod(sp.from) ? sp.from : shiftPeriod(to, -11);
  const reg = await taxRegister(from, to);

  return (
    <PrintDoc
      title="VAT & Tax Register"
      subtitle={`${periodLabel(from)} – ${periodLabel(to)} · all figures in USD`}
      printedBy={g.name}
      signatures={["Prepared by", "Approved by"]}
    >
      <table>
        <thead>
          <tr>
            <th>Tax</th>
            <th className="num">Collected</th>
            <th className="num">Paid on expenses</th>
            <th className="num">Paid to authority</th>
            <th className="num">Still owed</th>
          </tr>
        </thead>
        <tbody>
          {reg.lines.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "#6b7280" }}>No tax collected or paid in this range.</td></tr>
          ) : (
            reg.lines.map((l) => (
              <tr key={l.label}>
                <td style={{ fontWeight: 600 }}>{l.label}</td>
                <td className="num">{paperMoney(l.collectedUsd, "USD")}</td>
                <td className="num">{paperMoney(l.paidOnExpensesUsd, "USD")}</td>
                <td className="num">{paperMoney(l.remittedUsd, "USD")}</td>
                <td className="num">{paperMoney(l.outstandingUsd, "USD")}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 600 }}>Total</td>
            <td className="num" style={{ fontWeight: 700 }}>{paperMoney(reg.totals.collectedUsd, "USD")}</td>
            <td className="num" style={{ fontWeight: 700 }}>{paperMoney(reg.totals.paidOnExpensesUsd, "USD")}</td>
            <td className="num" style={{ fontWeight: 700 }}>{paperMoney(reg.totals.remittedUsd, "USD")}</td>
            <td className="num" style={{ fontWeight: 700 }}>{paperMoney(reg.totals.outstandingUsd, "USD")}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 mb-1 text-[12px] font-semibold">Sources of tax collected</p>
      <table>
        <tbody>
          {reg.sources.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td style={{ color: "#6b7280", fontFamily: "monospace", fontSize: 10 }}>{s.from}</td>
              <td className="num" style={{ width: 160 }}>{s.measured ? `${paperMoney(s.usd, "USD")} (${s.count})` : "no activity"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reg.notes.map((n) => (
        <p key={n} className="mt-2 text-[11px] text-gray-600">Note: {n}</p>
      ))}
    </PrintDoc>
  );
}
