import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getTaskViewerContext, visibleTaskWhere } from "@/lib/task-visibility";
import { isWebPushConfigured, webPushToUsers } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma/client";

/**
 * "New tasks are waiting" — one push per member when tasks they can do go
 * live, so the installed app shows a count on its icon (owner, 2026-10-18).
 * Android draws that count from the notification in the tray, not from the
 * Badging API, so without a push a new task never shows on the icon.
 *
 * Coalesced and throttled per member: at most ONE such push every 4 hours.
 * Tasks added while a member is inside their 4 hours are counted in the next
 * one (the scheduler job "new-tasks-push" sends it once the 4 hours are up).
 *
 * The throttle record is the in-app notification row itself (type TASK,
 * `data.kind = "new_tasks"`), so there is no new table or column. Its id is
 * fixed per member and 4-hour bucket (`ntp-<userId>-<bucket>`), so two runs at
 * the same moment (the after() call from a task save and the scheduler) can
 * never both send: the second create hits the primary key and stops.
 *
 * What counts as "new" for a member: a task they can do right now (their plan,
 * level, targeting — `visibleTaskWhere`) that went live after their previous
 * "new tasks" push, looking back at most 24 hours. "Went live" is the later of
 * created / start date — or "now" for a task id handed in by the save that
 * just made it live (a resumed or approved task that was created earlier).
 *
 * Only members with a push subscription, account ACTIVE and the push
 * preference on. Never throws.
 */

const HOUR = 3_600_000;
const GAP_MS = 4 * HOUR;
const LOOKBACK_MS = 24 * HOUR;
const KIND = "new_tasks";
const ID_PREFIX = "ntp-";
const MAX_MEMBERS = 500;
const MAX_CANDIDATES = 500;

export interface NewTasksPushResult {
  /** Why nothing was attempted, when nothing was. */
  skipped?: string;
  /** Tasks that went live in the look-back window. */
  candidates: number;
  /** Members with a push subscription that were looked at. */
  members: number;
  /** Members still inside their 4 hours. */
  throttled: number;
  /** Members told (in-app row written + push sent). */
  notified: number;
  /** Push messages the push services accepted. */
  delivered: number;
}

function bodyFor(n: number): string {
  return n === 1
    ? "1 new task was added — open RevType to earn."
    : `${n} new tasks were added — open RevType to earn.`;
}

const TITLE = "New tasks are waiting";

export async function runNewTasksPush(
  opts: { liveTaskIds?: string[]; maxMs?: number } = {}
): Promise<NewTasksPushResult> {
  const out: NewTasksPushResult = { candidates: 0, members: 0, throttled: 0, notified: 0, delivered: 0 };
  const startedAt = Date.now();
  const maxMs = opts.maxMs ?? 45_000;
  try {
    const [on, taskSwitch, pushSwitch] = await Promise.all([
      getSetting<boolean>("notifications.push_new_tasks", true),
      getSetting<boolean>("notify_new_task", true),
      getSetting<boolean>("push_notifications_enabled", true),
    ]);
    if (on === false) return { ...out, skipped: "switched off" };
    if (taskSwitch === false) return { ...out, skipped: "“New task available” is off" };
    if (pushSwitch === false) return { ...out, skipped: "push is off" };
    if (!isWebPushConfigured()) return { ...out, skipped: "push keys not set" };

    const now = new Date();
    const lookback = new Date(now.getTime() - LOOKBACK_MS);
    const hinted = new Set((opts.liveTaskIds ?? []).filter((x) => typeof x === "string" && x));

    // Tasks that went live recently, before any per-member work — usually
    // none, and then a run costs one query.
    const rows = await prisma.task.findMany({
      where: {
        status: "ACTIVE",
        hidden: false,
        isBoardOnly: false,
        boardId: null,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          {
            OR: [
              { createdAt: { gt: lookback } },
              { startsAt: { gt: lookback } },
              ...(hinted.size ? [{ id: { in: [...hinted] } }] : []),
            ],
          },
        ],
      },
      select: { id: true, createdAt: true, startsAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES,
    });
    const candidates = rows.map((t) => ({
      id: t.id,
      liveAt: hinted.has(t.id)
        ? now.getTime()
        : Math.max(t.createdAt.getTime(), t.startsAt?.getTime() ?? 0),
    }));
    out.candidates = candidates.length;
    if (candidates.length === 0) return out;
    const newestLive = Math.max(...candidates.map((c) => c.liveAt));

    // Members who can receive a push at all.
    const subs = await prisma.pushSubscription.findMany({
      select: { userId: true },
      distinct: ["userId"],
    });
    if (subs.length === 0) return out;
    const members = await prisma.user.findMany({
      where: { id: { in: subs.map((s) => s.userId) }, status: "ACTIVE", pushNotifications: true },
      select: { id: true },
      take: MAX_MEMBERS,
    });
    out.members = members.length;
    if (members.length === 0) return out;

    // Each member's last "new tasks" push in the look-back window.
    const last = (await prisma.notification.groupBy({
      by: ["userId"],
      where: {
        userId: { in: members.map((m) => m.id) },
        type: NotificationType.TASK,
        createdAt: { gte: lookback },
        id: { startsWith: ID_PREFIX },
      },
      _max: { createdAt: true },
    })) as unknown as { userId: string; _max: { createdAt: Date | null } }[];
    const lastAt = new Map(last.map((r) => [r.userId, r._max.createdAt?.getTime() ?? 0]));

    const bucket = Math.floor(now.getTime() / GAP_MS);
    const byCount = new Map<number, string[]>();

    for (const m of members) {
      if (Date.now() - startedAt > maxMs) break;
      const prev = lastAt.get(m.id) ?? 0;
      if (prev && now.getTime() - prev < GAP_MS) {
        out.throttled++;
        continue;
      }
      const since = Math.max(prev, lookback.getTime());
      if (newestLive <= since) continue;
      const ids = candidates.filter((c) => c.liveAt > since).map((c) => c.id);
      if (ids.length === 0) continue;
      try {
        const ctx = await getTaskViewerContext(m.id);
        if (!ctx || !ctx.hasTasksFeature) continue;
        // A background job has no "current device", so device rules are not
        // applied (as in lib/reengage.ts): the push goes to the person.
        const base = visibleTaskWhere(
          { ...ctx.viewer, device: undefined },
          { accessLevel: ctx.accessLevel, allowedTypes: ctx.allowedTypes, now }
        );
        const n = await prisma.task.count({ where: { AND: [base, { id: { in: ids } }] } });
        if (n === 0) continue;

        // Claim: the fixed id makes a second, simultaneous run fail here.
        try {
          await prisma.notification.create({
            data: {
              id: `${ID_PREFIX}${m.id}-${bucket}`,
              userId: m.id,
              type: NotificationType.TASK,
              title: TITLE,
              message: bodyFor(n),
              data: { link: "/tasks", kind: KIND, count: n },
            },
          });
        } catch {
          continue; // already told in this window
        }
        const list = byCount.get(n) ?? [];
        list.push(m.id);
        byCount.set(n, list);
        out.notified++;
      } catch (err) {
        console.error("[new-tasks-push] failed for", m.id, err);
      }
    }

    // One send per distinct count; each payload carries that member's unread
    // count (badgeCount) — which already includes the row written above.
    for (const [n, userIds] of byCount) {
      const r = await webPushToUsers(userIds, { title: TITLE, body: bodyFor(n), url: "/tasks" });
      out.delivered += r.delivered;
    }
  } catch (err) {
    console.error("[new-tasks-push] run failed:", err);
  }
  return out;
}

export function summariseNewTasksPush(r: NewTasksPushResult): string {
  if (r.skipped) return `Nothing sent — ${r.skipped}.`;
  if (r.candidates === 0) return "No tasks went live in the last 24 hours.";
  return `Told ${r.notified} of ${r.members} member(s) with push (${r.throttled} already told in the last 4 hours); ${r.delivered} device(s) reached; ${r.candidates} recent task(s).`;
}
