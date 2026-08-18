import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, SubmissionStatus } from "@/generated/prisma/client";
import { taskAudienceWhere } from "@/lib/task-targeting";

// Viewer profile fields matched by task audience targeting.
const AUDIENCE_SELECT = {
  country: true,
  region: true,
  division: true,
  district: true,
  subDistrict: true,
  postalCode: true,
  gender: true,
  dateOfBirth: true,
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const board = await prisma.taskBoard.findUnique({ where: { id } });
  if (!board || !board.isActive) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  // Compute lock state: locked if a prerequisite exists and the user hasn't
  // claimed it (checking both BoardClaim and legacy Transaction.reference).
  let lockedBy: { id: string; title: string } | null = null;
  if (board.unlockBoardId) {
    const [prereqClaim, legacyPrereq, prereqBoard] = await Promise.all([
      prisma.boardClaim.findUnique({
        where: {
          userId_boardId: {
            userId: session.user.id,
            boardId: board.unlockBoardId,
          },
        },
        select: { id: true },
      }),
      prisma.transaction.findFirst({
        where: {
          userId: session.user.id,
          reference: `board_claim_${board.unlockBoardId}`,
        },
        select: { id: true },
      }),
      prisma.taskBoard.findUnique({
        where: { id: board.unlockBoardId },
        select: { id: true, title: true },
      }),
    ]);
    if (!prereqClaim && !legacyPrereq && prereqBoard) {
      lockedBy = prereqBoard;
    }
  }

  // STRICT audience targeting — only surface board tasks the viewer is eligible
  // for (same rules as the standalone task list).
  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: AUDIENCE_SELECT,
  });

  const tasks = await prisma.task.findMany({
    where: {
      boardId: id,
      status: TaskStatus.ACTIVE,
      AND: taskAudienceWhere(viewer ?? {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const taskIds = tasks.map((t) => t.id);
  const submissions = taskIds.length
    ? await prisma.taskSubmission.findMany({
        where: {
          userId: session.user.id,
          taskId: { in: taskIds },
          status: {
            in: [
              SubmissionStatus.APPROVED,
              SubmissionStatus.AUTO_APPROVED,
              SubmissionStatus.PENDING,
            ],
          },
        },
        select: { taskId: true, status: true },
      })
    : [];

  const statusByTask = new Map(submissions.map((s) => [s.taskId, s.status]));

  const enriched = tasks.map((t) => {
    const sub = statusByTask.get(t.id);
    let userStatus: "DONE" | "PENDING" | "AVAILABLE" = "AVAILABLE";
    if (sub === SubmissionStatus.APPROVED || sub === SubmissionStatus.AUTO_APPROVED) {
      userStatus = "DONE";
    } else if (sub === SubmissionStatus.PENDING) {
      userStatus = "PENDING";
    }
    return {
      id: t.id,
      title: t.title,
      type: t.type,
      pointsReward: t.pointsReward,
      xpReward: t.xpReward,
      duration: t.duration,
      thumbnailUrl: t.thumbnailUrl,
      userStatus,
    };
  });

  const doneCount = enriched.filter((t) => t.userStatus === "DONE").length;
  const allDone = enriched.length > 0 && doneCount === enriched.length;

  // BoardClaim is canonical going forward; legacy Transaction.reference rows
  // (pre-BoardClaim) still count so older claims show as already claimed.
  const [boardClaim, legacyTxn] = await Promise.all([
    prisma.boardClaim.findUnique({
      where: { userId_boardId: { userId: session.user.id, boardId: board.id } },
      select: { claimedAt: true },
    }),
    prisma.transaction.findFirst({
      where: {
        userId: session.user.id,
        reference: `board_claim_${board.id}`,
      },
      select: { createdAt: true },
    }),
  ]);
  const claimedAt =
    boardClaim?.claimedAt ?? legacyTxn?.createdAt ?? null;

  const isExpired = !!board.expiresAt && board.expiresAt.getTime() < Date.now();

  return NextResponse.json({
    board: {
      id: board.id,
      title: board.title,
      description: board.description,
      iconEmoji: board.iconEmoji,
      imageUrl: board.imageUrl,
      category: board.category,
      expiresAt: board.expiresAt ? board.expiresAt.toISOString() : null,
      pointsReward: board.pointsReward,
      xpReward: board.xpReward,
      isExpired,
      lockedBy,
    },
    tasks: enriched,
    progress: {
      done: doneCount,
      total: enriched.length,
      allDone,
    },
    claimedAt: claimedAt ? claimedAt.toISOString() : null,
  });
}
