import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { ENTRY_KINDS, isPeriod, periodLabel, periodOf, periodsBetween, shiftPeriod } from "./constants";
import { createEntry, usdRateFor, type Result } from "./books";

/**
 * Costs that come back every month — rent, internet, a server, a retainer.
 *
 * A template writes one PENDING entry per month on its own. It never marks
 * anything PAID: paying is a human act, and a bill that "paid itself" in the
 * books while the landlord is still waiting is worse than no automation at
 * all. What the sweep removes is only the chore of re-typing the same bill.
 *
 * Idempotent by construction. Each generated entry carries
 * `recurring:<id>:<period>`, unique on FinanceEntry, so the scheduler running
 * twice, a tick killed half-way and a manual "generate now" all collapse to
 * one entry per month. `lastPeriod` is a fast path, never the guarantee.
 */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const recurringKey = (id: string, period: string) => `recurring:${id}:${period}`;

export type RecurringInput = {
  kind: string;
  categoryId: string;
  employeeId?: string | null;
  payeeId?: string | null;
  title: string;
  amount: number;
  currency: string;
  taxAmount?: number;
  taxLabel?: string | null;
  dueDay: number;
  startPeriod: string;
  endPeriod?: string | null;
  isActive?: boolean;
  notes?: string | null;
};

export async function saveRecurring(id: string | null, input: RecurringInput): Promise<Result<{ id: string }>> {
  if (!ENTRY_KINDS.includes(input.kind as never)) return fail("Unknown entry type");
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) return fail("Give it a title");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount above zero");
  const tax = Number(input.taxAmount ?? 0);
  if (!Number.isFinite(tax) || tax < 0 || tax > amount) return fail("Tax must be between zero and the amount");
  if (tax > 0 && !(input.taxLabel ?? "").trim()) return fail("Say which tax this is");
  const dueDay = Math.round(Number(input.dueDay));
  // Capped at 28 so every month, February included, has that day.
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) return fail("Due day must be 1–28");
  if (!isPeriod(input.startPeriod)) return fail("Pick the first month");
  if (input.endPeriod && !isPeriod(input.endPeriod)) return fail("Pick a valid last month");
  if (input.endPeriod && input.endPeriod < input.startPeriod) return fail("The last month is before the first");
  if (input.employeeId && input.payeeId) return fail("Pay an employee OR a payee, not both");

  const cat = await prisma.financeCategory.findUnique({
    where: { id: input.categoryId },
    select: { kind: true, name: true },
  });
  if (!cat) return fail("Pick a category");
  if (cat.kind !== input.kind) return fail(`"${cat.name}" is not a category for this type`);

  const currency = input.currency.trim().toUpperCase();
  if (!(await usdRateFor(currency))) {
    return fail(`No exchange rate is set for ${currency}. Add it under Settings → Currencies first.`);
  }

  const data = {
    kind: input.kind,
    categoryId: input.categoryId,
    employeeId: input.employeeId || null,
    payeeId: input.payeeId || null,
    title,
    amount: Math.round(amount * 100) / 100,
    currency,
    taxAmount: Math.round(tax * 100) / 100,
    taxLabel: tax > 0 ? (input.taxLabel ?? "").trim().slice(0, 40) : null,
    dueDay,
    startPeriod: input.startPeriod,
    endPeriod: input.endPeriod || null,
    notes: (input.notes ?? "").trim().slice(0, 2000) || null,
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  };

  const row = id
    ? await prisma.recurringEntry.update({ where: { id }, data, select: { id: true } })
    : await prisma.recurringEntry.create({ data, select: { id: true } });
  return { ok: true, data: row };
}

export async function listRecurring() {
  const rows = await prisma.recurringEntry.findMany({
    orderBy: [{ isActive: "desc" }, { title: "asc" }],
    include: {
      category: { select: { id: true, name: true, color: true } },
      employee: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({ ...r, amount: toNum(r.amount), taxAmount: toNum(r.taxAmount) }));
}

export type RecurringSweep = { templates: number; created: number; alreadyThere: number; failed: string[] };

/**
 * Write every due entry up to and including `upTo` (default: this month).
 *
 * Catches up on months it missed — a server that was down over a month
 * boundary still produces that month's rent — but never writes the future:
 * next month's bill appears next month. Bounded at 24 months per template so a
 * template back-dated years by mistake cannot flood the books in one tick.
 */
export async function generateRecurring(
  opts: { upTo?: string; actorId?: string | null } = {}
): Promise<RecurringSweep> {
  const upTo = opts.upTo && isPeriod(opts.upTo) ? opts.upTo : periodOf(new Date());
  const out: RecurringSweep = { templates: 0, created: 0, alreadyThere: 0, failed: [] };

  const templates = await prisma.recurringEntry.findMany({
    where: { isActive: true, startPeriod: { lte: upTo } },
  });
  if (templates.length === 0) return out;

  // Entries need an author. The sweep writes as the first super admin — a real
  // account, so "created by" is a person who can be asked, never a blank.
  const author =
    opts.actorId ??
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } }))?.id;
  if (!author) {
    out.failed.push("No super admin account to record the entries as");
    return out;
  }

  for (const t of templates) {
    out.templates++;
    const last = t.endPeriod && t.endPeriod < upTo ? t.endPeriod : upTo;
    // The month AFTER the last one written. Starting on `lastPeriod` itself
    // would be harmless — the dedupe key would refuse it — but it would re-try
    // one month on every tick for ever and report it as "already there".
    const from =
      t.lastPeriod && t.lastPeriod >= t.startPeriod ? shiftPeriod(t.lastPeriod, 1) : t.startPeriod;
    if (from > last) continue;
    const due = periodsBetween(from, last).slice(-24);

    let newest = t.lastPeriod;
    for (const period of due) {
      const [y, m] = period.split("-").map(Number);
      const res = await createEntry(
        author,
        {
          kind: t.kind,
          categoryId: t.categoryId,
          employeeId: t.employeeId,
          payeeId: t.payeeId,
          title: `${t.title} — ${periodLabel(period)}`,
          description: t.notes,
          amount: toNum(t.amount),
          currency: t.currency,
          taxAmount: toNum(t.taxAmount),
          taxLabel: t.taxLabel,
          period,
          dueDate: new Date(Date.UTC(y, m - 1, t.dueDay)).toISOString(),
        },
        { source: "RECURRING", dedupeKey: recurringKey(t.id, period), recurringId: t.id }
      );
      if (!res.ok) {
        // One bad template (a category switched off since) must not stop the
        // rest; it is reported and the others carry on.
        out.failed.push(`${t.title}: ${res.error}`);
        break;
      }
      if (res.data.duplicate) out.alreadyThere++;
      else out.created++;
      newest = period;
    }
    if (newest && newest !== t.lastPeriod) {
      await prisma.recurringEntry.update({ where: { id: t.id }, data: { lastPeriod: newest } });
    }
  }
  return out;
}

export function summariseRecurring(s: RecurringSweep): string {
  if (s.templates === 0) return "No recurring costs set up.";
  const bits = [`${s.created} due entr${s.created === 1 ? "y" : "ies"} written`];
  if (s.alreadyThere) bits.push(`${s.alreadyThere} already there`);
  if (s.failed.length) bits.push(`${s.failed.length} failed: ${s.failed[0]}`);
  return bits.join(", ") + ".";
}
