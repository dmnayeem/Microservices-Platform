import "server-only";
import { Prisma, NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { sendNotificationEmail } from "@/lib/email";
import { toNum } from "@/lib/money";
import { periodLabel, periodOf, shiftPeriod } from "@/lib/company-finance/constants";
import {
  FINANCE_ALERTS_KEY,
  normalizeFinanceAlerts,
  type FinanceAlertSettings,
  type FinanceAlertType,
} from "@/lib/company-finance/alerts-shared";

/**
 * Finance alerts: one way to tell the finance team something, governed by the
 * per-alert switches on the Alerts tab (alerts-shared.ts).
 *
 * Dedupe: an alert that must go out once (a bill's reminder for a month, an
 * overdue notice) carries a key; the key is CLAIMED by inserting it into
 * FinanceAlertLog (unique) before anything is sent. A rerun, or two servers at
 * once, hits the unique index and sends nothing. A crash after the claim loses
 * that one notice rather than sending it twice — same trade as the
 * subscription reminders.
 */

const DAY = 86_400_000;
const RECURRING_HREF = "/admin/finance/company?tab=recurring";
const ENTRIES_HREF = "/admin/finance/company?tab=entries";

export async function getFinanceAlertSettings(): Promise<FinanceAlertSettings> {
  return normalizeFinanceAlerts(await getSetting<unknown>(FINANCE_ALERTS_KEY, null));
}

/** Who works on the books — the same rule as the Finance team screen. */
const FINANCE_TEAM_WHERE: Prisma.UserWhereInput = {
  status: "ACTIVE",
  OR: [
    { role: { in: ["SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_MODERATOR"] } },
    { financeGrants: { isEmpty: false } },
  ],
};

/** Claim a once-only key; false = already sent. */
async function claim(key: string): Promise<boolean> {
  try {
    await prisma.financeAlertLog.create({ data: { key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export interface FinanceAlertMessage {
  title: string;
  message: string;
  link: string;
  /** Send once for this key (see claim). Omit for one-off events. */
  dedupeKey?: string;
}

/**
 * Tell the finance team, as the alert's switches say. Returns what was sent.
 * Never throws for a delivery problem — the caller's own work (a withdrawal
 * request, a sweep) must not fail because an email did not go.
 */
export async function sendFinanceAlert(
  type: FinanceAlertType,
  msg: FinanceAlertMessage,
  settings?: FinanceAlertSettings
): Promise<{ notifications: number; emails: number; skipped?: string }> {
  const rule = (settings ?? (await getFinanceAlertSettings()))[type];
  if (!rule.enabled || (!rule.inApp && !rule.email)) return { notifications: 0, emails: 0, skipped: "off" };
  if (msg.dedupeKey && !(await claim(`${type}:${msg.dedupeKey}`))) {
    return { notifications: 0, emails: 0, skipped: "already_sent" };
  }
  const team = await prisma.user.findMany({
    where: FINANCE_TEAM_WHERE,
    select: { id: true, email: true },
    take: 200,
  });
  let notifications = 0;
  let emails = 0;
  if (rule.inApp && team.length) {
    const r = await prisma.notification.createMany({
      data: team.map((u) => ({
        userId: u.id,
        type: NotificationType.SYSTEM,
        title: msg.title,
        message: msg.message,
        data: { link: msg.link, financeAlert: type },
      })),
    });
    notifications = r.count;
  }
  if (rule.email) {
    for (const u of team) {
      if (!u.email || u.email.endsWith("@deleted.local")) continue;
      // A staff service notice, not marketing: sent even with notification
      // emails off for the person (same category as subscription reminders).
      await sendNotificationEmail(u.email, msg.title, msg.message, msg.link, {
        transactional: true,
        category: "staff_alerts",
      })
        .then(() => emails++)
        .catch(() => {});
    }
  }
  return { notifications, emails };
}

/** Fire-and-forget form for request paths (a withdrawal, a deposit). */
export function queueFinanceAlert(type: FinanceAlertType, msg: FinanceAlertMessage): void {
  void sendFinanceAlert(type, msg).catch((e) => console.error(`[finance-alert] ${type} failed:`, e));
}

const money = (amount: unknown, currency: string) => `${currency} ${toNum(amount as never).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type BillReminderSweep = {
  checked: number;
  upcoming: number;
  overdue: number;
  notifications: number;
  emails: number;
  off: string[];
};

/**
 * Daily: warn the finance team before each recurring bill falls due, and when
 * a bill is still unpaid after its due date.
 */
export async function runBillReminders(now: Date = new Date()): Promise<BillReminderSweep> {
  const out: BillReminderSweep = { checked: 0, upcoming: 0, overdue: 0, notifications: 0, emails: 0, off: [] };
  const settings = await getFinanceAlertSettings();
  const today = utcDay(now);

  // ── Recurring bills coming up ──
  const due = settings.RECURRING_DUE;
  if (due.enabled) {
    const lead = due.daysBefore ?? 7;
    const templates = await prisma.recurringEntry.findMany({
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        amount: true,
        currency: true,
        dueDay: true,
        startPeriod: true,
        endPeriod: true,
      },
      take: 1000,
    });
    out.checked += templates.length;
    const thisPeriod = periodOf(now);
    for (const t of templates) {
      // This month's due date if it is still ahead, else next month's.
      let period = thisPeriod;
      const dueOn = (p: string) => {
        const [y, m] = p.split("-").map(Number);
        return Date.UTC(y!, m! - 1, Math.min(28, Math.max(1, t.dueDay)));
      };
      if (dueOn(period) < today) period = shiftPeriod(period, 1);
      if (period < t.startPeriod || (t.endPeriod && period > t.endPeriod)) continue;
      const daysLeft = Math.round((dueOn(period) - today) / DAY);
      if (daysLeft < 0 || daysLeft > lead) continue;
      // Already paid for that month — nothing to remind.
      const paid = await prisma.financeEntry.findFirst({
        where: { recurringId: t.id, period, status: "PAID" },
        select: { id: true },
      });
      if (paid) continue;
      const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
      const r = await sendFinanceAlert(
        "RECURRING_DUE",
        {
          title: `Bill due ${when}: ${t.title}`,
          message: `${t.title} — ${money(t.amount, t.currency)} for ${periodLabel(period)} is due on ${new Date(dueOn(period)).toISOString().slice(0, 10)} (${when}).`,
          link: RECURRING_HREF,
          dedupeKey: `${t.id}:${period}`,
        },
        settings
      );
      if (!r.skipped) {
        out.upcoming++;
        out.notifications += r.notifications;
        out.emails += r.emails;
      }
    }
  } else out.off.push("recurring");

  // ── Bills past their due date, still unpaid ──
  const od = settings.BILL_OVERDUE;
  if (od.enabled) {
    const late = await prisma.financeEntry.findMany({
      where: {
        kind: "EXPENSE",
        status: "PENDING",
        dueDate: { lt: new Date(today), gte: new Date(today - 60 * DAY) },
      },
      select: { id: true, title: true, amount: true, currency: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 500,
    });
    out.checked += late.length;
    for (const e of late) {
      const daysLate = Math.round((today - utcDay(e.dueDate!)) / DAY);
      // The day after it was due, and again a week later.
      const step = daysLate >= 7 ? 7 : daysLate >= 1 ? 1 : 0;
      if (!step) continue;
      const r = await sendFinanceAlert(
        "BILL_OVERDUE",
        {
          title: `Overdue bill: ${e.title}`,
          message: `${e.title} — ${money(e.amount, e.currency)} was due on ${e.dueDate!.toISOString().slice(0, 10)} and is still unpaid (${daysLate} day${daysLate === 1 ? "" : "s"} late).`,
          link: ENTRIES_HREF,
          dedupeKey: `${e.id}:${step}`,
        },
        settings
      );
      if (!r.skipped) {
        out.overdue++;
        out.notifications += r.notifications;
        out.emails += r.emails;
      }
    }
  } else out.off.push("overdue");

  return out;
}

export function summariseBillReminders(s: BillReminderSweep): string {
  const bits = [
    `${s.upcoming} upcoming-bill reminder${s.upcoming === 1 ? "" : "s"}`,
    `${s.overdue} overdue notice${s.overdue === 1 ? "" : "s"}`,
    `${s.notifications} notification${s.notifications === 1 ? "" : "s"}, ${s.emails} email${s.emails === 1 ? "" : "s"}`,
  ];
  if (s.off.length) bits.push(`switched off: ${s.off.join(", ")}`);
  return bits.join(" · ");
}
