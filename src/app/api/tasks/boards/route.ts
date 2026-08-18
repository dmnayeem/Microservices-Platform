import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskAudienceWhere } from "@/lib/task-targeting";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Viewer profile for STRICT audience targeting — the per-board task count must
  // reflect only the tasks this user can actually do.
  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      country: true,
      region: true,
      division: true,
      district: true,
      subDistrict: true,
      postalCode: true,
      gender: true,
      dateOfBirth: true,
    },
  });
  const audienceAnd = taskAudienceWhere(viewer ?? {});

  const boards = await prisma.taskBoard.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  const boardIds = boards.map((b) => b.id);
  const unlockIds = Array.from(
    new Set(boards.map((b) => b.unlockBoardId).filter(Boolean) as string[])
  );

  const [taskCounts, participantCounts, userClaims, unlockBoards] =
    await Promise.all([
      Promise.all(
        boardIds.map((id) =>
          prisma.task.count({
            where: { boardId: id, status: "ACTIVE", AND: audienceAnd },
          })
        )
      ),
      Promise.all(
        boardIds.map((id) =>
          prisma.boardClaim.count({ where: { boardId: id } })
        )
      ),
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

  return NextResponse.json({
    boards: boards.map((b, i) => {
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
        taskCount: taskCounts[i] ?? 0,
        totalRewardPts: b.pointsReward,
        xpReward: b.xpReward,
        participants: participantCounts[i] ?? 0,
        expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
        claimed: claimedSet.has(b.id),
        lockedBy,
      };
    }),
  });
}
