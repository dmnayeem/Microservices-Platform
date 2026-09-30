import { requireActiveUser } from "@/lib/require-active";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { getTaskCredit } from "@/lib/task-credit";
import { writeAudit } from "@/lib/audit";

/**
 * A buyer pausing or resuming their OWN task.
 *
 * Only an admin could stop a task before this, so a buyer who noticed a typo,
 * ran a promotion they wanted to hold, or simply wanted to stop spending had to
 * ask someone. It is their task and their credit; stopping it is theirs to do.
 *
 * Ownership is in the WHERE clause, not checked afterwards — `fundedByUserId`
 * is part of every query here, so there is no request shape that touches
 * another buyer's task. This deliberately does NOT use the admin permission
 * system: a buyer is not an admin and must never be able to act on a task they
 * did not fund.
 *
 * What a buyer still cannot do is approve or reject the WORK. That stays with
 * admins and Smart Auto Verification, because a buyer who wanted to keep their
 * credit could refuse honest submissions and the worker would carry the loss.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  // A suspended account keeps its 30-day session; without this it could
  // un-pause a task the Abuse Center paused (see src/lib/require-active.ts).
  const active = await requireActiveUser(userId);
  if (!active.ok) {
    return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body?.action === "resume" ? "resume" : "pause";

  const task = await prisma.task.findFirst({
    // Ownership in the query.
    where: { id, fundedByUserId: userId },
    select: { id: true, title: true, status: true, pointsReward: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (action === "pause") {
    if (task.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only a live task can be paused." },
        { status: 400 }
      );
    }
    await prisma.task.update({
      where: { id },
      data: { status: "PAUSED" },
    });
    await writeAudit({
      actorId: userId,
      action: "TASK_PAUSED",
      entity: "Task",
      entityId: id,
      targetUserId: userId,
      summary: `Buyer paused their own task "${task.title}"`,
      meta: { by: "buyer" },
    });
    return NextResponse.json({ success: true, status: "PAUSED" });
  }

  // Resume.
  if (task.status !== "PAUSED") {
    return NextResponse.json(
      {
        error:
          "Only a paused task can be resumed. A task that finished or was rejected has to be created again.",
      },
      { status: 400 }
    );
  }

  // Same gate as publishing: a task must be able to pay at least one person
  // before it goes back in front of them. Resuming into an empty balance would
  // put it live just long enough for someone to do the work for nothing.
  const buyer = await getBuyerSettings();
  const oneCompletion =
    task.pointsReward +
    (buyer.feePercent > 0
      ? Math.ceil((task.pointsReward * buyer.feePercent) / 100)
      : 0);
  const credit = await getTaskCredit(userId);
  if (credit < oneCompletion) {
    return NextResponse.json(
      {
        error: `You need at least ${oneCompletion.toLocaleString()} credit to resume this task. You have ${credit.toLocaleString()}.`,
        shortByPoints: oneCompletion - credit,
        buyPointsHref: "/buy-points",
      },
      { status: 402 }
    );
  }

  await prisma.task.update({ where: { id }, data: { status: "ACTIVE" } });
  await writeAudit({
    actorId: userId,
    action: "TASK_RESUMED",
    entity: "Task",
    entityId: id,
    targetUserId: userId,
    summary: `Buyer resumed their own task "${task.title}"`,
    meta: { by: "buyer" },
  });
  return NextResponse.json({ success: true, status: "ACTIVE" });
}
