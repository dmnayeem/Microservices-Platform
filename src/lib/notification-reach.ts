import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, NotificationType } from "@/generated/prisma/client";
import { STAFF_ROLES } from "@/lib/staff";
import { PWA_PLATFORMS, type PwaPlatform } from "@/lib/pwa-shared";

/**
 * Reads for /admin/users/notification-reach and its CSV export, plus the
 * "remind to turn on" action.
 *
 * Push status, one definition:
 *  - on      the user has at least one PushSubscription row AND pushNotifications = true
 *  - off     the user switched push off in their own settings (pushNotifications = false)
 *  - notset  pushNotifications is still true but there is no PushSubscription row:
 *            they never allowed notifications in any browser, or allowed and later
 *            blocked/removed them
 *
 * `PushSubscription` has no relation to User, so everything that needs it is
 * raw SQL with EXISTS / a grouped lookup — never one query per row. Staff are
 * left out everywhere; so are non-ACTIVE accounts unless asked.
 */

export type PushState = "on" | "off" | "notset";
export const PUSH_STATE_LABEL: Record<PushState, string> = {
  on: "On",
  off: "Off (setting)",
  notset: "Not set up",
};

/** Marker in `Notification.data.kind` — also how the 7-day dedup finds earlier reminders. */
export const PUSH_REMINDER_KIND = "push_reminder";
export const PUSH_REMINDER_COOLDOWN_DAYS = 7;
export const PUSH_REMINDER_CAP = 5_000;
export const PUSH_REMINDER_LINK = "/settings#notifications";
export const PUSH_REMINDER_TITLE = "Turn on notifications";
export const PUSH_REMINDER_BODY =
  "Be first to new offers, tasks and events — turn notifications on to earn more.";

export interface ReachFilters {
  status: PushState | "all";
  installed: "yes" | "no" | "";
  platform: PwaPlatform | "";
  /** YYYY-MM-DD inclusive — the user was active on at least one day in the range. */
  from: string;
  to: string;
  q: string;
  /** "all" includes SUSPENDED / BANNED / unverified accounts. */
  accounts: "active" | "all";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseReachFilters(p: Record<string, string | undefined>): ReachFilters {
  const status = p.status === "on" || p.status === "off" || p.status === "notset" ? p.status : "all";
  const installed = p.installed === "yes" || p.installed === "no" ? p.installed : "";
  const platform = (PWA_PLATFORMS as string[]).includes(p.platform ?? "") ? (p.platform as PwaPlatform) : "";
  return {
    status,
    installed,
    platform,
    from: ISO_DAY.test(p.from ?? "") ? p.from! : "",
    to: ISO_DAY.test(p.to ?? "") ? p.to! : "",
    q: (p.q ?? "").trim().slice(0, 100),
    accounts: p.accounts === "all" ? "all" : "active",
  };
}

const HAS_SUB = Prisma.sql`EXISTS (SELECT 1 FROM "PushSubscription" ps WHERE ps."userId" = u.id)`;
const PUSH_ON = Prisma.sql`(u."pushNotifications" AND ${HAS_SUB})`;
const PUSH_OFF = Prisma.sql`(NOT u."pushNotifications")`;
const PUSH_NOTSET = Prisma.sql`(u."pushNotifications" AND NOT ${HAS_SUB})`;
const EMAIL_ON = Prisma.sql`(u."emailNotifications" AND u.email <> '' AND u.email NOT LIKE '%@deleted.local')`;

/** Staff out, always. Raw-SQL twin of NON_STAFF_WHERE, built from the same STAFF_ROLES. */
function baseWhere(accounts: "active" | "all"): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [
    Prisma.sql`u.role::text NOT IN (${Prisma.join(STAFF_ROLES.map((r) => String(r)))})`,
  ];
  if (accounts === "active") parts.push(Prisma.sql`u.status = 'ACTIVE'`);
  return parts;
}

export function reachWhere(f: ReachFilters): Prisma.Sql {
  const and = baseWhere(f.accounts);
  if (f.status === "on") and.push(PUSH_ON);
  else if (f.status === "off") and.push(PUSH_OFF);
  else if (f.status === "notset") and.push(PUSH_NOTSET);
  if (f.installed === "yes") and.push(Prisma.sql`u."pwaFirstSeenAt" IS NOT NULL`);
  else if (f.installed === "no") and.push(Prisma.sql`u."pwaFirstSeenAt" IS NULL`);
  if (f.platform) and.push(Prisma.sql`u."pwaPlatform" = ${f.platform}`);
  if (f.from || f.to) {
    const day: Prisma.Sql[] = [Prisma.sql`d."userId" = u.id`];
    if (f.from) day.push(Prisma.sql`d.date >= ${f.from}::date`);
    if (f.to) day.push(Prisma.sql`d.date <= ${f.to}::date`);
    and.push(Prisma.sql`EXISTS (SELECT 1 FROM "UserActiveDay" d WHERE ${Prisma.join(day, " AND ")})`);
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    and.push(Prisma.sql`(u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.username ILIKE ${like})`);
  }
  return Prisma.join(and, " AND ");
}

export interface ReachRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  status: string;
  createdAt: Date;
  pushNotifications: boolean;
  emailOn: boolean;
  pwaFirstSeenAt: Date | null;
  pwaPlatform: string | null;
  devices: number;
  lastActive: Date | null;
  pushState: PushState;
}

interface RawRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  status: string;
  createdAt: Date;
  pushNotifications: boolean;
  emailOn: boolean;
  pwaFirstSeenAt: Date | null;
  pwaPlatform: string | null;
  total: number;
}

/**
 * One page of users: ONE query for the rows (+ the total via a window count),
 * then ONE batched lookup of device counts and last-active day for just those
 * ids. Two queries however many rows are on the page.
 */
export async function reachPage(
  f: ReachFilters,
  take: number,
  skip: number
): Promise<{ rows: ReachRow[]; total: number }> {
  const raw = await prisma.$queryRaw<RawRow[]>`
    SELECT u.id, u.name, u.username, u.email, u.status::text AS status, u."createdAt",
           u."pushNotifications", ${EMAIL_ON} AS "emailOn",
           u."pwaFirstSeenAt", u."pwaPlatform",
           COUNT(*) OVER ()::int AS total
    FROM "User" u
    WHERE ${reachWhere(f)}
    ORDER BY u."createdAt" DESC, u.id
    LIMIT ${take} OFFSET ${skip}`;
  if (raw.length === 0) return { rows: [], total: skip > 0 ? await reachCount(f) : 0 };

  const extra = await pageExtras(raw.map((r) => r.id));
  return { rows: raw.map((r) => toRow(r, extra.get(r.id))), total: raw[0].total };
}

/** Only used when someone pages past the end — the window count needs a row to ride on. */
async function reachCount(f: ReachFilters): Promise<number> {
  const [r] = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "User" u WHERE ${reachWhere(f)}`;
  return r?.n ?? 0;
}

/** Device count + last active day for a set of user ids — one query for all of them. */
async function pageExtras(ids: string[]) {
  const out = new Map<string, { devices: number; lastActive: Date | null }>();
  if (ids.length === 0) return out;
  const rows = await prisma.$queryRaw<Array<{ id: string; devices: number; lastActive: Date | null }>>`
    SELECT x.id,
           (SELECT COUNT(*)::int FROM "PushSubscription" ps WHERE ps."userId" = x.id) AS devices,
           (SELECT MAX(d.date) FROM "UserActiveDay" d WHERE d."userId" = x.id) AS "lastActive"
    FROM unnest(${ids}::text[]) AS x(id)`;
  for (const r of rows) out.set(r.id, { devices: r.devices, lastActive: r.lastActive });
  return out;
}

function toRow(r: RawRow, extra: { devices: number; lastActive: Date | null } | undefined): ReachRow {
  const devices = extra?.devices ?? 0;
  const pushState: PushState = !r.pushNotifications ? "off" : devices > 0 ? "on" : "notset";
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    email: r.email,
    status: r.status,
    createdAt: r.createdAt,
    pushNotifications: r.pushNotifications,
    emailOn: r.emailOn,
    pwaFirstSeenAt: r.pwaFirstSeenAt,
    pwaPlatform: r.pwaPlatform,
    devices,
    lastActive: extra?.lastActive ?? null,
    pushState,
  };
}

/** CSV export: same filters, capped, still two queries (rows + one batched lookup). */
export async function reachExport(f: ReachFilters, cap = 10_000): Promise<ReachRow[]> {
  const { rows } = await reachPage(f, cap, 0);
  return rows;
}

export interface ReachStats {
  users: number;
  pushOn: number;
  pushOff: number;
  notSet: number;
  emailOn: number;
  emailOff: number;
  installed: number;
  installedNoPush: number;
}

/**
 * Every summary card in ONE aggregate query over ACTIVE non-staff users,
 * cached for 60 s — these are read-only stats and Accelerate bills per query.
 */
export const reachStats = unstable_cache(
  async (): Promise<ReachStats> => {
    const [r] = await prisma.$queryRaw<ReachStats[]>`
      SELECT COUNT(*)::int AS users,
             COUNT(*) FILTER (WHERE x.pn AND x.sub)::int AS "pushOn",
             COUNT(*) FILTER (WHERE NOT x.pn)::int AS "pushOff",
             COUNT(*) FILTER (WHERE x.pn AND NOT x.sub)::int AS "notSet",
             COUNT(*) FILTER (WHERE x.em)::int AS "emailOn",
             COUNT(*) FILTER (WHERE NOT x.em)::int AS "emailOff",
             COUNT(*) FILTER (WHERE x.inst)::int AS installed,
             COUNT(*) FILTER (WHERE x.inst AND NOT (x.pn AND x.sub))::int AS "installedNoPush"
      FROM (
        SELECT u."pushNotifications" AS pn, ${HAS_SUB} AS sub, ${EMAIL_ON} AS em,
               (u."pwaFirstSeenAt" IS NOT NULL) AS inst
        FROM "User" u
        WHERE ${Prisma.join(baseWhere("active"), " AND ")}
      ) x`;
    return r;
  },
  ["admin-notification-reach-stats"],
  { revalidate: 60 }
);

// ───────────────────────── Remind to turn on ─────────────────────────────────

export type ReminderTarget = { userIds: string[] } | { filters: ReachFilters };

export interface ReminderResult {
  matched: number;
  sent: number;
  skippedRecent: number;
  /** Selected users who already have push on, or aren't ACTIVE non-staff accounts. */
  skippedOther: number;
  capped: boolean;
}

/**
 * Who would get a reminder: ACTIVE non-staff users whose push is NOT on, from
 * either an explicit selection or the current filter (capped). One query.
 */
async function reminderCandidates(target: ReminderTarget): Promise<{ ids: string[]; requested: number; capped: boolean }> {
  if ("userIds" in target) {
    const ids = [...new Set(target.userIds.filter((s) => typeof s === "string" && s))].slice(0, PUSH_REMINDER_CAP);
    if (ids.length === 0) return { ids: [], requested: 0, capped: false };
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM "User" u
      WHERE ${Prisma.join(baseWhere("active"), " AND ")}
        AND u.id = ANY(${ids}::text[])
        AND NOT ${PUSH_ON}`;
    return { ids: rows.map((r) => r.id), requested: ids.length, capped: false };
  }
  const f = { ...target.filters, accounts: "active" as const };
  if (f.status === "on") return { ids: [], requested: 0, capped: false };
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id FROM "User" u
    WHERE ${reachWhere(f)} AND NOT ${PUSH_ON}
    ORDER BY u."createdAt" DESC, u.id
    LIMIT ${PUSH_REMINDER_CAP + 1}`;
  const capped = rows.length > PUSH_REMINDER_CAP;
  const ids = rows.slice(0, PUSH_REMINDER_CAP).map((r) => r.id);
  return { ids, requested: ids.length, capped };
}

/**
 * Write ONE in-app notification per user (not push — they don't have push),
 * skipping anyone reminded in the last 7 days. The dedup is the notification
 * itself (`data.kind = push_reminder`), found for the whole set in one query.
 * Inserts go in chunks of 1,000 — one query each.
 */
export async function sendPushReminders(target: ReminderTarget): Promise<ReminderResult> {
  const { ids, requested, capped } = await reminderCandidates(target);
  if (ids.length === 0) {
    return { matched: 0, sent: 0, skippedRecent: 0, skippedOther: requested, capped };
  }

  const since = new Date(Date.now() - PUSH_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.notification.findMany({
    where: {
      userId: { in: ids },
      type: NotificationType.SYSTEM,
      createdAt: { gte: since },
      data: { path: ["kind"], equals: PUSH_REMINDER_KIND },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recentSet = new Set(recent.map((r) => r.userId));
  const toSend = ids.filter((id) => !recentSet.has(id));

  const data = {
    kind: PUSH_REMINDER_KIND,
    link: PUSH_REMINDER_LINK,
    actionUrl: PUSH_REMINDER_LINK,
    actionLabel: "Turn on",
  };
  for (let i = 0; i < toSend.length; i += 1_000) {
    await prisma.notification.createMany({
      data: toSend.slice(i, i + 1_000).map((userId) => ({
        userId,
        type: NotificationType.SYSTEM,
        title: PUSH_REMINDER_TITLE,
        message: PUSH_REMINDER_BODY,
        data,
      })),
    });
  }

  return {
    matched: ids.length,
    sent: toSend.length,
    skippedRecent: recentSet.size,
    skippedOther: Math.max(0, requested - ids.length),
    capped,
  };
}
