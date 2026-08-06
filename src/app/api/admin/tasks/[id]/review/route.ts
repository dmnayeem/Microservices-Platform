import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { getPointsPerUsd } from "@/lib/economy";
import { TransactionType, TransactionStatus, NotificationType } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/tasks/[id]/review — approve or reject a user-submitted
// (PENDING_REVIEW) task. Rejecting refunds the creator's remaining budget.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "tasks.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : "approve";
  const reason = String(body.reason ?? "").trim().slice(0, 500);

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      fundedByUserId: true,
      remainingBudget: true,
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "This task is not awaiting review." },
      { status: 400 }
    );
  }

  if (action === "approve") {
    await prisma.task.update({ where: { id }, data: { status: "ACTIVE" } });
    if (task.fundedByUserId) {
      await notifyUser({
        userId: task.fundedByUserId,
        type: NotificationType.SYSTEM,
        title: "Task approved ✅",
        message: `Your task "${task.title}" is approved and now live.`,
        link: "/create-task",
      }).catch(() => {});
    }
    return NextResponse.json({ success: true, status: "ACTIVE" });
  }

  // Reject → refund the remaining budget to the creator's wallet.
  const pointsPerUsd = await getPointsPerUsd();
  const refundUsd =
    task.fundedByUserId && task.remainingBudget > 0
      ? task.remainingBudget / pointsPerUsd
      : 0;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { status: "REJECTED", remainingBudget: 0, rejectionReason: reason || "Not approved." },
    });
    if (task.fundedByUserId && refundUsd > 0) {
      await tx.user.update({
        where: { id: task.fundedByUserId },
        data: { cashBalance: { increment: refundUsd } },
      });
      await tx.transaction.create({
        data: {
          userId: task.fundedByUserId,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          amount: refundUsd,
          points: 0,
          description: `Task budget refund — "${task.title}"`,
          reference: `task_refund_${task.id}`,
          metadata: { taskId: task.id, kind: "task_refund" },
        },
      });
    }
  });

  if (task.fundedByUserId) {
    await notifyUser({
      userId: task.fundedByUserId,
      type: NotificationType.SYSTEM,
      title: "Task rejected",
      message: `Your task "${task.title}" was rejected${reason ? `: ${reason}` : ""}. Your budget was refunded.`,
      link: "/create-task",
    }).catch(() => {});
  }
  return NextResponse.json({ success: true, status: "REJECTED", refundUsd });
}
