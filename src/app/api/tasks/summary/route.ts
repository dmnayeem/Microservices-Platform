import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserDayContext } from "@/lib/user-day";
import { getSetting } from "@/lib/system-settings";
import {
  getTaskViewerContext,
  publishedQuizWhere,
  visibleTaskWhere,
} from "@/lib/task-visibility";

// GET /api/tasks/summary — per-task-type daily aggregates for the category grid
// on /tasks: how many tasks of each type the viewer is eligible for, how many
// they've completed TODAY (local day), and the total XP earnable.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const [ctx, day] = await Promise.all([
      getTaskViewerContext(userId),
      getUserDayContext(userId),
    ]);
    if (!ctx) return NextResponse.json({ summary: {} });

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
    const [grouped, boardAgg, quizzes, offerwalls, doneToday] = await Promise.all([
      prisma.task.groupBy({
        by: ["type"],
        where: eligible,
        _count: { _all: true },
        _sum: { xpReward: true },
      }) as unknown as Promise<
        {
          type: string;
          _count: { _all: number };
          _sum: { xpReward: number | null };
        }[]
      >,
      prisma.task.aggregate({
        where: {
          ...eligible,
          OR: [{ isBoardOnly: true }, { boardId: { not: null } }],
        },
        _count: { _all: true },
        _sum: { xpReward: true },
      }) as unknown as Promise<{
        _count: { _all: number };
        _sum: { xpReward: number | null };
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
      prisma.offerwallConfig.count({ where: { isActive: true } }).catch(() => 0),
      prisma.taskSubmission.findMany({
        where: {
          userId,
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
          createdAt: { gte: day.startOfDayUtc },
        },
        select: {
          task: { select: { type: true, isBoardOnly: true, boardId: true } },
        },
      }) as unknown as Promise<
        {
          task: {
            type: string;
            isBoardOnly: boolean;
            boardId: string | null;
          } | null;
        }[]
      >,
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

    const summary: Record<
      string,
      { available: number; completedToday: number; earnableXp: number }
    > = {};
    for (const g of grouped) {
      summary[g.type] = {
        available: g._count._all,
        completedToday: completedByType.get(g.type) ?? 0,
        earnableXp: g._sum.xpReward ?? 0,
      };
    }

    const board = {
      available: boardAgg._count._all,
      completedToday: boardCompletedToday,
      earnableXp: boardAgg._sum.xpReward ?? 0,
    };

    // Admin per-category visibility toggles (missing key ⇒ shown).
    const visibility = await getSetting<Record<string, boolean>>(
      "tasks.category_visibility",
      {}
    );

    return NextResponse.json({ summary, board, quizzes, offerwalls, visibility });
  } catch (error) {
    console.error("tasks summary failed:", error);
    return NextResponse.json({ summary: {} });
  }
}
