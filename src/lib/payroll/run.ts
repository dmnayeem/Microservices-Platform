import "server-only";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, TransactionType } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { STAFF_WHERE } from "@/lib/staff";
import {
  BASES,
  getActivity,
  type ActivityMap,
  type BasisTally,
} from "./basis";
import {
  getPayrollConfig,
  rateFor,
  salaryAppliesIn,
  type PayrollConfig,
} from "./config";

/**
 * Running the staff side of the business.
 *
 * **The payout rail is the platform wallet.** Paying a staff member credits
 * their `cashBalance` and writes one `Transaction` row; they then withdraw
 * through the same queue, with the same fee and the same approval, as anybody
 * else. That is not a design preference, it is the only rail that exists: there
 * is no outbound payment integration anywhere in this codebase — deposits are
 * manual proof-of-payment and withdrawals are marked paid by hand — so a
 * "pay by bKash" button here would be a button that moves no money and lies
 * about it. Recording a payment made outside the platform needs a row of its
 * own (see the model sketch in the report); it is deliberately NOT faked by
 * writing a zero-amount ledger entry.
 *
 * **Idempotency.** Every payment's reference is derived from the person and the
 * period — `payroll_salary_2026-09` — so the ledger's
 * `@@unique([userId, reference])` makes paying the same person twice for the
 * same month physically impossible, not merely discouraged. A double click, a
 * retry after a timeout and two admins on the same screen all collapse to one
 * payment.
 *
 * **Ordering.** The ledger row is written FIRST and the balance second. If the
 * reference already exists the write throws before a single cent moves. The
 * other order — credit, then try to record it — is how you get money that was
 * paid twice and journalled once.
 */

/** A UTC calendar month, `YYYY-MM`. */
export type Period = string;

export function periodKey(d: Date): Period {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPeriod(v: unknown): v is Period {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** `[from, to)` in UTC for a period. */
export function periodRange(p: Period): { from: Date; to: Date } {
  const [y, m] = p.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
  };
}

/** The period that has fully closed — the sensible default to pay. */
export function lastClosedPeriod(now = new Date()): Period {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return periodKey(d);
}

export const SALARY_REF = (p: Period) => `payroll_salary_${p}`;
export const COMMISSION_REF = (p: Period) => `payroll_commission_${p}`;
/** Anything the finance console should treat as payroll cost. */
export const PAYROLL_REF_PREFIX = "payroll_";

export interface CommissionLine {
  key: string;
  label: string;
  unit: string;
  count: number;
  valueUsd: number;
  perUnitUsd: number;
  percentOfValue: number;
  /** count × perUnit + value × percent. */
  earnedUsd: number;
}

export interface StaffPayrollRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  title: string;
  /** Salary due for the period. 0 when no line is configured. */
  salaryUsd: number;
  /** True when the owner has never set a salary for this person. */
  salaryConfigured: boolean;
  commissionUsd: number;
  lines: CommissionLine[];
  salaryPaidUsd: number;
  salaryPaidAt: string | null;
  commissionPaidUsd: number;
  commissionPaidAt: string | null;
  /** Still owed: (salary − salary paid) + (commission − commission paid). */
  owedUsd: number;
}

export interface PayrollSheet {
  period: Period;
  enabled: boolean;
  from: string;
  to: string;
  rows: StaffPayrollRow[];
  totals: {
    salaryUsd: number;
    commissionUsd: number;
    paidUsd: number;
    owedUsd: number;
  };
  /** True when not one salary and not one commission rate has been set. */
  unconfigured: boolean;
}

function commissionLines(
  cfg: PayrollConfig,
  userId: string,
  tallies: Record<string, BasisTally> | undefined
): CommissionLine[] {
  return BASES.map((b) => {
    const t = tallies?.[b.key] ?? { count: 0, valueUsd: 0 };
    const r = rateFor(cfg, userId, b.key);
    const percent = b.hasValue ? r.percentOfValue : 0;
    return {
      key: b.key,
      label: b.label,
      unit: b.unit,
      count: t.count,
      valueUsd: b.hasValue ? t.valueUsd : 0,
      perUnitUsd: r.perUnitUsd,
      percentOfValue: percent,
      earnedUsd: t.count * r.perUnitUsd + (t.valueUsd * percent) / 100,
    };
  });
}

/** Payments already made for this period, keyed `userId|reference`. */
async function paidSoFar(period: Period) {
  const rows = await prisma.transaction.findMany({
    where: {
      type: TransactionType.BONUS,
      status: TransactionStatus.COMPLETED,
      reference: { in: [SALARY_REF(period), COMMISSION_REF(period)] },
    },
    select: { userId: true, reference: true, amount: true, createdAt: true },
  });
  const map = new Map<string, { usd: number; at: Date }>();
  for (const r of rows) {
    map.set(`${r.userId}|${r.reference}`, {
      usd: Math.abs(toNum(r.amount)),
      at: r.createdAt,
    });
  }
  return map;
}

/**
 * The payroll sheet for one period: who is owed what, and what has been paid.
 *
 * Staff are read from `STAFF_WHERE`, which derives from `ADMIN_ROLES` — there is
 * no `isStaff` column and one must not be added, because a denormalised copy
 * and the role enum drift the moment someone adds a role and forgets a backfill.
 */
export async function getPayrollSheet(period: Period): Promise<PayrollSheet> {
  const { from, to } = periodRange(period);
  const [cfg, staff, activity, paid] = await Promise.all([
    getPayrollConfig(),
    prisma.user.findMany({
      where: STAFF_WHERE,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    getActivity(from, to),
    paidSoFar(period),
  ]);

  const rows = staff.map((u) =>
    buildRow(u, cfg, activity, paid, period)
  );

  // Someone who left the payroll can still be owed commission for work they did
  // inside the period, and someone already paid must never vanish off the sheet
  // — either would make the period's total wrong. Both are picked up here.
  const known = new Set(staff.map((u) => u.id));
  const strays = new Set<string>();
  for (const id of Object.keys(activity)) if (!known.has(id)) strays.add(id);
  for (const k of paid.keys()) {
    const id = k.split("|")[0];
    if (!known.has(id)) strays.add(id);
  }
  if (strays.size > 0) {
    const extra = await prisma.user.findMany({
      where: { id: { in: [...strays] } },
      select: { id: true, name: true, email: true, role: true },
    });
    for (const u of extra) rows.push(buildRow(u, cfg, activity, paid, period));
  }

  const relevant = rows.filter(
    (r) =>
      r.salaryUsd > 0 ||
      r.commissionUsd > 0 ||
      r.salaryPaidUsd > 0 ||
      r.commissionPaidUsd > 0 ||
      r.lines.some((l) => l.count > 0)
  );

  const totals = relevant.reduce(
    (acc, r) => ({
      salaryUsd: acc.salaryUsd + r.salaryUsd,
      commissionUsd: acc.commissionUsd + r.commissionUsd,
      paidUsd: acc.paidUsd + r.salaryPaidUsd + r.commissionPaidUsd,
      owedUsd: acc.owedUsd + r.owedUsd,
    }),
    { salaryUsd: 0, commissionUsd: 0, paidUsd: 0, owedUsd: 0 }
  );

  const anyRate =
    Object.values(cfg.salaries).some((s) => s.monthlyUsd > 0) ||
    Object.values(cfg.commission).some(
      (r) => r.perUnitUsd > 0 || r.percentOfValue > 0
    );

  return {
    period,
    enabled: cfg.enabled,
    from: from.toISOString(),
    to: to.toISOString(),
    rows: relevant,
    totals,
    unconfigured: !anyRate,
  };
}

function buildRow(
  u: { id: string; name: string | null; email: string | null; role: string },
  cfg: PayrollConfig,
  activity: ActivityMap,
  paid: Map<string, { usd: number; at: Date }>,
  period: Period
): StaffPayrollRow {
  const line = cfg.salaries[u.id];
  const applies = line ? salaryAppliesIn(line, period) : false;
  const salaryUsd = applies ? line!.monthlyUsd : 0;
  const lines = commissionLines(cfg, u.id, activity[u.id]);
  const commissionUsd = lines.reduce((s, l) => s + l.earnedUsd, 0);
  const sPaid = paid.get(`${u.id}|${SALARY_REF(period)}`);
  const cPaid = paid.get(`${u.id}|${COMMISSION_REF(period)}`);
  return {
    userId: u.id,
    name: u.name ?? "—",
    email: u.email ?? "",
    role: u.role,
    title: line?.title ?? "",
    salaryUsd,
    salaryConfigured: !!line && line.monthlyUsd > 0,
    commissionUsd,
    lines,
    salaryPaidUsd: sPaid?.usd ?? 0,
    salaryPaidAt: sPaid?.at.toISOString() ?? null,
    commissionPaidUsd: cPaid?.usd ?? 0,
    commissionPaidAt: cPaid?.at.toISOString() ?? null,
    owedUsd:
      Math.max(0, salaryUsd - (sPaid?.usd ?? 0)) +
      Math.max(0, commissionUsd - (cPaid?.usd ?? 0)),
  };
}

export type PayKind = "salary" | "commission";

export type PayResult =
  | { ok: true; paidUsd: number; transactionId: string }
  | {
      ok: false;
      reason: "DISABLED" | "NOT_STAFF" | "NOTHING_OWED" | "ALREADY_PAID" | "BAD_PERIOD";
    };

/**
 * Pay one person one component of one period.
 *
 * Deliberately narrow: no "pay everyone" button. A bulk payroll run is a single
 * click that moves every salary at once, and this platform has already been
 * bitten by a bulk admin action that named nobody in the audit trail. One
 * payment, one audited row, one attributable actor.
 *
 * The amount is recomputed here from the config and the activity — never taken
 * from the client — so a tampered request cannot pay an amount the sheet never
 * showed.
 */
export async function payPayroll(args: {
  period: Period;
  userId: string;
  kind: PayKind;
}): Promise<PayResult> {
  const cfg = await getPayrollConfig();
  if (!cfg.enabled) return { ok: false, reason: "DISABLED" };

  // A salary line with no start/end period "applies" to every month ever, and
  // each month has its own ledger reference — so without a bound, one person
  // could be paid years of salary in advance (or for months before their
  // account existed), one click per month. Only a month that has started, and
  // not one before the account was created, is payable.
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (args.period > currentPeriod) return { ok: false, reason: "BAD_PERIOD" };
  const payee = await prisma.user.findUnique({ where: { id: args.userId }, select: { createdAt: true } });
  if (payee) {
    const c = payee.createdAt;
    const joined = `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}`;
    if (args.period < joined) return { ok: false, reason: "BAD_PERIOD" };
  }

  const sheet = await getPayrollSheet(args.period);
  const row = sheet.rows.find((r) => r.userId === args.userId);
  if (!row) return { ok: false, reason: "NOT_STAFF" };

  const due = args.kind === "salary" ? row.salaryUsd : row.commissionUsd;
  const already =
    args.kind === "salary" ? row.salaryPaidUsd : row.commissionPaidUsd;
  if (already > 0) return { ok: false, reason: "ALREADY_PAID" };
  // Rounded to the cent: a salary of 33.333333 would otherwise credit a balance
  // that no invoice can ever match.
  const amount = Math.round((due - already) * 100) / 100;
  if (!(amount > 0)) return { ok: false, reason: "NOTHING_OWED" };

  const reference =
    args.kind === "salary"
      ? SALARY_REF(args.period)
      : COMMISSION_REF(args.period);

  const description =
    args.kind === "salary"
      ? `Salary — ${args.period}`
      : `Commission — ${args.period}`;

  try {
    return await prisma.$transaction(async (tx) => {
      // Ledger first: a duplicate reference throws here, before any cash moves.
      const created = await tx.transaction.create({
        data: {
          userId: args.userId,
          type: TransactionType.BONUS,
          status: TransactionStatus.COMPLETED,
          amount,
          points: 0,
          description,
          reference,
          metadata: {
            kind: "payroll",
            component: args.kind,
            period: args.period,
            // The basis snapshot, so a rate change later cannot rewrite what
            // this payment was for.
            lines:
              args.kind === "commission"
                ? row.lines
                    .filter((l) => l.earnedUsd > 0)
                    .map((l) => ({
                      key: l.key,
                      count: l.count,
                      valueUsd: l.valueUsd,
                      perUnitUsd: l.perUnitUsd,
                      percentOfValue: l.percentOfValue,
                      earnedUsd: l.earnedUsd,
                    }))
                : [],
            title: row.title,
            role: row.role,
          },
        },
        select: { id: true },
      });

      const credited = await tx.user.updateMany({
        where: { id: args.userId },
        data: { cashBalance: { increment: amount } },
      });
      if (credited.count !== 1) throw new Error("PAYROLL_CREDIT_FAILED");

      return { ok: true as const, paidUsd: amount, transactionId: created.id };
    });
  } catch (e) {
    if (isDuplicateLedgerError(e)) return { ok: false, reason: "ALREADY_PAID" };
    throw e;
  }
}

/**
 * Payroll cost in a window, for the finance console's expense line.
 *
 * Read from the ledger by reference prefix rather than from the config, because
 * the config says what SHOULD be paid and only the ledger says what WAS.
 */
export async function getPayrollExpense(range: {
  from?: Date;
  to?: Date;
}): Promise<{ usd: number; count: number; measured: boolean }> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: TransactionType.BONUS,
      status: TransactionStatus.COMPLETED,
      reference: { startsWith: PAYROLL_REF_PREFIX },
      ...(range.from || range.to
        ? { createdAt: { gte: range.from, lte: range.to } }
        : {}),
    },
    select: { amount: true },
    take: 10_000,
  });
  return {
    usd: rows.reduce((s, r) => s + Math.abs(toNum(r.amount)), 0),
    count: rows.length,
    measured: rows.length > 0,
  };
}
