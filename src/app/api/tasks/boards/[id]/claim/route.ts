import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import {
  SubmissionStatus,
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { recordUserAction } from "@/lib/goal-progress";
import {
  getTaskViewerContext,
  visibleTaskWhere,
  visibleBoardWhere,
} from "@/lib/task-visibility";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A banned or suspended account must not be able to claim a board. `User.status`
  // is otherwise only ever read at login, and the JWT lives 30 days with no
  // status claim, so a ban had no effect until the session expired.
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json(
      { error: active.message },
      { status: active.httpStatus }
    );
  }
  const userId = session.user.id;
  const { id } = await params;

  // This route pays out, so eligibility is re-checked here rather than trusted
  // from the list — a list filter is not a security boundary.
  const ctx = await getTaskViewerContext(userId);
  const board = ctx
    ? await prisma.taskBoard.findFirst({
        where: {
          id,
          ...visibleBoardWhere(ctx.viewer, { accessLevel: ctx.accessLevel }),
        },
      })
    : null;
  if (!board) {
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
  const tasks = ctx
    ? await prisma.task.findMany({
        where: {
          ...visibleTaskWhere(ctx.viewer, {
            accessLevel: ctx.accessLevel,
            allowedTypes: ctx.allowedTypes,
            // the claim counts the board's tasks
            includeBoardTasks: true,
          }),
          boardId: board.id,
        },
        select: { id: true },
      })
    : [];
  if (tasks.length === 0) {
    return NextResponse.json({ error: "Board has no active tasks" }, { status: 400 });
  }

  // DISTINCT tasks, not submission rows.
  //
  // `count` counted rows, and board tasks are ordinary tasks with a per-day
  // `dailyLimit` — so completing task A on Monday, Tuesday and Wednesday
  // produced three approved rows and satisfied a three-task board without the
  // user ever opening B or C. With `dailyLimit > 1` it worked within one day.
  const completedTasks = await prisma.taskSubmission.findMany({
    where: {
      userId,
      taskId: { in: tasks.map((t) => t.id) },
      status: { in: [SubmissionStatus.APPROVED, SubmissionStatus.AUTO_APPROVED] },
    },
    select: { taskId: true },
    distinct: ["taskId"],
  });
  const completedCount = completedTasks.length;

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

  // Event / quest progress for the board — ONE credit, however many tasks it
  // held. The tasks inside a board deliberately record nothing of their own
  // (see the guard in `/api/admin/submissions/[id]`), so this is the only place
  // a board can count, and `BoardClaim`'s unique (userId, boardId) means it can
  // only happen once. Outside the writes above and awaited, by the contract in
  // lib/goal-progress.ts: the reward is already committed, and progress must
  // never be able to fail a payout.
  await recordUserAction({
    userId,
    action: "board_claim",
    targetId: board.id,
  });

  return NextResponse.json({
    success: true,
    points,
    xp,
    transactionId: tx.id,
    claimId: claim.id,
  });
}
