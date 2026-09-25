import { profitAndLoss } from "@/lib/company-finance/reports";
import { isPeriod, periodLabel, periodOf, shiftPeriod } from "@/lib/company-finance/constants";
import { PrintDoc, paperMoney } from "@/components/admin/company-finance/print/print-doc";
import { printGuard } from "../_guard";

export const dynamic = "force-dynamic";

export default async function PnlPrint({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const g = await printGuard("finance.view");
  const sp = await searchParams;
  const to = isPeriod(sp.to) ? sp.to : periodOf(new Date());
  const from = isPeriod(sp.from) ? sp.from : shiftPeriod(to, -5);
  const pnl = await profitAndLoss(from, to);

  return (
    <PrintDoc
      title="Profit & Loss Statement"
      subtitle={`${periodLabel(from)} – ${periodLabel(to)} · all figures in USD`}
      printedBy={g.name}
      signatures={["Prepared by", "Approved by"]}
    >
      {!pnl ? (
        <p>Invalid range.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr><th>Income</th><th className="num" style={{ width: 160 }}>USD</th></tr>
            </thead>
            <tbody>
              {pnl.revenue.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.measured ? paperMoney(r.usd, "USD") : "no activity"}</td>
                </tr>
              ))}
              {pnl.otherIncomeUsd > 0 && (
                <tr><td>Other income</td><td className="num">{paperMoney(pnl.otherIncomeUsd, "USD")}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr><td style={{ fontWeight: 600 }}>Total income</td><td className="num" style={{ fontWeight: 700 }}>{paperMoney(pnl.revenueUsd + pnl.otherIncomeUsd, "USD")}</td></tr>
            </tfoot>
          </table>

          <table style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Costs (net of tax)</th><th className="num" style={{ width: 160 }}>USD</th></tr>
            </thead>
            <tbody>
              {pnl.expenses.length === 0 && pnl.walletPayrollUsd === 0 ? (
                <tr><td colSpan={2} style={{ color: "#6b7280" }}>No paid costs in this range.</td></tr>
              ) : (
                <>
                  {pnl.expenses.map((e) => (
                    <tr key={e.categoryId}><td>{e.name} ({e.count})</td><td className="num">{paperMoney(e.usd, "USD")}</td></tr>
                  ))}
                  {pnl.walletPayrollUsd > 0 && (
                    <tr><td>Staff paid to platform wallet</td><td className="num">{paperMoney(pnl.walletPayrollUsd, "USD")}</td></tr>
                  )}
                </>
              )}
            </tbody>
            <tfoot>
              <tr><td style={{ fontWeight: 600 }}>Total costs</td><td className="num" style={{ fontWeight: 700 }}>{paperMoney(pnl.expensesUsd + pnl.walletPayrollUsd, "USD")}</td></tr>
            </tfoot>
          </table>

          <table style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, fontSize: 14 }}>{pnl.netUsd >= 0 ? "Net profit" : "Net loss"}</td>
                <td className="num" style={{ fontWeight: 700, fontSize: 14, width: 160 }}>{paperMoney(pnl.netUsd, "USD")}</td>
              </tr>
              <tr>
                <td style={{ color: "#6b7280" }}>Bills recorded but not yet paid (not in costs above)</td>
                <td className="num" style={{ color: "#6b7280" }}>{paperMoney(pnl.pendingUsd, "USD")}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-gray-500">
            Tax collected or paid is excluded from both income and costs — it is held for, or paid to, the tax authority. See
            the VAT &amp; Tax register. Only paid entries are counted.
          </p>
        </>
      )}
    </PrintDoc>
  );
}
