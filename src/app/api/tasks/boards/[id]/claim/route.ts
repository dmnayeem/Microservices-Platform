import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SubmissionStatus,
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import {
  getTaskViewerContext,
  visibleTaskWhere,
} from "@/lib/task-visibility";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const board = await prisma.taskBoard.findUnique({ where: { id } });
  if (!board || !board.isActive) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  if (board.expiresAt && board.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This board has expired. Reward can no longer be claimed." },
      { status: 400 }
    );
  }

  // Enforce prerequisite chain — user must have claimed the unlocking board
  // (either via the new BoardClaim row or the legacy Transaction.reference).
  if (board.unlockBoardId) {
    const [prereqClaim, legacyPrereq, prereqBoard] = await Promise.all([
      prisma.boardClaim.findUnique({
        where: {
          userId_boardId: { userId, boardId: board.unlockBoardId },
        },
        select: { id: true },
      }),
      prisma.transaction.findFirst({
        where: {
          userId,
          reference: `board_claim_${board.unlockBoardId}`,
        },
        select: { id: true },
      }),
      prisma.taskBoard.findUnique({
        where: { id: board.unlockBoardId },
        select: { title: true },
      }),
    ]);
    if (!prereqClaim && !legacyPrereq) {
      return NextResponse.json(
        {
          error: `Locked. Claim "${prereqBoard?.title ?? "the prerequisite board"}" first.`,
        },
        { status: 400 }
      );
    }
  }

  const reference = `board_claim_${board.id}`;
  // Two-source claim check: new BoardClaim table is canonical going forward,
  // but legacy Transaction.reference rows from before the BoardClaim model
  // still count to prevent re-claims.
  const [existingClaim, legacyTxn] = await Promise.all([
    prisma.boardClaim.findUnique({
      where: { userId_boardId: { userId, boardId: board.id } },
      select: { id: true },
    }),
    prisma.transaction.findFirst({
      where: { userId, reference },
      select: { id: true },
    }),
  ]);
  if (existingClaim || legacyTxn) {
    return NextResponse.json(
      { error: "Reward already claimed for this board" },
      { status: 400 }
    );
  }

  // The claim requirement must be counted over EXACTLY the tasks the board page
  // showed this user — same visibility rules, or the board is unclaimable.
  const ctx = await getTaskViewerContext(userId);
  const tasks = ctx
    ? await prisma.task.findMany({
        where: {
          ...visibleTaskWhere(ctx.viewer, {
            accessLevel: ctx.accessLevel,
            allowedTypes: ctx.allowedTypes,
          }),
          boardId: board.id,
        },
        select: { id: true },
      })
    : [];
  if (tasks.length === 0) {
    return NextResponse.json({ error: "Board has no active tasks" }, { status: 400 });
  }

  const completedCount = await prisma.taskSubmission.count({
    where: {
      userId,
      taskId: { in: tasks.map((t) => t.id) },
      status: { in: [SubmissionStatus.APPROVED, SubmissionStatus.AUTO_APPROVED] },
    },
  });

  if (completedCount < tasks.length) {
    return NextResponse.json(
      {
        error: `Complete all ${tasks.length} tasks first (${completedCount} done).`,
      },
      { status: 400 }
    );
  }

  const points = board.pointsReward ?? 0;
  const xp = board.xpReward ?? 0;
  const pointsPerUsd = await getPointsPerUsd();

  const [, , tx, claim] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: points },
        xp: { increment: xp },
        totalEarnings: { increment: points / pointsPerUsd },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: NotificationType.ACHIEVEMENT,
        title: "Board Completed!",
        message: `You earned ${points} pts and ${xp} XP from "${board.title}"`,
        data: { boardId: board.id, points, xp },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.EARNING,
        status: TransactionStatus.COMPLETED,
        points,
        amount: points / pointsPerUsd,
        description: `Board reward: ${board.title}`,
        reference,
        metadata: { boardId: board.id, xp },
      },
    }),
    // BoardClaim row enforces single claim via the (userId, boardId) unique
    // constraint and gives admin a queryable per-user audit trail.
    prisma.boardClaim.create({
      data: {
        userId,
        boardId: board.id,
        pointsEarned: points,
        xpEarned: xp,
        taskCount: completedCount,
      },
    }),
  ]);

  // Backfill the transactionId on the BoardClaim now that we have it
  if (tx.id) {
    await prisma.boardClaim.update({
      where: { id: claim.id },
      data: { transactionId: tx.id },
    });
  }

  return NextResponse.json({
    success: true,
    points,
    xp,
    transactionId: tx.id,
    claimId: claim.id,
  });
}
