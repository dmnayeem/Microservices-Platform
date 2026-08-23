import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

// POST /api/admin/tasks/[id]/duplicate - Duplicate a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Find the original task
    const originalTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!originalTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Copy everything except identity, dates and counters.
    //
    // This used to enumerate a hand-picked subset and carried `countries` as the
    // ONLY targeting dimension. Three things went wrong as a result:
    //
    //  1. Targeting leak. Duplicating a "females, 18-25, Dhaka district" task
    //     produced a copy targeted on country alone — and `taskAudienceWhere()`
    //     treats an empty array as "no constraint", so the copy was served to
    //     everyone the moment it was resumed.
    //  2. Reward semantics flipped. `boardId` was dropped, so a duplicated board
    //     task stopped deferring to the board bundle and started paying
    //     individually.
    //  3. Broken tasks. Every type config (`socialConfig`, `videoConfig`,
    //     `surveyConfig`, `customConfig`, `appInstallConfig`, `articleConfig`)
    //     was dropped while `autoApprove` was copied — so a duplicated SOCIAL
    //     task auto-approved with its proof enforcement silently gone, and a
    //     duplicated SURVEY 400'd on every submit.
    //
    // Destructuring the original means a column added to the model in future is
    // copied by default. That is the safer direction for a duplicate: a missing
    // field is visible, a silently-dropped rule is not.
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      completedCount: _completedCount,
      title: _title,
      status: _status,
      startsAt: _startsAt,
      expiresAt: _expiresAt,
      // Funding must NOT carry over. A user-funded task draws its reward pool
      // from the creator's wallet; copying `fundedByUserId` with a live
      // `remainingBudget` would hand the copy a pool nobody paid for. A
      // duplicate is an admin task with no funder until one is set.
      fundedByUserId: _fundedByUserId,
      budgetPoints: _budgetPoints,
      remainingBudget: _remainingBudget,
      // The review trail belongs to the original submission, not the copy.
      rejectionReason: _rejectionReason,
      ...carryOver
    } = originalTask;

    const duplicatedTask = await prisma.task.create({
      data: {
        ...(carryOver as unknown as Prisma.TaskUncheckedCreateInput),
        title: `${originalTask.title} (Copy)`,
        status: "PAUSED", // Start paused so an admin reviews before activating
        startsAt: null, // Reset the schedule — the copy is a fresh campaign
        expiresAt: null,
        completedCount: 0,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({
      message: "Task duplicated successfully",
      task: duplicatedTask,
    });
  } catch (error) {
    console.error("Error duplicating task:", error);
    return NextResponse.json(
      { error: "Failed to duplicate task" },
      { status: 500 }
    );
  }
}
