import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getCurrencies } from "@/lib/currencies";
import { getSetting } from "@/lib/system-settings";
import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_CATEGORIES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  isPeriod,
  periodOf,
  validateCustomFields,
  cleanLineItems,
  type EntryKind,
  type FieldDef,
  type FieldEntity,
  type FieldType,
} from "./constants";

/**
 * The company's own books.
 *
 * Every function here that writes takes the ACTING user's id and returns a
 * result an API route can hand straight to the screen — `{ ok: false, error }`
 * is always a sentence an admin can act on, never a stack trace. Permission is
 * checked by the route, not here: this library does not know who is allowed,
 * only what is valid.
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ------------------------------------------------------------------ *
 * Currency
 * ------------------------------------------------------------------ */

/**
 * Units of `currency` per 1 USD, today.
 *
 * Read from the same admin-edited `currency_rates` the deposit screen uses, so
 * there is one taka rate on the platform, not two. The rate is then SNAPSHOTTED
 * on every entry: last March's rent must still read the same in dollars after
 * the taka moves. An unknown currency is refused rather than guessed at 1:1 —
 * recording ৳50,000 of rent as $50,000 is the kind of error nobody spots until
 * the year-end numbers are wrong by two orders of magnitude.
 */
export async function usdRateFor(currency: string): Promise<number | null> {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return 1;
  const list = await getCurrencies();
  const hit = list.find((c) => c.code.toUpperCase() === code);
  return hit && hit.usdRate > 0 ? hit.usdRate : null;
}

/** Currencies the entry form offers: USD plus every configured local one. */
export async function availableCurrencies(): Promise<{ code: string; symbol: string; usdRate: number }[]> {
  const list = await getCurrencies();
  return [
    { code: "USD", symbol: "$", usdRate: 1 },
    ...list.filter((c) => c.code.toUpperCase() !== "USD").map((c) => ({
      code: c.code.toUpperCase(),
      symbol: c.symbol,
      usdRate: c.usdRate,
    })),
  ];
}

/** The currency a new entry starts in. An office in Dhaka pays in taka. */
export async function defaultCurrency(): Promise<string> {
  const v = await getSetting<string>("finance.default_currency", "BDT");
  return typeof v === "string" && v.trim() ? v.trim().toUpperCase() : "BDT";
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * Make sure the standard categories exist. Idempotent — upsert by slug — and
 * it never overwrites an admin's rename or deactivation, because the update
 * branch is empty.
 */
export async function ensureDefaultCategories(): Promise<void> {
  const existing = await prisma.financeCategory.count({ where: { isSystem: true } });
  if (existing >= DEFAULT_CATEGORIES.length) return;
  await Promise.all(
    DEFAULT_CATEGORIES.map((c, i) =>
      prisma.financeCategory.upsert({
        where: { slug: c.slug },
        create: {
          slug: c.slug,
          name: c.name,
          kind: c.kind,
          color: c.color,
          icon: c.icon,
          order: i,
          isSystem: true,
        },
        update: {},
      })
    )
  );
}

export async function listCategories(opts: { includeInactive?: boolean } = {}) {
  await ensureDefaultCategories();
  return prisma.financeCategory.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }],
  });
}

export async function saveCategory(input: {
  id?: string;
  name: string;
  kind: string;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
}): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return fail("Give the category a name");
  if (!ENTRY_KINDS.includes(input.kind as EntryKind)) return fail("Unknown category kind");

  if (input.id) {
    const cur = await prisma.financeCategory.findUnique({
      where: { id: input.id },
      select: { isSystem: true, kind: true },
    });
    if (!cur) return fail("That category no longer exists");
    // A seeded category's KIND is fixed: turning "Salaries" into income would
    // move every salary ever recorded to the other side of the P&L.
    if (cur.isSystem && cur.kind !== input.kind) {
      return fail("A built-in category cannot change between expense, income and tax");
    }
    const row = await prisma.financeCategory.update({
      where: { id: input.id },
      data: {
        name,
        kind: input.kind,
        color: input.color ?? null,
        icon: input.icon ?? null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      select: { id: true },
    });
    return { ok: true, data: row };
  }

  const last = await prisma.financeCategory.aggregate({ _max: { order: true } });
  const row = await prisma.financeCategory.create({
    data: {
      name,
      kind: input.kind,
      color: input.color ?? null,
      icon: input.icon ?? null,
      order: (last._max.order ?? 0) + 1,
    },
    select: { id: true },
  });
  return { ok: true, data: row };
}

/* ------------------------------------------------------------------ *
 * Custom fields
 * ------------------------------------------------------------------ */

function toDef(r: {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
}): FieldDef {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    type: r.type as FieldType,
    options: r.options,
    required: r.required,
  };
}

/**
 * The fields that apply to one row. For an entry: the fields shared by every
 * entry, plus those of its category.
 */
export async function fieldsFor(entity: FieldEntity, categoryId?: string | null): Promise<FieldDef[]> {
  const rows = await prisma.financeFieldDef.findMany({
    where: {
      entity,
      isActive: true,
      ...(entity === "ENTRY"
        ? { OR: [{ categoryId: null }, ...(categoryId ? [{ categoryId }] : [])] }
        : {}),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDef);
}

export type FieldDefRow = {
  id: string;
  entity: string;
  categoryId: string | null;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  isActive: boolean;
  category: { name: string } | null;
};

export async function listFieldDefs(): Promise<FieldDefRow[]> {
  // Typed explicitly: the generated client does not infer `include` on this
  // model reliably, and a silently-`any` relation is how a UI ends up reading
  // `undefined.name`.
  return (await prisma.financeFieldDef.findMany({
    orderBy: [{ entity: "asc" }, { categoryId: "asc" }, { order: "asc" }],
    include: { category: { select: { name: true } } },
  })) as unknown as FieldDefRow[];
}

export async function saveFieldDef(input: {
  id?: string;
  entity: string;
  categoryId?: string | null;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  isActive?: boolean;
}): Promise<Result<{ id: string }>> {
  const label = input.label.trim().slice(0, 60);
  if (label.length < 2) return fail("Give the field a label");
  if (!["ENTRY", "EMPLOYEE", "PAYEE"].includes(input.entity)) return fail("Unknown field target");
  if (!["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "URL"].includes(input.type)) {
    return fail("Unknown field type");
  }
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 40);
  if (input.type === "SELECT" && options.length === 0) {
    return fail("A dropdown needs at least one option");
  }
  const categoryId = input.entity === "ENTRY" ? input.categoryId || null : null;

  if (input.id) {
    // The KEY is never changed on edit: rows already hold values under it,
    // and renaming it would orphan every one of them. Only the label moves.
    const row = await prisma.financeFieldDef.update({
      where: { id: input.id },
      data: {
        label,
        type: input.type,
        options,
        required: !!input.required,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      select: { id: true },
    });
    return { ok: true, data: row };
  }

  const { fieldKeyFrom } = await import("./constants");
  const key = fieldKeyFrom(label);
  // Checked here as well as by the unique index: Postgres treats NULLs as
  // distinct, so `@@unique([entity, categoryId, key])` alone would allow two
  // EMPLOYEE fields both keyed "blood_group" (categoryId is always null there),
  // and the second would silently shadow the first's values.
  const clash = await prisma.financeFieldDef.findFirst({
    where: { entity: input.entity, categoryId, key },
    select: { id: true },
  });
  if (clash) return fail(`A field called "${label}" already exists here`);

  const last = await prisma.financeFieldDef.aggregate({
    where: { entity: input.entity, categoryId },
    _max: { order: true },
  });
  const row = await prisma.financeFieldDef.create({
    data: {
      entity: input.entity,
      categoryId,
      key,
      label,
      type: input.type,
      options,
      required: !!input.required,
      order: (last._max.order ?? 0) + 1,
    },
    select: { id: true },
  });
  return { ok: true, data: row };
}

/* ------------------------------------------------------------------ *
 * Payees
 * ------------------------------------------------------------------ */

export type PayeeInput = {
  kind: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  taxId?: string | null;
  notes?: string | null;
  customFields?: unknown;
  isActive?: boolean;
};

const clip = (v: string | null | undefined, n: number) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, n) : null;
};

export async function savePayee(id: string | null, input: PayeeInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return fail("Give the payee a name");
  if (!["COMPANY", "PERSON", "PLATFORM"].includes(input.kind)) return fail("Unknown payee type");

  const defs = await fieldsFor("PAYEE");
  const cf = validateCustomFields(defs, input.customFields);
  if (cf.error) return fail(cf.error);

  const data = {
    kind: input.kind,
    name,
    contactName: clip(input.contactName, 120),
    phone: clip(input.phone, 40),
    email: clip(input.email, 160),
    address: clip(input.address, 400),
    paymentMethod: clip(input.paymentMethod, 60),
    paymentDetails: clip(input.paymentDetails, 400),
    taxId: clip(input.taxId, 60),
    notes: clip(input.notes, 2000),
    customFields: cf.values as Prisma.InputJsonValue,
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  };

  const row = id
    ? await prisma.payee.update({ where: { id }, data, select: { id: true } })
    : await prisma.payee.create({ data, select: { id: true } });
  return { ok: true, data: row };
}

/* ------------------------------------------------------------------ *
 * Entries
 * ------------------------------------------------------------------ */

export type EntryInput = {
  kind: string;
  categoryId: string;
  employeeId?: string | null;
  payeeId?: string | null;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  taxAmount?: number;
  taxLabel?: string | null;
  period: string;
  dueDate?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  attachments?: string[];
  customFields?: unknown;
  /** Itemised lines; when present, `amount` is replaced by their sum. */
  lineItems?: unknown;
};

/**
 * Validate and normalise an entry. Shared by create and edit, so the two can
 * never accept different things.
 */
async function buildEntry(input: EntryInput): Promise<Result<Prisma.FinanceEntryUncheckedCreateInput>> {
  if (!ENTRY_KINDS.includes(input.kind as EntryKind)) return fail("Unknown entry type");

  const category = await prisma.financeCategory.findUnique({
    where: { id: input.categoryId },
    select: { kind: true, isActive: true, name: true },
  });
  if (!category) return fail("Pick a category");
  if (!category.isActive) return fail(`"${category.name}" is switched off — pick another category`);
  // A tax payment filed under "Electricity" would count as an operating cost
  // AND fail to reduce the tax owed — wrong on both sides of the books.
  if (category.kind !== input.kind) {
    return fail(`"${category.name}" is not a category for this type of entry`);
  }

  if (input.employeeId && input.payeeId) {
    return fail("An entry is paid to an employee OR a payee, not both");
  }

  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) return fail("Give the entry a title");

  const items = cleanLineItems(input.lineItems);
  if (items.error) return fail(items.error);
  // Itemised: the lines are the truth and the amount is their sum.
  const amount = items.lines.length ? items.total : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount above zero");
  if (amount > 1_000_000_000) return fail("That amount is too large to be real");

  const taxAmount = Number(input.taxAmount ?? 0);
  if (!Number.isFinite(taxAmount) || taxAmount < 0) return fail("Tax cannot be negative");
  // Tax is PART of the amount paid, so it cannot exceed it.
  if (taxAmount > amount) return fail("The tax part cannot be larger than the whole amount");
  if (taxAmount > 0 && !(input.taxLabel ?? "").trim()) {
    return fail("Say which tax this is — VAT, income tax, AIT…");
  }

  if (!isPeriod(input.period)) return fail("Pick the month this is for");

  const currency = input.currency.trim().toUpperCase();
  const rate = await usdRateFor(currency);
  if (!rate) {
    return fail(
      `No exchange rate is set for ${currency}. Add it under Settings → Currencies first, so the books do not guess.`
    );
  }

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return fail("That due date is not a date");

  const defs = await fieldsFor("ENTRY", input.categoryId);
  const cf = validateCustomFields(defs, input.customFields);
  if (cf.error) return fail(cf.error);

  // A private receipt KEY (uploaded through /api/admin/company-finance/
  // receipts, readable only by finance) or an external https link to a bill on
  // a provider's own site. Nothing under the public media library: that is
  // browsable by content and marketing admins.
  const attachments = (input.attachments ?? [])
    .map((a) => String(a).trim())
    .filter((a) => (a.startsWith("finance-receipts/") && !a.includes("..")) || /^https:\/\//.test(a))
    .slice(0, 10);

  return {
    ok: true,
    data: {
      kind: input.kind,
      categoryId: input.categoryId,
      employeeId: input.employeeId || null,
      payeeId: input.payeeId || null,
      title,
      description: clip(input.description, 4000),
      amount: round(amount, 2),
      currency,
      usdRate: rate,
      amountUsd: round(amount / rate, 6),
      taxAmount: round(taxAmount, 2),
      taxAmountUsd: round(taxAmount / rate, 6),
      taxLabel: taxAmount > 0 ? clip(input.taxLabel, 40) : null,
      period: input.period,
      dueDate,
      paymentMethod: clip(input.paymentMethod, 60),
      reference: clip(input.reference, 120),
      attachments,
      customFields: cf.values as Prisma.InputJsonValue,
      lineItems: items.lines.length ? (items.lines as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      createdById: "", // set by the caller
    },
  };
}

export async function createEntry(
  actorId: string,
  input: EntryInput,
  opts: { markPaid?: boolean; paidAt?: string | null; source?: string; dedupeKey?: string; recurringId?: string } = {}
): Promise<Result<{ id: string; duplicate?: boolean }>> {
  const built = await buildEntry(input);
  if (!built.ok) return built;

  const paidAt = opts.markPaid ? (opts.paidAt ? new Date(opts.paidAt) : new Date()) : null;
  if (paidAt && Number.isNaN(paidAt.getTime())) return fail("That payment date is not a date");

  // The common case — a second click after the first one landed — answered
  // without attempting the insert. The unique index below is still what makes
  // it SAFE; this only keeps an expected duplicate out of the error log.
  if (opts.dedupeKey) {
    const existing = await prisma.financeEntry.findUnique({
      where: { dedupeKey: opts.dedupeKey },
      select: { id: true },
    });
    if (existing) return { ok: true, data: { id: existing.id, duplicate: true } };
  }

  try {
    const row = await prisma.financeEntry.create({
      data: {
        ...built.data,
        createdById: actorId,
        source: opts.source ?? "MANUAL",
        dedupeKey: opts.dedupeKey ?? null,
        recurringId: opts.recurringId ?? null,
        ...(paidAt
          ? { status: "PAID", paidAt, approvedById: actorId, approvedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    return { ok: true, data: row };
  } catch (e) {
    // The dedupeKey unique index: the same salary for the same month, the same
    // recurring bill twice. Reported as "already there", with the id, so the
    // caller can show the existing row instead of an error.
    if (opts.dedupeKey && (e as { code?: string })?.code === "P2002") {
      const existing = await prisma.financeEntry.findUnique({
        where: { dedupeKey: opts.dedupeKey },
        select: { id: true },
      });
      if (existing) return { ok: true, data: { id: existing.id, duplicate: true } };
    }
    throw e;
  }
}

/**
 * Edit an entry. Only a PENDING one: once money has gone out the record is
 * what happened, and changing it after the fact is exactly what an audit trail
 * exists to prevent. A paid entry that is wrong is voided and re-entered.
 */
export async function updateEntry(id: string, input: EntryInput): Promise<Result<{ id: string }>> {
  const cur = await prisma.financeEntry.findUnique({ where: { id }, select: { status: true } });
  if (!cur) return fail("That entry no longer exists");
  if (cur.status !== "PENDING") {
    return fail(
      cur.status === "PAID"
        ? "A paid entry cannot be edited. Void it with a reason and record it again."
        : "A voided entry cannot be edited."
    );
  }
  const built = await buildEntry(input);
  if (!built.ok) return built;
  const { createdById: _drop, ...data } = built.data;
  void _drop;
  await prisma.financeEntry.update({ where: { id }, data });
  return { ok: true, data: { id } };
}

/**
 * Mark an entry paid. A compare-and-set on status, so two approvers pressing
 * Pay at the same moment cannot both "pay" it.
 */
export async function markEntryPaid(
  id: string,
  actorId: string,
  opts: { paidAt?: string | null; paymentMethod?: string | null; reference?: string | null } = {}
): Promise<Result<{ id: string }>> {
  const paidAt = opts.paidAt ? new Date(opts.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) return fail("That payment date is not a date");
  const res = await prisma.financeEntry.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt,
      approvedById: actorId,
      approvedAt: new Date(),
      ...(opts.paymentMethod ? { paymentMethod: opts.paymentMethod.slice(0, 60) } : {}),
      ...(opts.reference ? { reference: opts.reference.slice(0, 120) } : {}),
    },
  });
  if (res.count === 0) {
    const cur = await prisma.financeEntry.findUnique({ where: { id }, select: { status: true } });
    return fail(cur ? `This entry is already ${cur.status.toLowerCase()}` : "That entry no longer exists");
  }
  return { ok: true, data: { id } };
}

export async function voidEntry(id: string, actorId: string, reason: string): Promise<Result<{ id: string }>> {
  const why = reason.trim().slice(0, 500);
  // A void with no reason is a deletion with extra steps.
  if (why.length < 3) return fail("Say why this entry is being voided");
  const res = await prisma.financeEntry.updateMany({
    where: { id, status: { in: ["PENDING", "PAID"] } },
    data: { status: "VOID", voidedById: actorId, voidedAt: new Date(), voidReason: why },
  });
  if (res.count === 0) return fail("That entry is already void or no longer exists");
  return { ok: true, data: { id } };
}

export type EntryFilter = {
  kind?: string;
  status?: string;
  categoryId?: string;
  employeeId?: string;
  payeeId?: string;
  from?: string;
  to?: string;
  q?: string;
};

export function entryWhere(f: EntryFilter): Prisma.FinanceEntryWhereInput {
  const where: Prisma.FinanceEntryWhereInput = {};
  if (f.kind && ENTRY_KINDS.includes(f.kind as EntryKind)) where.kind = f.kind;
  if (f.status && ENTRY_STATUSES.includes(f.status as never)) where.status = f.status;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.employeeId) where.employeeId = f.employeeId;
  if (f.payeeId) where.payeeId = f.payeeId;
  if (isPeriod(f.from) || isPeriod(f.to)) {
    where.period = {
      ...(isPeriod(f.from) ? { gte: f.from } : {}),
      ...(isPeriod(f.to) ? { lte: f.to } : {}),
    };
  }
  if (f.q?.trim()) {
    const q = f.q.trim().slice(0, 80);
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listEntries(
  f: EntryFilter,
  page = 1,
  pageSize = 50,
  /** Extra restriction from the caller's permissions — see hideSalariesWhere. */
  scope: Prisma.FinanceEntryWhereInput = {}
) {
  const base = entryWhere(f);
  const where: Prisma.FinanceEntryWhereInput = { AND: [base, scope] };
  const take = Math.min(200, Math.max(1, pageSize));
  const [rows, total, sums] = await Promise.all([
    prisma.financeEntry.findMany({
      where,
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      skip: (Math.max(1, page) - 1) * take,
      take,
      include: {
        category: { select: { id: true, name: true, color: true, kind: true } },
        employee: { select: { id: true, name: true } },
        payee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.financeEntry.count({ where }),
    // Totals for the SAME filter, excluding voids, so the figure on the screen
    // is the sum of the rows the screen is showing.
    prisma.financeEntry.groupBy({
      by: ["status"],
      where: { AND: [where, base.status ? {} : { status: { not: "VOID" } }] },
      _sum: { amountUsd: true, taxAmountUsd: true },
      _count: { _all: true },
    }) as unknown as Promise<
      { status: string; _sum: { amountUsd: unknown; taxAmountUsd: unknown }; _count: { _all: number } }[]
    >,
  ]);

  const byStatus = Object.fromEntries(
    sums.map((s) => [
      s.status,
      { usd: toNum(s._sum.amountUsd as never), taxUsd: toNum(s._sum.taxAmountUsd as never), count: s._count._all },
    ])
  ) as Record<string, { usd: number; taxUsd: number; count: number }>;

  return {
    rows: rows.map((r) => ({
      ...r,
      amount: toNum(r.amount),
      usdRate: toNum(r.usdRate),
      amountUsd: toNum(r.amountUsd),
      taxAmount: toNum(r.taxAmount),
      taxAmountUsd: toNum(r.taxAmountUsd),
    })),
    total,
    totals: {
      paidUsd: byStatus.PAID?.usd ?? 0,
      pendingUsd: byStatus.PENDING?.usd ?? 0,
      taxUsd: (byStatus.PAID?.taxUsd ?? 0) + (byStatus.PENDING?.taxUsd ?? 0),
      paidCount: byStatus.PAID?.count ?? 0,
      pendingCount: byStatus.PENDING?.count ?? 0,
    },
  };
}

export const thisPeriod = () => periodOf(new Date());
