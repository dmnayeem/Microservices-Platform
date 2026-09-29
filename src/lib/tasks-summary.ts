import { isPostCreationAction, mapSocialTaskRow, type SocialTaskRow } from "@/lib/social-tasks";
import { prisma } from "@/lib/prisma";
import { getUserDayContext } from "@/lib/user-day";
import { getSetting } from "@/lib/system-settings";
import {
  getTaskViewerContext,
  publishedQuizWhere,
  visibleTaskWhere,
} from "@/lib/task-visibility";

export type TaskSummaryRow = {
  available: number;
  completedToday: number;
  /** Distinct eligible tasks of this type the user has ever completed. */
  completed: number;
  earnableXp: number;
  earnablePoints: number;
};

export type TaskSummaryData = {
  summary: Record<string, TaskSummaryRow>;
  board: TaskSummaryRow;
  quizzes: number;
  offerwalls: number;
  visibility: Record<string, boolean>;
};

/**
 * Per-task-type daily aggregates for the category grid on /tasks: how many
 * tasks of each type the viewer is eligible for, how many they've completed
 * TODAY (local day), and the total XP/points earnable.
 *
 * ONE definition, used by GET /api/tasks/summary (client refreshes) and by the
 * /tasks page (first paint), so the two can never disagree. Display only —
 * nothing here decides a credit; the start/submit routes keep their own
 * uncached checks. `null` when the viewer does not exist. Throws on DB errors.
 */
export async function computeTaskSummary(userId: string): Promise<TaskSummaryData | null> {
  // Round 1: everything that does not depend on the viewer context. The
  // offerwall count and the admin visibility toggles used to wait behind the
  // task queries (visibility in a round of its own) for no reason.
  const [ctx, day, offerwalls, visibility] = await Promise.all([
    getTaskViewerContext(userId),
    getUserDayContext(userId),
    prisma.offerwallConfig.count({ where: { isActive: true } }).catch(() => 0),
    // Admin per-category visibility toggles (missing key ⇒ shown).
    getSetting<Record<string, boolean>>("tasks.category_visibility", {}),
  ]);
  if (!ctx) return null;

  // EXACTLY the where the served list uses — these tile counts used to omit
  // the start/expiry windows and the per-plan type gate, so they promised
  // more tasks than /tasks would actually show.
  const eligible = visibleTaskWhere(ctx.viewer, {
    accessLevel: ctx.accessLevel,
    allowedTypes: ctx.allowedTypes,
    // the summary counts board tasks separately
    includeBoardTasks: true,
  });

  // Eligible active tasks per type + total earnable XP; the board aggregate
  // (board-only tasks, any type); standalone published quizzes; active
  // offerwalls — all in parallel.
  const [grouped, boardAgg, quizzes, doneToday, doneEver, socialRows] =
    await Promise.all([
    prisma.task.groupBy({
      by: ["type"],
      where: eligible,
      _count: { _all: true },
      // Points as well as XP. The tile promised "up to 50 XP" and said
      // nothing about the points, which are the number users actually care
      // about and the only one they can compare between task types.
      _sum: { xpReward: true, pointsReward: true },
    }) as unknown as Promise<
      {
        type: string;
        _count: { _all: number };
        _sum: { xpReward: number | null; pointsReward: number | null };
      }[]
    >,
    prisma.task.aggregate({
      where: {
        ...eligible,
        OR: [{ isBoardOnly: true }, { boardId: { not: null } }],
      },
      _count: { _all: true },
      _sum: { xpReward: true, pointsReward: true },
    }) as unknown as Promise<{
      _count: { _all: number };
      _sum: { xpReward: number | null; pointsReward: number | null };
    }>,
    // Quiz GAMES (the standalone Quiz model). Same gate /quizzes applies —
    // counting bare PUBLISHED ignored the level/plan requirements and
    // overstated the tile.
    prisma.quiz
      .count({
        where: publishedQuizWhere({
          level: ctx.viewer.level,
          accessLevel: ctx.accessLevel,
        }),
      })
      .catch(() => 0),
    prisma.taskSubmission.findMany({
      where: {
        userId,
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
        createdAt: { gte: day.startOfDayUtc },
      },
      select: {
        taskId: true,
        task: { select: { type: true, isBoardOnly: true, boardId: true } },
      },
    }) as unknown as Promise<
      {
        taskId: string;
        task: {
          type: string;
          isBoardOnly: boolean;
          boardId: string | null;
        } | null;
      }[]
    >,
    // Lifetime, and DISTINCT by task: "5 of the 20 article tasks are done"
    // is the sentence the tile has to be able to say, and a task completed
    // three times is still one of the twenty. Scoped to the same `eligible`
    // filter as the count it is compared against, so the two halves of the
    // fraction can never describe different sets of tasks.
    prisma.taskSubmission.findMany({
      where: {
        userId,
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
        task: { is: eligible },
      },
      distinct: ["taskId"],
      select: {
        taskId: true,
        task: { select: { type: true, isBoardOnly: true, boardId: true } },
      },
    }) as unknown as Promise<
      {
        taskId: string;
        task: {
          type: string;
          isBoardOnly: boolean;
          boardId: string | null;
        } | null;
      }[]
    >,
    // The SOCIAL tasks, split the way the two lists split them: "Social
    // Posts" (/social-posts, kind=create) and "Social Tasks" (/social-tasks,
    // kind=engage). The tile for posts had no numbers at all, and the one for
    // social counted the post tasks too.
    prisma.task.findMany({
      where: { ...eligible, type: "SOCIAL" },
      select: {
        id: true,
        title: true,
        description: true,
        pointsReward: true,
        xpReward: true,
        difficulty: true,
        socialPlatform: true,
        socialAction: true,
        socialUrl: true,
        socialConfig: true,
        instructions: true,
        instructionVideoUrl: true,
      },
      take: 500,
    }) as unknown as Promise<(SocialTaskRow & { xpReward: number })[]>,
  ]);

  // Tally today's completions per type (+ board) in JS (Prisma can't groupBy
  // a relation field).
  const completedByType = new Map<string, number>();
  let boardCompletedToday = 0;
  for (const s of doneToday) {
    const t = s.task?.type;
    if (t) completedByType.set(t, (completedByType.get(t) ?? 0) + 1);
    if (s.task && (s.task.isBoardOnly || s.task.boardId)) boardCompletedToday += 1;
  }

  const doneByType = new Map<string, number>();
  let boardDone = 0;
  for (const s of doneEver) {
    const t = s.task?.type;
    if (t) doneByType.set(t, (doneByType.get(t) ?? 0) + 1);
    if (s.task && (s.task.isBoardOnly || s.task.boardId)) boardDone += 1;
  }

  const summary: Record<string, TaskSummaryRow> = {};
  for (const g of grouped) {
    summary[g.type] = {
      available: g._count._all,
      completedToday: completedByType.get(g.type) ?? 0,
      completed: Math.min(doneByType.get(g.type) ?? 0, g._count._all),
      earnableXp: g._sum.xpReward ?? 0,
      earnablePoints: g._sum.pointsReward ?? 0,
    };
  }

  // Social Posts / Social Tasks, with the SAME rule as the two lists
  // (api/tasks/social `matchesKind`), so a tile never promises a task its
  // list does not show. A task mixing both kinds is in both lists, and so
  // in both tiles.
  const doneEverIds = new Set(doneEver.map((d) => d.taskId));
  const doneTodayIds = doneToday.map((d) => d.taskId);
  const socialSet = (keep: (actions: string[]) => boolean) => {
    // mapSocialTaskRow, not the raw config: older tasks keep their one
    // action in the legacy columns, and the lists read them through it.
    const rows = socialRows.filter((t) => keep(mapSocialTaskRow(t).items.map((i) => i.action)));
    const ids = new Set(rows.map((t) => t.id));
    return {
      available: rows.length,
      completedToday: doneTodayIds.filter((id) => ids.has(id)).length,
      completed: rows.filter((t) => doneEverIds.has(t.id)).length,
      earnableXp: rows.reduce((a, t) => a + (t.xpReward ?? 0), 0),
      earnablePoints: rows.reduce((a, t) => a + (t.pointsReward ?? 0), 0),
    };
  };
  summary.SOCIAL_POSTS = socialSet((a) => a.some(isPostCreationAction));
  summary.SOCIAL_ENGAGE = socialSet((a) => !a.every(isPostCreationAction));

  const board = {
    available: boardAgg._count._all,
    completedToday: boardCompletedToday,
    completed: Math.min(boardDone, boardAgg._count._all),
    earnableXp: boardAgg._sum.xpReward ?? 0,
    earnablePoints: boardAgg._sum.pointsReward ?? 0,
  };


  return { summary, board, quizzes, offerwalls, visibility };
}
