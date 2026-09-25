import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  SALARY_CYCLES,
  isPeriod,
  periodLabel,
  validateCustomFields,
} from "./constants";
import {
  createEntry,
  ensureDefaultCategories,
  fieldsFor,
  usdRateFor,
  type Result,
} from "./books";

/**
 * Employees — everyone the company pays a wage.
 *
 * Not the same thing as a staff ACCOUNT. A cleaner, a peon and an office
 * assistant have no login here and never will; a finance admin has both. The
 * `userId` link is optional for exactly that reason, and the existing wallet
 * payroll (src/lib/payroll) keeps paying account-holders into their wallet —
 * this module records wages paid OUTSIDE the platform, in cash or bKash.
 */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const clip = (v: string | null | undefined, n: number) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, n) : null;
};

export type EmployeeInput = {
  userId?: string | null;
  name: string;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  photoUrl?: string | null;
  employmentType: string;
  status: string;
  joinDate?: string | null;
  leaveDate?: string | null;
  salaryAmount: number;
  salaryCurrency: string;
  salaryCycle: string;
  commissionNote?: string | null;
  commissionPct?: number | null;
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
  customFields?: unknown;
};

function date(v: string | null | undefined): Date | null | "bad" {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

export async function saveEmployee(
  id: string | null,
  input: EmployeeInput
): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return fail("Give the employee a name");
  if (!EMPLOYMENT_TYPES.includes(input.employmentType as never)) return fail("Unknown employment type");
  if (!EMPLOYEE_STATUSES.includes(input.status as never)) return fail("Unknown status");
  if (!SALARY_CYCLES.includes(input.salaryCycle as never)) return fail("Unknown pay cycle");

  const salary = Number(input.salaryAmount);
  if (!Number.isFinite(salary) || salary < 0) return fail("Salary cannot be negative");
  const currency = input.salaryCurrency.trim().toUpperCase();
  if (!(await usdRateFor(currency))) {
    return fail(`No exchange rate is set for ${currency}. Add it under Settings → Currencies first.`);
  }

  const joinDate = date(input.joinDate);
  const leaveDate = date(input.leaveDate);
  if (joinDate === "bad" || leaveDate === "bad") return fail("A date is not valid");
  if (joinDate && leaveDate && leaveDate < joinDate) return fail("Leaving date is before joining date");
  // "Left" with no leaving date makes every later salary run ambiguous.
  if (input.status === "LEFT" && !leaveDate) return fail("Set the date this person left");

  let commissionPct: number | null = null;
  if (input.commissionPct !== null && input.commissionPct !== undefined && String(input.commissionPct) !== "") {
    commissionPct = Number(input.commissionPct);
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      return fail("Commission must be between 0 and 100 percent");
    }
  }

  // One person, one HR record — the column is unique, but a sentence beats a
  // constraint error.
  if (input.userId) {
    const taken = await prisma.employee.findFirst({
      where: { userId: input.userId, ...(id ? { id: { not: id } } : {}) },
      select: { name: true },
    });
    if (taken) return fail(`That account is already linked to ${taken.name}`);
  }

  const defs = await fieldsFor("EMPLOYEE");
  const cf = validateCustomFields(defs, input.customFields);
  if (cf.error) return fail(cf.error);

  const data = {
    userId: input.userId || null,
    name,
    designation: clip(input.designation, 120),
    department: clip(input.department, 120),
    phone: clip(input.phone, 40),
    email: clip(input.email, 160),
    address: clip(input.address, 400),
    nationalId: clip(input.nationalId, 60),
    photoUrl: clip(input.photoUrl, 500),
    employmentType: input.employmentType,
    status: input.status,
    joinDate,
    leaveDate,
    salaryAmount: Math.round(salary * 100) / 100,
    salaryCurrency: currency,
    salaryCycle: input.salaryCycle,
    commissionNote: clip(input.commissionNote, 1000),
    commissionPct,
    paymentMethod: clip(input.paymentMethod, 60),
    paymentDetails: clip(input.paymentDetails, 400),
    emergencyContact: clip(input.emergencyContact, 200),
    notes: clip(input.notes, 4000),
    customFields: cf.values as Prisma.InputJsonValue,
  };

  const row = id
    ? await prisma.employee.update({ where: { id }, data, select: { id: true } })
    : await prisma.employee.create({ data, select: { id: true } });
  return { ok: true, data: row };
}

export async function listEmployees(opts: { status?: string; q?: string } = {}) {
  const rows = await prisma.employee.findMany({
    where: {
      ...(opts.status && EMPLOYEE_STATUSES.includes(opts.status as never) ? { status: opts.status } : {}),
      ...(opts.q?.trim()
        ? {
            OR: [
              { name: { contains: opts.q.trim(), mode: "insensitive" } },
              { designation: { contains: opts.q.trim(), mode: "insensitive" } },
              { department: { contains: opts.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  return rows.map((r) => ({
    ...r,
    salaryAmount: toNum(r.salaryAmount),
    commissionPct: r.commissionPct === null ? null : toNum(r.commissionPct),
  }));
}

/**
 * The key that makes paying a salary idempotent.
 *
 * `salary:<employee>:<period>` is unique on FinanceEntry, so paying the same
 * person twice for the same month is physically impossible, not merely
 * discouraged: a double click, a retry after a timeout and two finance staff
 * on the same screen all collapse to one entry. Mirrors the wallet payroll's
 * `payroll_salary_2026-09` reference for the same reason.
 */
export const salaryKey = (employeeId: string, period: string) => `salary:${employeeId}:${period}`;

/**
 * Record one employee's salary for one month.
 *
 * `markPaid` false writes it as PENDING — "owed, not yet handed over" — which
 * is how the month's payroll is prepared before the cash goes out. The amount
 * defaults to the employee's configured salary and can be overridden for a
 * deduction, an advance or a part month; the override is what gets recorded.
 */
export async function recordSalary(
  actorId: string,
  input: {
    employeeId: string;
    period: string;
    amount?: number | null;
    markPaid?: boolean;
    paidAt?: string | null;
    paymentMethod?: string | null;
    reference?: string | null;
    note?: string | null;
  }
): Promise<Result<{ id: string; duplicate?: boolean }>> {
  if (!isPeriod(input.period)) return fail("Pick the month this salary is for");
  const emp = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      name: true,
      status: true,
      salaryAmount: true,
      salaryCurrency: true,
      paymentMethod: true,
      joinDate: true,
      leaveDate: true,
    },
  });
  if (!emp) return fail("That employee no longer exists");

  // A month wholly before they joined or after they left is not owed. Checked
  // on the period's first and last day, so someone who joined on the 20th is
  // still payable for that month.
  const [y, m] = input.period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  if (emp.joinDate && emp.joinDate > monthEnd) {
    return fail(`${emp.name} had not joined yet in ${periodLabel(input.period)}`);
  }
  if (emp.leaveDate && emp.leaveDate < monthStart) {
    return fail(`${emp.name} had already left before ${periodLabel(input.period)}`);
  }

  const amount =
    input.amount === null || input.amount === undefined ? toNum(emp.salaryAmount) : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail(`No salary is set for ${emp.name}. Set it on their record, or enter an amount.`);
  }

  await ensureDefaultCategories();
  const cat = await prisma.financeCategory.findUnique({ where: { slug: "salary" }, select: { id: true } });
  if (!cat) return fail("The Salaries category is missing");

  return createEntry(
    actorId,
    {
      kind: "EXPENSE",
      categoryId: cat.id,
      employeeId: emp.id,
      title: `Salary — ${emp.name} — ${periodLabel(input.period)}`,
      description: input.note ?? null,
      amount,
      currency: emp.salaryCurrency,
      period: input.period,
      paymentMethod: input.paymentMethod ?? emp.paymentMethod ?? null,
      reference: input.reference ?? null,
    },
    {
      markPaid: !!input.markPaid,
      paidAt: input.paidAt ?? null,
      source: "SALARY",
      dedupeKey: salaryKey(emp.id, input.period),
    }
  );
}

/**
 * The month's payroll at a glance: every employee who was on the books that
 * month, what they are owed, and whether it has been recorded and paid.
 */
export async function salarySheet(period: string) {
  if (!isPeriod(period)) return [];
  const [y, m] = period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));

  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({
      where: {
        AND: [
          { OR: [{ joinDate: null }, { joinDate: { lte: monthEnd } }] },
          { OR: [{ leaveDate: null }, { leaveDate: { gte: monthStart } }] },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        designation: true,
        status: true,
        salaryAmount: true,
        salaryCurrency: true,
        paymentMethod: true,
      },
    }),
    prisma.financeEntry.findMany({
      where: { period, source: "SALARY", status: { not: "VOID" } },
      select: { id: true, employeeId: true, status: true, amount: true, currency: true, paidAt: true },
    }),
  ]);

  const byEmp = new Map(entries.map((e) => [e.employeeId, e]));
  return employees.map((e) => {
    const entry = byEmp.get(e.id);
    return {
      ...e,
      salaryAmount: toNum(e.salaryAmount),
      entry: entry
        ? { id: entry.id, status: entry.status, amount: toNum(entry.amount), currency: entry.currency, paidAt: entry.paidAt }
        : null,
    };
  });
}
