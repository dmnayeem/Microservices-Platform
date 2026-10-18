import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { runNewTasksPush } from "@/lib/new-tasks-push";
import { NotificationType } from "@/generated/prisma/client";

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

  // A rejection without a reason is one the buyer cannot act on: they paid for
  // this, and "rejected" alone tells them nothing to change. Required on the
  // server too, so it holds for any caller, not just the admin UI.
  if (action === "reject" && reason.length < 5) {
    return NextResponse.json(
      { error: "Give the buyer a reason — they see it in their Buyer Hub." },
      { status: 400 }
    );
  }

  if (action === "approve") {
    // The admin may narrow who sees a buyer's task to a plan tier as they
    // approve it. Deliberately admin-only: the buyer's create endpoint does not
    // accept `requiredAccessLevel` at all, so a buyer can neither restrict
    // their task to premium members nor widen it past what was approved.
    const rawLevel = Number(body.requiredAccessLevel);
    const requiredAccessLevel = Number.isFinite(rawLevel)
      ? Math.max(0, Math.min(100, Math.floor(rawLevel)))
      : null;

    await prisma.task.update({
      where: { id },
      data: {
        status: "ACTIVE",
        ...(requiredAccessLevel === null ? {} : { requiredAccessLevel }),
      },
    });
    if (task.fundedByUserId) {
      await notifyUser({
        userId: task.fundedByUserId,
        type: NotificationType.SYSTEM,
        title: "Task approved ✅",
        message: `Your task "${task.title}" is approved and now live.`,
        link: "/buyer",
      }).catch(() => {});
    }
    await writeAudit({
      actorId: session.user.id,
      action: "TASK_REVIEWED",
      entity: "Task",
      entityId: id,
      targetUserId: task.fundedByUserId ?? null,
      summary: `Approved "${task.title}" — now live${
        requiredAccessLevel ? ` (plans at level ${requiredAccessLevel}+)` : ""
      }`,
      meta: {
        decision: "approve",
        title: task.title,
        requiredAccessLevel,
      },
    });
    // Now live for members → "New tasks are waiting" push (throttled per
    // member, lib/new-tasks-push.ts). After the response.
    after(() => runNewTasksPush({ liveTaskIds: [id], maxMs: 20_000 }));
    return NextResponse.json({ success: true, status: "ACTIVE" });
  }

  // Reject -> there is nothing to refund, and that is the point.
  //
  // Credit is charged one completion at a time, so a task that never went live
  // has never cost its buyer anything. Under the old reserve-up-front model
  // this route had to hand back the pool AND the fee, and every other way a
  // task can end — expired, paused, archived, closed early — needed the same
  // refund or it silently kept the buyer's points. Charging on use removes the
  // whole class of bug rather than adding a fifth place to remember.
  //
  // `remainingBudget` is zeroed anyway: it is the task's outstanding PROMISE,
  // and a rejected task promises nothing.
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { status: "REJECTED", remainingBudget: 0, rejectionReason: reason },
    });
  });

  if (task.fundedByUserId) {
    await notifyUser({
      userId: task.fundedByUserId,
      type: NotificationType.SYSTEM,
      title: "Task rejected",
      message: `Your task "${task.title}" was rejected${reason ? `: ${reason}` : ""}. No credit was charged — you are only ever charged for completions.`,
      link: "/buyer",
    }).catch(() => {});
  }
  await writeAudit({
    actorId: session.user.id,
    action: "TASK_REVIEWED",
    entity: "Task",
    entityId: id,
    targetUserId: task.fundedByUserId ?? null,
    summary: `Rejected "${task.title}"${reason ? ` — ${reason}` : ""} · nothing was charged`,
    meta: { decision: "reject", reason: reason ?? null, title: task.title },
  });
  return NextResponse.json({ success: true, status: "REJECTED" });
}
