/**
 * The company's own books — checked against the live database.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-company-finance.ts
 *
 * What is asserted is the set of properties that make a ledger trustworthy,
 * each of which would produce numbers that LOOK fine if it broke:
 *
 *  - money in taka is converted at a rate that is frozen on the row;
 *  - an unknown currency is refused rather than guessed at 1:1;
 *  - tax is kept apart from cost, and never counted as either revenue or cost;
 *  - a salary cannot be recorded twice for the same month, however it is tried;
 *  - a recurring bill writes each month exactly once, and never the future;
 *  - a paid entry cannot be edited, only voided with a reason;
 *  - two people marking the same bill paid cannot both succeed;
 *  - custom fields are enforced.
 *
 * Everything it creates is tagged and removed at the end.
 */
import { prisma } from "./_q";
import {
  createEntry,
  updateEntry,
  markEntryPaid,
  voidEntry,
  ensureDefaultCategories,
  saveFieldDef,
  savePayee,
  usdRateFor,
} from "../src/lib/company-finance/books";
import { saveEmployee, recordSalary, salaryKey } from "../src/lib/company-finance/hr";
import { saveRecurring, generateRecurring } from "../src/lib/company-finance/recurring";
import { profitAndLoss, taxRegister } from "../src/lib/company-finance/reports";
import { DEFAULT_CATEGORIES, periodOf, shiftPeriod } from "../src/lib/company-finance/constants";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

const TAG = "verify-company-finance";
// A test month far in the past, so nothing real shares it and the P&L for it
// contains only what this script wrote.
const P = "2019-03";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
  if (!admin) {
    console.log("No super admin to act as.");
    process.exit(1);
  }
  const me = admin.id;

  const created = { entries: [] as string[], employees: [] as string[], payees: [] as string[], recurring: [] as string[], fields: [] as string[] };

  try {
    console.log("Categories");
    await ensureDefaultCategories();
    await ensureDefaultCategories();
    const sys = await prisma.financeCategory.count({ where: { isSystem: true } });
    check("seeding twice leaves exactly one of each", sys === DEFAULT_CATEGORIES.length, `${sys}`);
    const cat = (slug: string) =>
      prisma.financeCategory.findUniqueOrThrow({ where: { slug }, select: { id: true } }).then((c) => c.id);
    const electricity = await cat("electricity");
    const salaryCat = await cat("salary");
    const vatPaid = await cat("tax-vat");
    const otherIncome = await cat("other-income");
    check("every owner example has a category", !!(electricity && salaryCat && vatPaid && otherIncome));

    console.log("\nCurrency");
    const bdt = await usdRateFor("BDT");
    check("taka has a rate", !!bdt && bdt > 1, `৳${bdt} = $1`);
    check("an unknown currency has none", (await usdRateFor("XYZ")) === null);

    const bill = await createEntry(me, {
      kind: "EXPENSE",
      categoryId: electricity,
      title: `${TAG} electricity`,
      amount: 11500,
      currency: "BDT",
      taxAmount: 1500,
      taxLabel: "VAT",
      period: P,
    });
    check("a taka bill records", bill.ok, bill.ok ? "" : bill.error);
    if (!bill.ok) throw new Error("cannot continue");
    created.entries.push(bill.data.id);
    const row = await prisma.financeEntry.findUniqueOrThrow({ where: { id: bill.data.id } });
    check(
      "converted at the snapshotted rate",
      Math.abs(Number(row.amountUsd) - 11500 / Number(row.usdRate)) < 0.001,
      `৳11,500 → $${Number(row.amountUsd).toFixed(2)} at ${row.usdRate}`
    );
    check("its tax is held separately", Number(row.taxAmount) === 1500 && row.taxLabel === "VAT");
    check("it starts PENDING — recording is not paying", row.status === "PENDING");

    const guessed = await createEntry(me, {
      kind: "EXPENSE", categoryId: electricity, title: `${TAG} bad`, amount: 10, currency: "XYZ", period: P,
    });
    check("an unknown currency is refused, not guessed at 1:1", !guessed.ok, guessed.ok ? "accepted!" : guessed.error);

    console.log("\nThe entry rules");
    const taxTooBig = await createEntry(me, {
      kind: "EXPENSE", categoryId: electricity, title: `${TAG} bad`, amount: 100, currency: "BDT",
      taxAmount: 200, taxLabel: "VAT", period: P,
    });
    check("tax larger than the bill is refused", !taxTooBig.ok);
    const taxNoLabel = await createEntry(me, {
      kind: "EXPENSE", categoryId: electricity, title: `${TAG} bad`, amount: 100, currency: "BDT",
      taxAmount: 10, period: P,
    });
    check("tax with no label is refused", !taxNoLabel.ok);
    const wrongKind = await createEntry(me, {
      kind: "TAX_PAYMENT", categoryId: electricity, title: `${TAG} bad`, amount: 100, currency: "BDT", period: P,
    });
    check(
      "a tax payment filed under Electricity is refused",
      !wrongKind.ok,
      wrongKind.ok ? "accepted!" : wrongKind.error
    );

    console.log("\nPaying");
    const [a, b] = await Promise.all([markEntryPaid(bill.data.id, me), markEntryPaid(bill.data.id, me)]);
    check("two people pressing Pay at once: exactly one succeeds", [a, b].filter((r) => r.ok).length === 1);
    const edit = await updateEntry(bill.data.id, {
      kind: "EXPENSE", categoryId: electricity, title: "changed", amount: 1, currency: "BDT", period: P,
    });
    check("a paid entry cannot be edited", !edit.ok, edit.ok ? "edited!" : edit.error);
    const noReason = await voidEntry(bill.data.id, me, "");
    check("a void needs a reason", !noReason.ok);

    console.log("\nCustom fields");
    const f = await saveFieldDef({
      entity: "ENTRY", categoryId: electricity, label: `${TAG} Meter`, type: "SELECT",
      options: ["Meter A", "Meter B"], required: true,
    });
    check("a category field is created", f.ok, f.ok ? "" : f.error);
    if (f.ok) created.fields.push(f.data.id);
    const dupField = await saveFieldDef({
      entity: "ENTRY", categoryId: electricity, label: `${TAG} Meter`, type: "TEXT",
    });
    check("the same field twice is refused", !dupField.ok);
    const missing = await createEntry(me, {
      kind: "EXPENSE", categoryId: electricity, title: `${TAG} x`, amount: 10, currency: "BDT", period: P,
    });
    check("a required field is enforced", !missing.ok, missing.ok ? "accepted!" : missing.error);
    const badOption = await createEntry(me, {
      kind: "EXPENSE", categoryId: electricity, title: `${TAG} x`, amount: 10, currency: "BDT", period: P,
      customFields: { [`${TAG.replace(/-/g, "_")}_meter`]: "Meter Z" },
    });
    check("a dropdown refuses a value it does not offer", !badOption.ok);
    // Other categories are not affected by Electricity's field.
    const gasCat = await cat("gas");
    const gas = await createEntry(me, {
      kind: "EXPENSE", categoryId: gasCat, title: `${TAG} gas`, amount: 2000, currency: "BDT", period: P,
    });
    check("a category's field does not leak into another", gas.ok, gas.ok ? "" : gas.error);
    if (gas.ok) created.entries.push(gas.data.id);
    if (f.ok) await prisma.financeFieldDef.update({ where: { id: f.data.id }, data: { isActive: false } });

    console.log("\nEmployees & salary");
    const emp = await saveEmployee(null, {
      name: `${TAG} Cleaner`, designation: "Cleaner", employmentType: "FULL_TIME", status: "ACTIVE",
      joinDate: "2019-02-01", salaryAmount: 12000, salaryCurrency: "BDT", salaryCycle: "MONTHLY",
    });
    check("an employee with no platform account is created", emp.ok, emp.ok ? "" : emp.error);
    if (!emp.ok) throw new Error("cannot continue");
    created.employees.push(emp.data.id);

    const [s1, s2] = await Promise.all([
      recordSalary(me, { employeeId: emp.data.id, period: P, markPaid: true }),
      recordSalary(me, { employeeId: emp.data.id, period: P, markPaid: true }),
    ]);
    check("both salary calls answer", s1.ok && s2.ok);
    const salaryRows = await prisma.financeEntry.count({ where: { dedupeKey: salaryKey(emp.data.id, P) } });
    check("the same salary twice at once makes ONE entry", salaryRows === 1, `${salaryRows}`);
    if (s1.ok) created.entries.push(s1.data.id);
    check("and the second is reported as already there", !!(s1.ok && s2.ok && (s1.data.duplicate || s2.data.duplicate)));

    const early = await recordSalary(me, { employeeId: emp.data.id, period: "2018-12" });
    check("no salary for a month before they joined", !early.ok, early.ok ? "recorded!" : early.error);

    const leftNoDate = await saveEmployee(emp.data.id, {
      name: `${TAG} Cleaner`, employmentType: "FULL_TIME", status: "LEFT",
      salaryAmount: 12000, salaryCurrency: "BDT", salaryCycle: "MONTHLY",
    });
    check("'Left' without a leaving date is refused", !leftNoDate.ok);

    console.log("\nPayees");
    const payee = await savePayee(null, { kind: "PLATFORM", name: `${TAG} Hosting Co` });
    check("a platform payee is created", payee.ok);
    if (payee.ok) created.payees.push(payee.data.id);

    console.log("\nRecurring");
    const start = shiftPeriod(P, -2);
    const rec = await saveRecurring(null, {
      kind: "EXPENSE", categoryId: await cat("rent"), payeeId: payee.ok ? payee.data.id : null,
      title: `${TAG} rent`, amount: 30000, currency: "BDT", dueDay: 5, startPeriod: start,
    });
    check("a recurring rent is created", rec.ok, rec.ok ? "" : rec.error);
    if (!rec.ok) throw new Error("cannot continue");
    created.recurring.push(rec.data.id);

    const g1 = await generateRecurring({ upTo: P, actorId: me });
    const g2 = await generateRecurring({ upTo: P, actorId: me });
    const recRows = await prisma.financeEntry.findMany({
      where: { recurringId: rec.data.id },
      select: { id: true, period: true, status: true },
    });
    created.entries.push(...recRows.map((r) => r.id));
    check("it caught up on every month from the start", recRows.length === 3, recRows.map((r) => r.period).join(" "));
    check("running it twice wrote nothing twice", g2.created === 0, `2nd run created ${g2.created}`);
    check("and never wrote the future", recRows.every((r) => r.period <= P));
    check("each one is PENDING — a bill never pays itself", recRows.every((r) => r.status === "PENDING"));
    void g1;

    console.log("\nOther income and a VAT payment");
    const inc = await createEntry(me, {
      kind: "INCOME", categoryId: otherIncome, title: `${TAG} sponsorship`, amount: 100, currency: "USD", period: P,
    }, { markPaid: true });
    if (inc.ok) created.entries.push(inc.data.id);
    const vat = await createEntry(me, {
      kind: "TAX_PAYMENT", categoryId: vatPaid, title: `${TAG} VAT return`, amount: 1000, currency: "BDT", period: P,
    }, { markPaid: true });
    if (vat.ok) created.entries.push(vat.data.id);
    check("other income and a VAT payment record", inc.ok && vat.ok);

    console.log("\nProfit & loss excludes tax, pending and void");
    const pnl = await profitAndLoss(P, P);
    const rate = Number(row.usdRate);
    // Paid: electricity ৳11,500 (of which ৳1,500 VAT) + salary ৳12,000.
    // Pending gas and rent must NOT count. The VAT payment must NOT count.
    const expectedCost = (10000 + 12000) / rate;
    check(
      "cost = paid bills net of their VAT",
      !!pnl && Math.abs(pnl.expensesUsd - expectedCost) < 0.01,
      `$${pnl?.expensesUsd.toFixed(2)} vs $${expectedCost.toFixed(2)}`
    );
    check("other income counts", !!pnl && Math.abs(pnl.otherIncomeUsd - 100) < 0.01, `$${pnl?.otherIncomeUsd}`);
    // Only March's rent. January's and February's belong to those months —
    // "the month this is FOR" is the whole point of `period`.
    const pendingExpected = (2000 + 30000) / rate;
    check(
      "pending bills are shown as owed, not as spent",
      !!pnl && Math.abs(pnl.pendingUsd - pendingExpected) < 0.01,
      `$${pnl?.pendingUsd.toFixed(2)}`
    );

    // Void the electricity bill — it must drop out of the cost entirely.
    await voidEntry(bill.data.id, me, "verify: wrong meter");
    const after = await profitAndLoss(P, P);
    check(
      "a voided bill drops out of the cost",
      !!after && Math.abs(after.expensesUsd - 12000 / rate) < 0.01,
      `$${after?.expensesUsd.toFixed(2)}`
    );
    const voided = await prisma.financeEntry.findUnique({ where: { id: bill.data.id } });
    check("but the row is kept, with its reason", voided?.status === "VOID" && !!voided.voidReason);

    console.log("\nThe tax register");
    const reg = await taxRegister(P, P);
    const vatLine = reg.lines.find((l) => l.label === "VAT");
    check("VAT paid to the authority is recorded", !!vatLine && Math.abs(vatLine.remittedUsd - 1000 / rate) < 0.01,
      `$${vatLine?.remittedUsd.toFixed(2)}`);
    check("a voided bill's VAT is not counted", !!vatLine && vatLine.paidOnExpensesUsd === 0, `$${vatLine?.paidOnExpensesUsd}`);
    check("sources say whether they measured anything", reg.sources.every((s) => typeof s.measured === "boolean"));
  } finally {
    await prisma.financeEntry.deleteMany({ where: { id: { in: created.entries } } });
    await prisma.financeEntry.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.recurringEntry.deleteMany({ where: { id: { in: created.recurring } } });
    await prisma.employee.deleteMany({ where: { id: { in: created.employees } } });
    await prisma.payee.deleteMany({ where: { id: { in: created.payees } } });
    await prisma.financeFieldDef.deleteMany({ where: { id: { in: created.fields } } });
    const left = await prisma.financeEntry.count({ where: { title: { contains: TAG } } });
    check("everything this script wrote is gone", left === 0, `${left} left`);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void periodOf;
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
