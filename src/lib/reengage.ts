import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getPointsPerUsd } from "@/lib/economy";
import { getTaskViewerContext, visibleTaskWhere } from "@/lib/task-visibility";
import { deliverToUser } from "@/lib/notify";
import { usd } from "@/lib/utils";

/**
 * "You have new tasks waiting" — a reminder to users who stopped coming back.
 *
 * Who: active, non-staff users whose last visit (UserActiveDay) was at least
 * `reengage.inactive_days` ago but within the last 60 days (someone gone for a
 * year is not reached by an email about today's tasks), and who were not
 * reminded in the last `reengage.cooldown_days`.
 *
 * What: an in-app notification, a push (when they allowed push), and an email
 * when the admin has switched on "Inactive-user reminders" (Settings → Email).
 * The amount is real: the tasks THIS user can see right now (their plan,
 * targeting and access level), preferring ones added since their last visit.
 * Nobody is told "$1.50 of tasks" when there are none — no tasks, no message.
 *
 * Each user is claimed with a conditional update before anything is sent, so
 * two scheduler runs can never remind the same person twice.
 */

const DAY = 86_400_000;
const LOOKBACK_DAYS = 60;

export async function getReengageConfig() {
  const [enabled, inactiveDays, cooldownDays, perRun] = await Promise.all([
    getSetting<boolean>("reengage.enabled", true),
    getSetting<number>("reengage.inactive_days", 3),
    getSetting<number>("reengage.cooldown_days", 4),
    getSetting<number>("reengage.max_per_run", 200),
  ]);
  const n = (v: unknown, def: number, min: number, max: number) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
  };
  return {
    enabled: enabled !== false,
    inactiveDays: n(inactiveDays, 3, 1, 60),
    cooldownDays: n(cooldownDays, 4, 1, 60),
    perRun: n(perRun, 200, 1, 2000),
  };
}

/** Tasks this user can do now — new since their last visit when there are any. */
async function availableFor(userId: string, since: Date) {
  const ctx = await getTaskViewerContext(userId);
  if (!ctx || !ctx.hasTasksFeature) return null;
  // A background job has no "current device" (the request is the scheduler's),
  // so device rules are not applied: the reminder goes to the person.
  const base = visibleTaskWhere(
    { ...ctx.viewer, device: undefined },
    { accessLevel: ctx.accessLevel, allowedTypes: ctx.allowedTypes }
  );
  const select = { id: true, pointsReward: true } as const;
  const fresh = await prisma.task.findMany({ where: { AND: [base, { createdAt: { gt: since } }] }, select, take: 200 });
  if (fresh.length > 0) return { tasks: fresh, isNew: true };
  const any = await prisma.task.findMany({ where: base, select, take: 200 });
  return any.length > 0 ? { tasks: any, isNew: false } : null;
}

export async function runReengageReminders(): Promise<{ candidates: number; reminded: number; skippedNoTasks: number }> {
  const out = { candidates: 0, reminded: 0, skippedNoTasks: 0 };
  const cfg = await getReengageConfig();
  if (!cfg.enabled) return out;

  const now = Date.now();
  const inactiveBefore = new Date(now - cfg.inactiveDays * DAY);
  const activeSince = new Date(now - LOOKBACK_DAYS * DAY);
  const cooldownBefore = new Date(now - cfg.cooldownDays * DAY);

  const rows = await prisma.$queryRaw<Array<{ id: string; last: Date }>>(Prisma.sql`
    SELECT u.id, a.last
    FROM "User" u
    JOIN (SELECT "userId", MAX("date") AS last FROM "UserActiveDay" GROUP BY "userId") a ON a."userId" = u.id
    WHERE u.status = 'ACTIVE'
      AND u.role = 'USER'
      AND a.last < ${inactiveBefore}
      AND a.last >= ${activeSince}
      AND (u."lastReengageAt" IS NULL OR u."lastReengageAt" < ${cooldownBefore})
    ORDER BY a.last DESC
    LIMIT ${cfg.perRun}
  `);
  out.candidates = rows.length;
  if (rows.length === 0) return out;

  const pointsPerUsd = await getPointsPerUsd();
  for (const r of rows) {
    try {
      const avail = await availableFor(r.id, new Date(r.last));
      if (!avail) {
        out.skippedNoTasks++;
        continue;
      }
      // Claim first: only one run may remind this person in this window.
      const claimed = await prisma.user.updateMany({
        where: { id: r.id, OR: [{ lastReengageAt: null }, { lastReengageAt: { lt: cooldownBefore } }] },
        data: { lastReengageAt: new Date() },
      });
      if (claimed.count === 0) continue;

      const points = avail.tasks.reduce((s, t) => s + (t.pointsReward ?? 0), 0);
      const worth = pointsPerUsd > 0 ? usd(points / pointsPerUsd) : `${points.toLocaleString()} points`;
      const n = avail.tasks.length;
      const title = avail.isNew ? `New tasks worth ${worth} are waiting` : `Tasks worth ${worth} are waiting for you`;
      const message = avail.isNew
        ? `${n} new task${n === 1 ? " was" : "s were"} added to your account since your last visit. Complete ${n === 1 ? "it" : "them"} before ${n === 1 ? "it's" : "they're"} gone.`
        : `${n} task${n === 1 ? " is" : "s are"} available for you right now. Complete ${n === 1 ? "it" : "them"} before ${n === 1 ? "it runs" : "they run"} out.`;

      await prisma.notification.create({
        data: { userId: r.id, type: "TASK", title, message, data: { link: "/tasks", kind: "reengage" } },
      });
      // Push (if they allowed it) + email (only when the admin switched the
      // "Inactive-user reminders" email on).
      await deliverToUser({ category: "reengagement", userId: r.id, title, message, link: "/tasks" });
      out.reminded++;
    } catch (err) {
      console.error("[reengage] failed for", r.id, err);
    }
  }
  return out;
}
