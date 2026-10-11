import "server-only";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { buildDailyProgress, getActiveMissionForUser, resolveTaskTypeBucket } from "@/lib/daily-mission-progress";
import { getUserDayContext } from "@/lib/user-day";
import { listMissionsForUser } from "@/lib/missions";
import { listEventsForUser } from "@/lib/events";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";
import { computeTaskSummary } from "@/lib/tasks-summary";
import { levelRewardsFor } from "@/lib/level-rewards-server";

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
  /**
   * More counts, keyed by the page they belong to: tasks left per task type
   * (and on /tasks in all), level rewards to claim, contests to enter, an
   * unanswered feedback round, open Spotlight auctions. Drawn on the sidebar,
   * the bottom bar and the feed's Quick Earn tiles.
   */
  byHref: Record<string, number>;
}

/** Task type → its list page (the hrefs Quick Earn and the menu link to). */
const TYPE_HREF: Record<string, string> = {
  VIDEO: "/video-tasks",
  ARTICLE: "/article-tasks",
  SOCIAL_ENGAGE: "/social-tasks",
  SOCIAL_POSTS: "/social-posts",
  APPINSTALL: "/app-install-tasks",
  VISIT: "/visit-tasks",
  CUSTOM: "/custom-tasks",
  SURVEY: "/survey-tasks",
  QUIZ: "/quiz-tasks",
  PROXY: "/proxy-tasks",
};

/**
 * The task part is the costly one (the whole /tasks summary), and the counts
 * are fetched every minute and on every page change — so it is kept a minute
 * per user. A count a minute stale is fine; the start/submit routes decide.
 */
const taskMemo = new Map<string, { at: number; v: Record<string, number> }>();
async function taskCounts(userId: string): Promise<Record<string, number>> {
  const hit = taskMemo.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const data = await computeTaskSummary(userId);
  const out: Record<string, number> = {};
  if (data) {
    let total = 0;
    for (const [type, href] of Object.entries(TYPE_HREF)) {
      const row = data.summary[type] ?? (type === "SOCIAL_ENGAGE" ? data.summary.SOCIAL : undefined);
      const left = row ? Math.max(0, row.available - (row.completed ?? 0)) : 0;
      out[href] = left;
      if (type !== "SOCIAL_POSTS") total += left;
    }
    out["/board-tasks"] = Math.max(0, data.board.available - (data.board.completed ?? 0));
    out["/tasks"] = total;
  }
  if (taskMemo.size > 5000) taskMemo.clear();
  taskMemo.set(userId, { at: Date.now(), v: out });
  return out;
}

/** Level rewards to claim, contests to enter, feedback to give, auctions open. */
async function communityCounts(userId: string, now: Date): Promise<Record<string, number>> {
  const [lv, contests, entered, round, auctions] = await Promise.all([
    levelRewardsFor(userId).catch(() => null),
    prisma.contest
      .findMany({
        where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now } },
        select: { id: true },
        take: 20,
      })
      .catch(() => [] as { id: string }[]),
    prisma.contestEntry
      .findMany({ where: { userId, contest: { status: "PUBLISHED", endAt: { gt: now } } }, select: { contestId: true } })
      .catch(() => [] as { contestId: string }[]),
    prisma.feedbackRound
      .findFirst({
        where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now }, responses: { none: { userId } } },
        select: { id: true },
      })
      .catch(() => null),
    prisma.spotlightAuction
      .count({ where: { status: "OPEN", biddingEndsAt: { gt: now } } })
      .catch(() => 0),
  ]);
  const enteredIds = new Set(entered.map((e) => e.contestId));
  return {
    "/level-rewards": lv?.claimable ?? 0,
    "/contests": contests.filter((c) => !enteredIds.has(c.id)).length,
    "/feedback": round ? 1 : 0,
    "/spotlight": auctions,
  };
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
  const [dailyMission, missions, events, lottery, tasksByHref, community] = await Promise.all([
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
    taskCounts(userId).catch(() => ({}) as Record<string, number>),
    communityCounts(userId, now).catch(() => ({}) as Record<string, number>),
  ]);
  return { dailyMission, missions, events, lottery, byHref: { ...tasksByHref, ...community } };
}
