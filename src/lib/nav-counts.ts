import "server-only";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { buildDailyProgress, getActiveMissionForUser, resolveTaskTypeBucket } from "@/lib/daily-mission-progress";
import { getUserDayContext } from "@/lib/user-day";
import { listMissionsForUser } from "@/lib/missions";
import { listEventsForUser } from "@/lib/events";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";

/**
 * The red counts on Daily Mission, Missions and Events in the menu — like the
 * notification badge: what is still waiting for the user, going down as they
 * do it.
 *
 * Each is computed by the SAME functions the page itself uses, so the badge can
 * never promise something the page does not show:
 *
 *   dailyMission  task completions still needed today (a "complete 5 video
 *                 tasks" item left at 2/5 counts 3), and 1 when everything is
 *                 done but the reward has not been claimed — so the badge does
 *                 not go quiet while money is waiting.
 *   missions      open missions not yet fully claimed (every tier, for tiered
 *                 ones). Locked missions — waiting on another — do not count:
 *                 the user can do nothing about them yet.
 *   events        the same, for events in their window.
 *   lottery       draws open for tickets right now that the user has not
 *                 entered — it drops as they buy a ticket.
 *
 * Every part fails soft to 0: a badge must never break the menu.
 */
export interface NavCounts {
  dailyMission: number;
  missions: number;
  events: number;
  lottery: number;
}

const fullyClaimed = (v: { claimed: boolean; tierViews: Array<{ claimed: boolean }> }) =>
  v.tierViews.length > 0 ? v.tierViews.every((t) => t.claimed) : v.claimed;

async function dailyMissionCount(userId: string): Promise<number> {
  const raw = await getActiveMissionForUser(userId);
  if (!raw) return 0;
  const mission = raw as typeof raw & { items: Array<{ id: string; taskType: string; targetCount: number }> };
  const [{ dayKey }, counts] = await Promise.all([
    getUserDayContext(userId),
    buildDailyProgress(userId, mission.items as never),
  ]);
  const claimed = await prisma.dailyMissionClaim.findUnique({
    where: { userId_missionId_date: { userId, missionId: mission.id, date: dayKey } },
    select: { id: true },
  });
  if (claimed) return 0;
  const left = mission.items.reduce((a, it) => {
    const done = (counts as Record<string, number>)[resolveTaskTypeBucket(it.taskType)] ?? 0;
    return a + Math.max(0, it.targetCount - done);
  }, 0);
  return left > 0 ? left : mission.items.length > 0 ? 1 : 0;
}

export async function getNavCounts(userId: string): Promise<NavCounts> {
  const [viewer, pkg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: TASK_VIEWER_SELECT }).catch(() => null),
    getEffectivePackage(userId).catch(() => null),
  ]);
  const access = pkg?.accessLevel ?? 0;
  const now = new Date();
  const [dailyMission, missions, events, lottery] = await Promise.all([
    dailyMissionCount(userId).catch(() => 0),
    viewer
      ? listMissionsForUser(viewer, access)
          .then((ms) => ms.filter((m) => !m.lockedBy && !fullyClaimed(m)).length)
          .catch(() => 0)
      : Promise.resolve(0),
    listEventsForUser(userId, access)
      .then((es) => es.filter((e) => !fullyClaimed(e)).length)
      .catch(() => 0),
    prisma.lottery
      .count({
        where: {
          status: "ACTIVE",
          startDate: { lte: now },
          endDate: { gt: now },
          tickets: { none: { userId } },
        },
      })
      .catch(() => 0),
  ]);
  return { dailyMission, missions, events, lottery };
}
