/**
 * Company subscriptions & renewals — the pure half.
 *
 * No database and no `server-only`, so the Subscriptions tab, the API, the
 * reminder sweep and the verify script all compute "when is this due" and
 * "is this urgent" with the SAME code. Two copies of a date rule is how a
 * screen says "due in 7 days" while the reminder says nothing.
 *
 * Dates are calendar days in UTC: a renewal is due ON a day, not at an instant.
 */

export const SUB_CATEGORIES = [
  "Domain",
  "Hosting",
  "SaaS/Software",
  "Email",
  "Cloud",
  "Design/Media",
  "Marketing",
  "Other",
] as const;

export const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME", "CUSTOM"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  ONE_TIME: "One-time",
  CUSTOM: "Custom",
};

export const SUB_STATUSES = ["ACTIVE", "CANCELLED", "EXPIRED"] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "url", "money"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type CustomField = { label: string; type: CustomFieldType; value: string };

export const DEFAULT_REMIND_DAYS = [30, 7, 1];

/** The link every reminder and the overview hint open. */
export const SUBSCRIPTIONS_TAB_HREF = "/admin/finance/company?tab=subscriptions";

export const SUBSCRIPTIONS_NOT_READY = "Run the migration to start tracking subscriptions.";

const DAY_MS = 86_400_000;

/** Midnight UTC of the calendar day `d` falls on. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `yyyy-mm-dd` of a date, in UTC. */
export function isoDay(d: Date): string {
  return utcDay(d).toISOString().slice(0, 10);
}

/** Whole days from `now`'s day to `due`'s day. 0 = due today, negative = overdue. */
export function daysUntil(due: Date, now: Date = new Date()): number {
  return Math.round((utcDay(due).getTime() - utcDay(now).getTime()) / DAY_MS);
}

/**
 * Add whole months, clamped to the month's last day: a domain bought on 31 Jan
 * renews on 28/29 Feb, not on 3 March.
 */
function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/**
 * The date one cycle after `from`. Null for a one-time purchase (nothing to
 * renew) and for a custom cycle without a valid day count.
 */
export function advanceOneCycle(from: Date, cycle: string, customDays?: number | null): Date | null {
  const base = utcDay(from);
  switch (cycle) {
    case "MONTHLY":
      return addMonths(base, 1);
    case "QUARTERLY":
      return addMonths(base, 3);
    case "YEARLY":
      return addMonths(base, 12);
    case "CUSTOM":
      return customDays && customDays > 0 ? new Date(base.getTime() + customDays * DAY_MS) : null;
    default:
      return null;
  }
}

/**
 * The next due date on or after today, rolling `start` forward one cycle at a
 * time. Used to suggest an end date from a start date in the form; a stored
 * `endDate` is always the truth once set. Bounded so a bad custom cycle cannot
 * loop forever.
 */
export function nextDueFrom(start: Date, cycle: string, customDays?: number | null, now: Date = new Date()): Date | null {
  let d: Date | null = utcDay(start);
  const today = utcDay(now).getTime();
  for (let i = 0; i < 2000 && d; i++) {
    const n = advanceOneCycle(d, cycle, customDays);
    if (!n) return null;
    d = n;
    if (d.getTime() >= today) return d;
  }
  return d;
}

/** Monthly share of one cycle's cost. A one-time purchase costs nothing per month. */
export function monthlyFactor(cycle: string, customDays?: number | null): number {
  switch (cycle) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 1 / 3;
    case "YEARLY":
      return 1 / 12;
    case "CUSTOM":
      return customDays && customDays > 0 ? 30.4375 / customDays : 0;
    default:
      return 0;
  }
}

export type DueTone = "overdue" | "week" | "month" | "ok" | "none";

/** Chip colour: overdue red, ≤7 days orange, ≤30 days amber, else green. */
export function dueTone(endDate: Date | null, status: string, now: Date = new Date()): DueTone {
  if (!endDate || status === "CANCELLED") return "none";
  const d = daysUntil(endDate, now);
  if (d < 0) return "overdue";
  if (d <= 7) return "week";
  if (d <= 30) return "month";
  return "ok";
}

export function dueText(endDate: Date | null, now: Date = new Date()): string {
  if (!endDate) return "No end date";
  const d = daysUntil(endDate, now);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}

/** Clean a reminder list: whole days 0–365, unique, largest first. */
export function cleanRemindDays(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : DEFAULT_REMIND_DAYS;
  const out = [...new Set(arr.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 0 && n <= 365))];
  return out.sort((a, b) => b - a).slice(0, 8);
}

/** The dedupe key stored in `lastRemindedFor`: one notice per due date per threshold. */
export function reminderKey(endDate: Date, threshold: number | "expired" | "overdue"): string {
  return `${isoDay(endDate)}:${threshold}`;
}

export type ReminderDecision =
  | { kind: "none" }
  | { kind: "remind"; key: string; threshold: number; daysLeft: number }
  | { kind: "expire"; key: string; daysLeft: number }
  | { kind: "overdue"; key: string; daysLeft: number };

/**
 * What the daily sweep should do for one subscription today.
 *
 * The threshold picked is the SMALLEST one already crossed, so a sweep that
 * missed a few days sends the most urgent notice once, not every notice it
 * skipped. The key is checked against `lastRemindedFor`, so the same notice
 * is never sent twice, however often the job runs.
 */
export function reminderDecision(
  s: { endDate: Date | null; status: string; autoRenew: boolean; remindDaysBefore: number[]; lastRemindedFor: string | null },
  now: Date = new Date()
): ReminderDecision {
  if (!s.endDate || s.status !== "ACTIVE") return { kind: "none" };
  const daysLeft = daysUntil(s.endDate, now);
  if (daysLeft < 0) {
    if (!s.autoRenew) return { kind: "expire", key: reminderKey(s.endDate, "expired"), daysLeft };
    const key = reminderKey(s.endDate, "overdue");
    return s.lastRemindedFor === key ? { kind: "none" } : { kind: "overdue", key, daysLeft };
  }
  const crossed = cleanRemindDays(s.remindDaysBefore).filter((t) => daysLeft <= t);
  if (crossed.length === 0) return { kind: "none" };
  const threshold = Math.min(...crossed);
  const key = reminderKey(s.endDate, threshold);
  if (s.lastRemindedFor === key) return { kind: "none" };
  // A smaller threshold for this due date was already sent (e.g. the 1-day one,
  // then someone added a 7-day threshold): never go back to a less urgent one.
  const last = s.lastRemindedFor?.split(":");
  if (last && last[0] === isoDay(s.endDate) && /^\d+$/.test(last[1] ?? "") && Number(last[1]) < threshold) {
    return { kind: "none" };
  }
  return { kind: "remind", key, threshold, daysLeft };
}

/** Clean the custom-field builder's rows. Empty labels are dropped. */
export function cleanCustomFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  for (const r of raw.slice(0, 30)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const label = String(o.label ?? "").trim().slice(0, 60);
    if (!label) continue;
    const type = CUSTOM_FIELD_TYPES.includes(o.type as CustomFieldType) ? (o.type as CustomFieldType) : "text";
    out.push({ label, type, value: String(o.value ?? "").trim().slice(0, 500) });
  }
  return out;
}

/** "Hostinger hosting renews in 7 days ($12.99)" — one sentence for every channel. */
export function reminderMessage(
  s: { name: string; autoRenew: boolean; cost: number | null; currency: string },
  d: ReminderDecision
): { title: string; message: string } | null {
  const price = s.cost != null && s.cost > 0 ? ` (${formatCost(s.cost, s.currency)})` : "";
  const verb = s.autoRenew ? "renews" : "expires";
  if (d.kind === "remind") {
    const when = d.daysLeft === 0 ? "today" : d.daysLeft === 1 ? "tomorrow" : `in ${d.daysLeft} days`;
    return { title: `Renewal due: ${s.name}`, message: `${s.name} ${verb} ${when}${price}.` };
  }
  if (d.kind === "expire") {
    return { title: `Expired: ${s.name}`, message: `${s.name} has expired${price}. Renew it or mark it cancelled.` };
  }
  if (d.kind === "overdue") {
    return {
      title: `Renewal date passed: ${s.name}`,
      message: `${s.name} was due to renew ${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"} ago${price}. Check it renewed, then press "Renewed".`,
    };
  }
  return null;
}

export function formatCost(n: number, currency: string): string {
  const v = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency === "USD" ? `$${v}` : `${currency} ${v}`;
}
