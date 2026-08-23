import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getTaskViewerContext,
  visibleTaskWhere,
  visibleBoardWhere,
} from "@/lib/task-visibility";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The per-board task count must reflect only what this user can actually do —
  // same visibility rules as every other task surface (this route previously
  // applied audience targeting alone, ignoring level, plan, expiry and hidden).
  const ctx = await getTaskViewerContext(session.user.id);
  const visibleWhere = ctx
    ? visibleTaskWhere(ctx.viewer, {
        accessLevel: ctx.accessLevel,
        allowedTypes: ctx.allowedTypes,
        // the board list needs its own tasks
        includeBoardTasks: true,
      })
    : { id: "__none__" };

  // Boards the viewer is actually eligible for. This used to be `isActive` alone
  // — every user saw every board regardless of level, plan or targeting.
  const boards = ctx
    ? await prisma.taskBoard.findMany({
        where: visibleBoardWhere(ctx.viewer, { accessLevel: ctx.accessLevel }),
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      })
    : [];

  const boardIds = boards.map((b) => b.id);
  const unlockIds = Array.from(
    new Set(boards.map((b) => b.unlockBoardId).filter(Boolean) as string[])
  );

  const [taskGroups, participantGroups, userClaims, unlockBoards] =
    await Promise.all([
      // Grouped, not one count per board (this was 2N round-trips for N boards).
      prisma.task.groupBy({
        by: ["boardId"],
        where: { ...visibleWhere, boardId: { in: boardIds } },
        _count: { _all: true },
      }) as unknown as Promise<
        { boardId: string | null; _count: { _all: number } }[]
      >,
      prisma.boardClaim.groupBy({
        by: ["boardId"],
        where: { boardId: { in: boardIds } },
        _count: { _all: true },
      }) as unknown as Promise<
        { boardId: string; _count: { _all: number } }[]
      >,
      prisma.boardClaim.findMany({
        where: { userId: session.user.id, boardId: { in: boardIds } },
        select: { boardId: true },
      }),
      unlockIds.length
        ? prisma.taskBoard.findMany({
            where: { id: { in: unlockIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

  const claimedSet = new Set(userClaims.map((c) => c.boardId));
  const unlockById = new Map(unlockBoards.map((b) => [b.id, b]));
  const taskCountByBoard = new Map<string, number>();
  for (const g of taskGroups) {
    if (g.boardId) taskCountByBoard.set(g.boardId, g._count._all);
  }
  const participantByBoard = new Map<string, number>();
  for (const g of participantGroups) {
    participantByBoard.set(g.boardId, g._count._all);
  }

  return NextResponse.json({
    boards: boards.map((b) => {
      const lockedBy =
        b.unlockBoardId && !claimedSet.has(b.unlockBoardId)
          ? unlockById.get(b.unlockBoardId) ?? null
          : null;
      return {
        id: b.id,
        name: b.title,
        description: b.description,
        iconEmoji: b.iconEmoji,
        thumbnailUrl: b.imageUrl,
        category: b.category,
        taskCount: taskCountByBoard.get(b.id) ?? 0,
        totalRewardPts: b.pointsReward,
        xpReward: b.xpReward,
        participants: participantByBoard.get(b.id) ?? 0,
        expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
        claimed: claimedSet.has(b.id),
        lockedBy,
      };
    }),
  });
}
