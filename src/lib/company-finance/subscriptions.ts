import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { sendNotificationEmail } from "@/lib/email";
import { NotificationType, Prisma } from "@/generated/prisma/client";
import { createEntry, usdRateFor, type Result } from "./books";
import { periodOf } from "./constants";
import {
  BILLING_CYCLES,
  SUB_STATUSES,
  SUBSCRIPTIONS_TAB_HREF,
  advanceOneCycle,
  cleanCustomFields,
  cleanRemindDays,
  daysUntil,
  isoDay,
  monthlyFactor,
  reminderDecision,
  reminderMessage,
  utcDay,
} from "./subscriptions-shared";

/**
 * Company subscriptions & renewals: domains, hosting, SaaS — what the company
 * pays for and when each one renews or runs out.
 *
 * Fails soft on a database without the table (migration not applied yet): the
 * list says so, the summary is null, the reminder sweep does nothing. Nothing
 * else on the books depends on this table.
 */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** The table not existing yet (P2021), or a column missing (P2022). */
export function isMissingSubscriptionsTable(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (err?.code === "P2021" || err?.code === "P2022") return true;
  const msg = typeof err?.message === "string" ? err.message : "";
  return /CompanySubscription/.test(msg) && /does not exist/i.test(msg);
}

export type SubscriptionInput = {
  name: string;
  category: string;
  vendor?: string | null;
  accountRef?: string | null;
  cost?: number | string | null;
  currency?: string;
  billingCycle: string;
  customCycleDays?: number | string | null;
  startDate: string;
  endDate?: string | null;
  autoRenew?: boolean;
  paymentMethod?: string | null;
  ownerUserId?: string | null;
  status?: string;
  remindDaysBefore?: unknown;
  notes?: string | null;
  url?: string | null;
  customFields?: unknown;
  payeeId?: string | null;
  categoryId?: string | null;
};

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

function parseDay(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : utcDay(d);
}

async function buildSubscription(input: SubscriptionInput): Promise<Result<Omit<Prisma.CompanySubscriptionUncheckedCreateInput, "createdById">>> {
  const name = (input.name ?? "").trim().slice(0, 160);
  if (name.length < 2) return fail("Give it a name");
  const category = (input.category ?? "").trim().slice(0, 60);
  if (!category) return fail("Pick or type a category");
  if (!BILLING_CYCLES.includes(input.billingCycle as never)) return fail("Pick a billing cycle");

  let customCycleDays: number | null = null;
  if (input.billingCycle === "CUSTOM") {
    customCycleDays = Math.round(Number(input.customCycleDays));
    if (!Number.isFinite(customCycleDays) || customCycleDays < 1 || customCycleDays > 3660) {
      return fail("A custom cycle needs a number of days (1–3660)");
    }
  }

  const startDate = parseDay(input.startDate);
  if (!startDate) return fail("Pick the start date");
  const endDate = input.endDate ? parseDay(input.endDate) : null;
  if (input.endDate && !endDate) return fail("That end / renewal date is not a date");
  if (endDate && endDate < startDate) return fail("The end date is before the start date");

  let cost: number | null = null;
  if (input.cost !== undefined && input.cost !== null && String(input.cost).trim() !== "") {
    cost = Number(input.cost);
    if (!Number.isFinite(cost) || cost < 0) return fail("Cost cannot be negative");
    if (cost > 1_000_000_000) return fail("That cost is too large to be real");
    cost = Math.round(cost * 100) / 100;
  }
  const currency = (input.currency ?? "USD").trim().toUpperCase() || "USD";
  if (cost && !(await usdRateFor(currency))) {
    return fail(`No exchange rate is set for ${currency}. Add it under Settings → Currencies first.`);
  }

  const status = input.status ?? "ACTIVE";
  if (!SUB_STATUSES.includes(status as never)) return fail("Unknown status");

  const url = clip(input.url, 500);
  if (url && !/^https?:\/\//i.test(url)) return fail("The link must start with http:// or https://");

  return {
    ok: true,
    data: {
      name,
      category,
      vendor: clip(input.vendor, 120),
      accountRef: clip(input.accountRef, 160),
      cost,
      currency,
      billingCycle: input.billingCycle,
      customCycleDays,
      startDate,
      endDate,
      autoRenew: !!input.autoRenew,
      paymentMethod: clip(input.paymentMethod, 60),
      ownerUserId: clip(input.ownerUserId, 40),
      status,
      remindDaysBefore: cleanRemindDays(input.remindDaysBefore),
      notes: clip(input.notes, 4000),
      url,
      customFields: cleanCustomFields(input.customFields) as unknown as Prisma.InputJsonValue,
      payeeId: clip(input.payeeId, 40),
      categoryId: clip(input.categoryId, 40),
    },
  };
}

export async function saveSubscription(
  id: string | null,
  actorId: string,
  input: SubscriptionInput
): Promise<Result<{ id: string }>> {
  const built = await buildSubscription(input);
  if (!built.ok) return built;
  try {
    if (id) {
      const cur = await prisma.companySubscription.findUnique({ where: { id }, select: { endDate: true } });
      if (!cur) return fail("That subscription no longer exists");
      // A moved due date starts its reminders afresh.
      const moved = (cur.endDate?.getTime() ?? 0) !== (built.data.endDate instanceof Date ? built.data.endDate.getTime() : 0);
      const row = await prisma.companySubscription.update({
        where: { id },
        data: { ...built.data, ...(moved ? { lastRemindedFor: null } : {}) },
        select: { id: true },
      });
      return { ok: true, data: row };
    }
    const row = await prisma.companySubscription.create({
      data: { ...built.data, createdById: actorId },
      select: { id: true },
    });
    return { ok: true, data: row };
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return fail("Run the migration to start tracking subscriptions.");
    throw e;
  }
}

export type SubscriptionRow = Awaited<ReturnType<typeof listSubscriptionsRaw>>[number];

async function listSubscriptionsRaw() {
  const rows = await prisma.companySubscription.findMany({
    orderBy: [{ endDate: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    take: 2000,
  });
  return rows.map((r) => ({ ...r, cost: r.cost == null ? null : toNum(r.cost) }));
}

export type SubscriptionSummary = {
  active: number;
  monthlyUsd: number;
  due7: number;
  due30: number;
  expired: number;
  unconverted: string[];
};

function summarise(rows: SubscriptionRow[], rates: Map<string, number | null>, now = new Date()): SubscriptionSummary {
  const out: SubscriptionSummary = { active: 0, monthlyUsd: 0, due7: 0, due30: 0, expired: 0, unconverted: [] };
  for (const r of rows) {
    if (r.status === "EXPIRED") out.expired++;
    if (r.status !== "ACTIVE") continue;
    out.active++;
    if (r.cost) {
      const rate = rates.get(r.currency);
      if (rate) out.monthlyUsd += (r.cost / rate) * monthlyFactor(r.billingCycle, r.customCycleDays);
      else if (!out.unconverted.includes(r.currency)) out.unconverted.push(r.currency);
    }
    if (r.endDate) {
      const d = daysUntil(r.endDate, now);
      if (d < 0) out.expired++;
      else {
        if (d <= 7) out.due7++;
        if (d <= 30) out.due30++;
      }
    }
  }
  out.monthlyUsd = Math.round(out.monthlyUsd * 100) / 100;
  return out;
}

/**
 * Everything the tab needs: rows, summary, and who can own one. `ready: false`
 * when the table is not there yet.
 */
export async function listSubscriptions(): Promise<
  | { ready: false }
  | { ready: true; rows: SubscriptionRow[]; summary: SubscriptionSummary; owners: { id: string; name: string }[] }
> {
  let rows: SubscriptionRow[];
  try {
    rows = await listSubscriptionsRaw();
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return { ready: false };
    throw e;
  }
  const currencies = [...new Set(rows.filter((r) => r.cost).map((r) => r.currency))];
  const [rates, team] = await Promise.all([
    Promise.all(currencies.map(async (c) => [c, await usdRateFor(c)] as const)),
    prisma.user.findMany({
      where: { status: "ACTIVE", ...financeTeamWhere },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return {
    ready: true,
    rows,
    summary: summarise(rows, new Map(rates)),
    owners: team.map((u) => ({ id: u.id, name: u.name ?? u.email })),
  };
}

/** Just the overview hint: how many active items fall due within 7 days. */
export async function dueSoonCount(days = 7): Promise<number | null> {
  const now = utcDay(new Date());
  try {
    return await prisma.companySubscription.count({
      where: { status: "ACTIVE", endDate: { gte: now, lte: new Date(now.getTime() + days * 86_400_000) } },
    });
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return null;
    throw e;
  }
}

export async function cancelSubscription(id: string): Promise<Result<{ id: string; name: string }>> {
  try {
    const row = await prisma.companySubscription.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: { id: true, name: true },
    });
    return { ok: true, data: row };
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return fail("Run the migration to start tracking subscriptions.");
    if ((e as { code?: string })?.code === "P2025") return fail("That subscription no longer exists");
    throw e;
  }
}

export type RenewInput = {
  createExpense?: boolean;
  amount?: number;
  currency?: string;
  categoryId?: string;
  markPaid?: boolean;
};

/**
 * "Renewed": move the due date on by one cycle, and optionally record what it
 * cost as an expense through the ordinary entry path.
 *
 * Safe to press twice. The expense carries `subscription:<id>:<old due date>`,
 * unique on FinanceEntry, and the date moves with a compare-and-set on the old
 * date — a second click finds the date already moved and is told so.
 */
export async function renewSubscription(
  id: string,
  actorId: string,
  input: RenewInput
): Promise<Result<{ id: string; name: string; endDate: string; entryId: string | null }>> {
  let sub;
  try {
    sub = await prisma.companySubscription.findUnique({ where: { id } });
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return fail("Run the migration to start tracking subscriptions.");
    throw e;
  }
  if (!sub) return fail("That subscription no longer exists");
  const from = sub.endDate ?? utcDay(new Date());
  const next = advanceOneCycle(from, sub.billingCycle, sub.customCycleDays);
  if (!next) return fail("A one-time purchase has nothing to renew — edit its end date instead");

  let entryId: string | null = null;
  if (input.createExpense) {
    if (!input.categoryId) return fail("Pick the expense category for the renewal");
    const res = await createEntry(
      actorId,
      {
        kind: "EXPENSE",
        categoryId: input.categoryId,
        payeeId: sub.payeeId,
        title: `${sub.name} — renewal to ${isoDay(next)}`,
        description: sub.vendor ? `Vendor: ${sub.vendor}` : null,
        amount: Number(input.amount ?? (sub.cost == null ? 0 : toNum(sub.cost))),
        currency: (input.currency ?? sub.currency).toUpperCase(),
        period: periodOf(new Date()),
        dueDate: from.toISOString(),
        paymentMethod: sub.paymentMethod,
      },
      {
        markPaid: !!input.markPaid,
        source: "SUBSCRIPTION",
        dedupeKey: `subscription:${sub.id}:${isoDay(from)}`,
      }
    );
    if (!res.ok) return res;
    entryId = res.data.id;
  }

  const moved = await prisma.companySubscription.updateMany({
    where: { id: sub.id, endDate: sub.endDate },
    data: { endDate: next, status: "ACTIVE", lastRemindedFor: null },
  });
  if (moved.count === 0) return fail("Someone already renewed this — reload to see the new date");
  return { ok: true, data: { id: sub.id, name: sub.name, endDate: isoDay(next), entryId } };
}

/* ------------------------------------------------------------------ *
 * Reminders
 * ------------------------------------------------------------------ */

/** Who works on the books — the same rule as the Finance team screen. */
const financeTeamWhere: Prisma.UserWhereInput = {
  OR: [
    { role: { in: ["SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_MODERATOR"] } },
    { financeGrants: { isEmpty: false } },
  ],
};

/** The furthest any reminder looks ahead; thresholds are capped at 365. */
const WINDOW_DAYS = 365;

export type ReminderSweep = {
  ready: boolean;
  checked: number;
  reminded: number;
  expired: number;
  notifications: number;
  emails: number;
};

/**
 * Daily: notify the finance team and each item's owner of renewals coming up,
 * and mark lapsed non-auto-renewing items EXPIRED.
 *
 * Idempotent: each notice is claimed by a compare-and-set of
 * `lastRemindedFor` from its previous value to `<due date>:<threshold>` BEFORE
 * anything is sent. A rerun, or two servers at once, finds the key already
 * there and sends nothing. A crash after the claim loses that one notice
 * rather than sending it twice.
 *
 * Two reads: the due items in the window, then everyone to tell.
 */
export async function runSubscriptionReminders(now: Date = new Date()): Promise<ReminderSweep> {
  const out: ReminderSweep = { ready: true, checked: 0, reminded: 0, expired: 0, notifications: 0, emails: 0 };
  let due;
  try {
    due = await prisma.companySubscription.findMany({
      where: {
        status: "ACTIVE",
        endDate: { not: null, lte: new Date(utcDay(now).getTime() + WINDOW_DAYS * 86_400_000) },
      },
      select: {
        id: true,
        name: true,
        cost: true,
        currency: true,
        endDate: true,
        status: true,
        autoRenew: true,
        remindDaysBefore: true,
        lastRemindedFor: true,
        ownerUserId: true,
      },
      take: 1000,
    });
  } catch (e) {
    if (isMissingSubscriptionsTable(e)) return { ...out, ready: false };
    throw e;
  }
  out.checked = due.length;

  const toSend: { title: string; message: string; ownerUserId: string | null; important: boolean }[] = [];
  for (const s of due) {
    const d = reminderDecision(s, now);
    if (d.kind === "none") continue;
    const claim = await prisma.companySubscription.updateMany({
      where: {
        id: s.id,
        status: "ACTIVE",
        lastRemindedFor: s.lastRemindedFor,
      },
      data: { lastRemindedFor: d.key, ...(d.kind === "expire" ? { status: "EXPIRED" } : {}) },
    });
    if (claim.count === 0) continue;
    if (d.kind === "expire") out.expired++;
    else out.reminded++;
    const text = reminderMessage({ ...s, cost: s.cost == null ? null : toNum(s.cost) }, d);
    if (text) {
      toSend.push({
        ...text,
        ownerUserId: s.ownerUserId,
        important: d.kind !== "remind" || d.daysLeft <= 7,
      });
    }
  }
  if (toSend.length === 0) return out;

  const ownerIds = [...new Set(toSend.map((t) => t.ownerUserId).filter((x): x is string => !!x))];
  const people = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [...(financeTeamWhere.OR as Prisma.UserWhereInput[]), ...(ownerIds.length ? [{ id: { in: ownerIds } }] : [])],
    },
    select: { id: true, email: true, role: true, financeGrants: true },
  });
  const isTeam = (p: (typeof people)[number]) =>
    ["SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_MODERATOR"].includes(p.role) || p.financeGrants.length > 0;

  const rows: Prisma.NotificationCreateManyInput[] = [];
  const mails: { email: string; title: string; message: string }[] = [];
  for (const t of toSend) {
    for (const p of people) {
      if (!isTeam(p) && p.id !== t.ownerUserId) continue;
      rows.push({
        userId: p.id,
        type: NotificationType.SYSTEM,
        title: t.title,
        message: t.message,
        data: { link: SUBSCRIPTIONS_TAB_HREF },
      });
      if (t.important && p.email && !p.email.endsWith("@deleted.local")) {
        mails.push({ email: p.email, title: t.title, message: t.message });
      }
    }
  }
  if (rows.length) {
    await prisma.notification.createMany({ data: rows });
    out.notifications = rows.length;
  }
  // A bill about to lapse is a service notice to staff, not marketing: sent
  // even with notification emails off. Best effort — the in-app row is the record.
  for (const m of mails) {
    await sendNotificationEmail(m.email, m.title, m.message, SUBSCRIPTIONS_TAB_HREF, { transactional: true, category: "staff_alerts" })
      .then(() => out.emails++)
      .catch(() => {});
  }
  return out;
}

export function summariseReminders(s: ReminderSweep): string {
  if (!s.ready) return "Subscriptions table not created yet — nothing to do.";
  if (s.checked === 0) return "No subscriptions due within the year.";
  const bits = [`${s.reminded} reminder${s.reminded === 1 ? "" : "s"} sent`];
  if (s.expired) bits.push(`${s.expired} marked expired`);
  bits.push(`${s.notifications} notification${s.notifications === 1 ? "" : "s"}, ${s.emails} email${s.emails === 1 ? "" : "s"}`);
  return `${bits.join(", ")} (${s.checked} checked).`;
}
