import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getRevenueBreakdown } from "@/lib/finance/revenue";
import { getPayrollExpense } from "@/lib/payroll/run";
import { getMarketplaceTaxConfig } from "@/lib/marketplace-selling";
import { isPeriod, periodsBetween } from "./constants";

/**
 * What the company earned, what it spent, and what it owes the tax office.
 *
 * Two rules that every figure here obeys, because breaking either one produces
 * numbers that look fine and are wrong:
 *
 *  1. TAX IS NOT THE COMPANY'S MONEY. VAT collected from a buyer is held for the
 *     authority; VAT on a vendor's bill is claimed back or settled against it.
 *     So tax is never counted as revenue and never counted as a cost. It lives
 *     in the tax register, on its own. An expense of ৳11,500 that includes
 *     ৳1,500 VAT is a ৳10,000 cost plus ৳1,500 of tax.
 *
 *  2. ONLY PAID MONEY COUNTS. A pending bill is a liability to show, not a cost
 *     that has happened. Voided entries count nowhere.
 */

function periodRange(from: string, to: string): { from: Date; to: Date } {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return {
    from: new Date(Date.UTC(fy, fm - 1, 1)),
    to: new Date(Date.UTC(ty, tm, 1) - 1),
  };
}

/* ------------------------------------------------------------------ *
 * The tax register
 * ------------------------------------------------------------------ */

export type TaxLine = {
  label: string;
  /** Collected from customers — owed to the authority. */
  collectedUsd: number;
  /** Paid inside vendor bills — reported, claimable or not by jurisdiction. */
  paidOnExpensesUsd: number;
  /** Actually handed to the authority. */
  remittedUsd: number;
  /** collected − remitted. Positive = still owed. */
  outstandingUsd: number;
};

export type TaxRegister = {
  lines: TaxLine[];
  totals: Omit<TaxLine, "label">;
  /** Where each collected figure comes from, so a total can be audited. */
  sources: { key: string; label: string; usd: number; count: number; from: string; measured: boolean }[];
  /** Things the owner should know that change how to read the numbers. */
  notes: string[];
};

/** Normalise "vat", "VAT 15%", "Vat" to one bucket. */
function taxBucket(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  if (!s) return "Other tax";
  const low = s.toLowerCase();
  if (low.startsWith("vat")) return "VAT";
  if (low.includes("income")) return "Income tax";
  if (low.startsWith("ait")) return "AIT";
  if (low.includes("withhold")) return "Withholding tax";
  return s.slice(0, 40);
}

export async function taxRegister(from: string, to: string): Promise<TaxRegister> {
  if (!isPeriod(from) || !isPeriod(to)) {
    return { lines: [], totals: zeroLine(), sources: [], notes: ["Pick a valid range"] };
  }
  const range = periodRange(from, to);

  const [mpCfg, marketplace, invoices, invoiceByLabel, expenseTax, remitted] = await Promise.all([
    getMarketplaceTaxConfig(),
    // Output tax 1 — VAT on the marketplace commission.
    prisma.marketplacePurchase.aggregate({
      where: { createdAt: { gte: range.from, lte: range.to }, tax: { gt: 0 } },
      _sum: { tax: true },
      _count: true,
    }),
    // Output tax 2 — tax on advertiser invoices. Collected on PAYMENT: an
    // unpaid invoice has collected nothing. This figure was being recorded on
    // every invoice and summed nowhere; the finance console only ever added up
    // the marketplace half.
    prisma.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: range.from, lte: range.to }, taxUsd: { gt: 0 } },
      _sum: { taxUsd: true },
      _count: true,
    }),
    prisma.invoice.groupBy({
      by: ["taxLabel"],
      where: { status: "PAID", paidAt: { gte: range.from, lte: range.to }, taxUsd: { gt: 0 } },
      _sum: { taxUsd: true },
    }) as unknown as Promise<{ taxLabel: string | null; _sum: { taxUsd: unknown } }[]>,
    // Input tax — the tax part of bills the company paid.
    prisma.financeEntry.groupBy({
      by: ["taxLabel"],
      where: { kind: "EXPENSE", status: "PAID", period: { gte: from, lte: to }, taxAmountUsd: { gt: 0 } },
      _sum: { taxAmountUsd: true },
    }) as unknown as Promise<{ taxLabel: string | null; _sum: { taxAmountUsd: unknown } }[]>,
    // Paid to the authority — the whole amount of a TAX_PAYMENT is tax.
    prisma.financeEntry.findMany({
      where: { kind: "TAX_PAYMENT", status: "PAID", period: { gte: from, lte: to } },
      select: { amountUsd: true, taxLabel: true, category: { select: { slug: true, name: true } } },
    }),
  ]);

  const lines = new Map<string, TaxLine>();
  const line = (label: string) => {
    const k = taxBucket(label);
    if (!lines.has(k)) lines.set(k, { label: k, ...zeroLine() });
    return lines.get(k)!;
  };

  const mpUsd = toNum(marketplace._sum.tax as never);
  if (mpUsd > 0) line(mpCfg.label).collectedUsd += mpUsd;
  for (const g of invoiceByLabel) line(g.taxLabel ?? "VAT").collectedUsd += toNum(g._sum.taxUsd as never);
  for (const g of expenseTax) line(g.taxLabel ?? "Other tax").paidOnExpensesUsd += toNum(g._sum.taxAmountUsd as never);
  for (const r of remitted) {
    // A payment filed under "VAT paid to authority" settles VAT even if nobody
    // typed a label on it — the category is the more reliable signal.
    const label =
      r.taxLabel ??
      (r.category.slug === "tax-vat" ? "VAT" : r.category.slug === "tax-income" ? "Income tax" : r.category.name);
    line(label).remittedUsd += toNum(r.amountUsd);
  }

  const out = [...lines.values()]
    .map((l) => ({ ...l, outstandingUsd: l.collectedUsd - l.remittedUsd }))
    .sort((a, b) => b.collectedUsd + b.remittedUsd - (a.collectedUsd + a.remittedUsd));

  const totals = out.reduce(
    (t, l) => ({
      collectedUsd: t.collectedUsd + l.collectedUsd,
      paidOnExpensesUsd: t.paidOnExpensesUsd + l.paidOnExpensesUsd,
      remittedUsd: t.remittedUsd + l.remittedUsd,
      outstandingUsd: t.outstandingUsd + l.outstandingUsd,
    }),
    zeroLine()
  );

  const invUsd = toNum(invoices._sum.taxUsd as never);
  const notes: string[] = [];
  if (!mpCfg.enabled) notes.push("Marketplace VAT is switched off, so marketplace sales collect none.");
  // Deposit VAT is displayed on the deposit screen when switched on, but no
  // column records it — so it cannot appear here, and saying nothing would
  // make the register look complete when it is not.
  const depositVat = await prisma.systemSetting.findUnique({ where: { key: "vat_enabled" }, select: { value: true } });
  if (depositVat?.value === true) {
    notes.push(
      "Deposit VAT is switched on, but deposits do not record a VAT amount — it is shown to users and collected nowhere in the books. It is missing from this register."
    );
  }

  return {
    lines: out,
    totals,
    sources: [
      {
        key: "marketplace",
        label: `Marketplace commission (${mpCfg.label})`,
        usd: mpUsd,
        count: marketplace._count,
        from: "MarketplacePurchase.tax",
        measured: marketplace._count > 0,
      },
      {
        key: "invoices",
        label: "Advertiser invoices",
        usd: invUsd,
        count: invoices._count,
        from: "Invoice.taxUsd (paid invoices)",
        measured: invoices._count > 0,
      },
    ],
    notes,
  };
}

function zeroLine() {
  return { collectedUsd: 0, paidOnExpensesUsd: 0, remittedUsd: 0, outstandingUsd: 0 };
}

/* ------------------------------------------------------------------ *
 * Profit & loss
 * ------------------------------------------------------------------ */

export type PnL = {
  from: string;
  to: string;
  revenue: { key: string; label: string; usd: number; measured: boolean }[];
  revenueUsd: number;
  otherIncomeUsd: number;
  expenses: { categoryId: string; name: string; color: string | null; usd: number; count: number }[];
  /** Company expenses, net of their tax part. */
  expensesUsd: number;
  /** Staff paid into their platform wallet by the existing payroll module. */
  walletPayrollUsd: number;
  /** Bills recorded but not yet paid — owed, not yet spent. */
  pendingUsd: number;
  netUsd: number;
  byMonth: { period: string; incomeUsd: number; expenseUsd: number; netUsd: number }[];
};

export async function profitAndLoss(from: string, to: string): Promise<PnL | null> {
  if (!isPeriod(from) || !isPeriod(to) || from > to) return null;
  const range = periodRange(from, to);

  const [rev, wallet, expenseRows, incomeAgg, pendingAgg, monthly] = await Promise.all([
    getRevenueBreakdown(range),
    getPayrollExpense(range),
    prisma.financeEntry.groupBy({
      by: ["categoryId"],
      where: { kind: "EXPENSE", status: "PAID", period: { gte: from, lte: to } },
      _sum: { amountUsd: true, taxAmountUsd: true },
      _count: { _all: true },
    }) as unknown as Promise<
      { categoryId: string; _sum: { amountUsd: unknown; taxAmountUsd: unknown }; _count: { _all: number } }[]
    >,
    prisma.financeEntry.aggregate({
      where: { kind: "INCOME", status: "PAID", period: { gte: from, lte: to } },
      _sum: { amountUsd: true, taxAmountUsd: true },
    }),
    prisma.financeEntry.aggregate({
      where: { kind: "EXPENSE", status: "PENDING", period: { gte: from, lte: to } },
      _sum: { amountUsd: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["period", "kind"],
      where: { kind: { in: ["EXPENSE", "INCOME"] }, status: "PAID", period: { gte: from, lte: to } },
      _sum: { amountUsd: true, taxAmountUsd: true },
    }) as unknown as Promise<
      { period: string; kind: string; _sum: { amountUsd: unknown; taxAmountUsd: unknown } }[]
    >,
  ]);

  const cats = await prisma.financeCategory.findMany({
    where: { id: { in: expenseRows.map((r) => r.categoryId) } },
    select: { id: true, name: true, color: true },
  });
  const catById = new Map(cats.map((c) => [c.id, c]));

  const expenses = expenseRows
    .map((r) => ({
      categoryId: r.categoryId,
      name: catById.get(r.categoryId)?.name ?? "Unknown",
      color: catById.get(r.categoryId)?.color ?? null,
      // Net of tax — rule 1.
      usd: toNum(r._sum.amountUsd as never) - toNum(r._sum.taxAmountUsd as never),
      count: r._count._all,
    }))
    .sort((a, b) => b.usd - a.usd);

  const expensesUsd = expenses.reduce((s, e) => s + e.usd, 0);
  const otherIncomeUsd =
    toNum(incomeAgg._sum.amountUsd as never) - toNum(incomeAgg._sum.taxAmountUsd as never);

  // The monthly series covers company books month by month. Platform revenue
  // and wallet payroll are only available as a total over the range here, so
  // the chart shows the company's own income and costs, labelled as such.
  const months = periodsBetween(from, to);
  const byMonth = months.map((p) => {
    const inc = monthly.find((m) => m.period === p && m.kind === "INCOME");
    const exp = monthly.find((m) => m.period === p && m.kind === "EXPENSE");
    const incomeUsd = inc ? toNum(inc._sum.amountUsd as never) - toNum(inc._sum.taxAmountUsd as never) : 0;
    const expenseUsd = exp ? toNum(exp._sum.amountUsd as never) - toNum(exp._sum.taxAmountUsd as never) : 0;
    return { period: p, incomeUsd, expenseUsd, netUsd: incomeUsd - expenseUsd };
  });

  const revenueUsd = rev.totalUsd;
  return {
    from,
    to,
    revenue: rev.streams.map((s) => ({ key: s.key, label: s.label, usd: s.usd, measured: s.measured })),
    revenueUsd,
    otherIncomeUsd,
    expenses,
    expensesUsd,
    walletPayrollUsd: wallet.usd,
    pendingUsd: toNum(pendingAgg._sum.amountUsd as never),
    netUsd: revenueUsd + otherIncomeUsd - expensesUsd - wallet.usd,
    byMonth,
  };
}
