import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { processReferralCommissions } from "@/lib/referral-commissions";
import { Prisma } from "@/generated/prisma/client";
import { normalizeSocialConfig } from "@/lib/social-tasks";
import { getPointsPerUsd } from "@/lib/economy";
import { bumpTrust, TRUST_APPROVE, TRUST_REJECT } from "@/lib/trust";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "submissions.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const submission = await prisma.taskSubmission.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            level: true,
            package: { select: { slug: true, name: true } },
          },
        },
        task: true,
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return NextResponse.json(
      { error: "Failed to fetch submission" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;

    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason, adminNote } = body;
    // SOCIAL bundles may send per-action decisions: { "0":"approved","2":"rejected" }
    const itemDecisions = body.itemDecisions as
      | Record<string, "approved" | "rejected">
      | undefined;
    // Normalize legacy/new action names
    const normalized: "approved" | "rejected" | "revision_requested" | null =
      action === "approve" || action === "approved"
        ? "approved"
        : action === "reject" || action === "rejected"
        ? "rejected"
        : action === "revision_requested" || action === "request_revision"
        ? "revision_requested"
        : null;
    if (!normalized) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Check if submission exists
    const existingSubmission = await prisma.taskSubmission.findUnique({
      where: { id },
      include: {
        task: true,
        user: true,
      },
    });

    if (!existingSubmission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (existingSubmission.status !== "PENDING") {
      return NextResponse.json(
        { error: "Submission has already been reviewed" },
        { status: 400 }
      );
    }

    if (normalized === "approved") {
      if (!hasPermission(adminRole, "submissions.approve")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Tasks assigned to a Task Board don't grant individual rewards on
      // approval — the bundle pays out via /api/tasks/boards/[id]/claim.
      const isBoardTask = !!existingSubmission.task.boardId;
      const task = existingSubmission.task;

      // Default: whole-submission approval → full reward.
      let earnedPoints = isBoardTask ? 0 : task.pointsReward;
      let earnedXp = isBoardTask ? 0 : task.xpReward;
      let referralPoints = task.pointsReward;
      let finalStatus: "APPROVED" | "REJECTED" = "APPROVED";
      let metadataUpdate: Prisma.InputJsonValue | undefined;

      // SOCIAL per-action approval → award only the approved items' points.
      if (
        task.type === "SOCIAL" &&
        itemDecisions &&
        Object.keys(itemDecisions).length > 0
      ) {
        const norm = normalizeSocialConfig(task.socialConfig);
        const total = norm.items.length || 1;
        let approvedCount = 0;
        let approvedPoints = 0;
        let sumPoints = 0;
        norm.items.forEach((it, i) => {
          sumPoints += it.points || 0;
          if (itemDecisions[String(i)] !== "rejected") {
            approvedCount++;
            approvedPoints += it.points || 0;
          }
        });
        // If item points weren't set, split the task total proportionally.
        if (sumPoints <= 0) {
          approvedPoints = Math.round((task.pointsReward * approvedCount) / total);
        }
        earnedPoints = isBoardTask ? 0 : approvedPoints;
        earnedXp = isBoardTask
          ? 0
          : Math.round((task.xpReward * approvedCount) / total);
        referralPoints = approvedPoints;
        finalStatus = approvedCount > 0 ? "APPROVED" : "REJECTED";

        // Persist per-item review status alongside the existing proof metadata.
        const meta =
          (existingSubmission.metadata as Record<string, unknown> | null) ?? {};
        const metaItems = Array.isArray(meta.items)
          ? (meta.items as Array<Record<string, unknown>>)
          : [];
        const mergedItems = norm.items.map((it, i) => ({
          ...(metaItems[i] ?? { action: it.action }),
          reviewStatus:
            itemDecisions[String(i)] === "rejected" ? "rejected" : "approved",
        }));
        metadataUpdate = JSON.parse(
          JSON.stringify({ ...meta, items: mergedItems })
        );
      }

      const awardsPoints = !isBoardTask && earnedPoints > 0;
      const pointsPerUsd = await getPointsPerUsd();

      // Approve the submission. For non-board tasks award points/XP and write
      // a transaction; for board tasks just mark APPROVED and bump the
      // task's completedCount counter.
      // Atomically claim the review inside one transaction. The updateMany CAS
      // (only matches while still PENDING) means two concurrent approvals /
      // a double-click can't both mint points — the loser matches 0 rows and
      // credits nothing (there is no unique backstop on Transaction.reference).
      const submission = await prisma.$transaction(async (tx) => {
        const claim = await tx.taskSubmission.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: finalStatus,
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            pointsEarned: earnedPoints,
            xpEarned: earnedXp,
            ...(metadataUpdate ? { metadata: metadataUpdate } : {}),
          },
        });
        if (claim.count === 0) return null; // lost the race — already reviewed

        if (finalStatus === "APPROVED") {
          await tx.task.update({
            where: { id: existingSubmission.taskId },
            data: { completedCount: { increment: 1 } },
          });
        }
        if (awardsPoints) {
          // Funded (user-created) task: draw from the budget pool FIRST (CAS).
          // Only credit the worker with what the pool actually covers — never
          // mint unfunded points. Unfunded (admin) tasks always credit.
          let credit = true;
          if (task.fundedByUserId) {
            const drawn = await tx.task.updateMany({
              where: { id: task.id, remainingBudget: { gte: earnedPoints } },
              data: { remainingBudget: { decrement: earnedPoints } },
            });
            if (drawn.count === 0) {
              credit = false;
              await tx.task.update({
                where: { id: task.id },
                data: { remainingBudget: 0, status: "COMPLETED" },
              });
            } else if (task.remainingBudget - earnedPoints < task.pointsReward) {
              await tx.task.update({
                where: { id: task.id },
                data: { status: "COMPLETED" },
              });
            }
          }
          if (credit) {
            await tx.user.update({
              where: { id: existingSubmission.userId },
              data: {
                pointsBalance: { increment: earnedPoints },
                xp: { increment: earnedXp },
                totalEarnings: { increment: earnedPoints / pointsPerUsd },
              },
            });
            await tx.transaction.create({
              data: {
                userId: existingSubmission.userId,
                type: "EARNING",
                status: "COMPLETED",
                points: earnedPoints,
                amount: earnedPoints / pointsPerUsd,
                description: `Earned from task: ${task.title}`,
                reference: existingSubmission.id,
              },
            });
          }
        }
        return tx.taskSubmission.findUnique({ where: { id } });
      });

      if (!submission) {
        return NextResponse.json(
          { error: "Submission has already been reviewed" },
          { status: 400 }
        );
      }

      // Reputation: approving nudges trust up; an all-rejected social bundle
      // (finalStatus flipped to REJECTED) counts as a fraud strike instead.
      if (finalStatus === "APPROVED") {
        await bumpTrust(existingSubmission.userId, TRUST_APPROVE);
      } else {
        await bumpTrust(existingSubmission.userId, TRUST_REJECT, {
          strike: true,
        });
      }

      // Process referral commissions (after transaction completes) — skip
      // for board tasks and when no points were minted.
      if (awardsPoints && referralPoints > 0) {
        await processReferralCommissions(
          existingSubmission.userId,
          referralPoints,
          existingSubmission.taskId
        );
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SUBMISSION_APPROVED",
          entity: "TaskSubmission",
          entityId: id,
          newData: {
            adminNote: adminNote ?? null,
            pointsAwarded: earnedPoints,
            finalStatus,
          },
        },
      });

      return NextResponse.json({
        success: true,
        submission,
        pointsAwarded: earnedPoints,
        message:
          finalStatus === "APPROVED"
            ? `Approved — ${earnedPoints} pts awarded`
            : "All actions rejected — no points awarded",
      });
    } else if (normalized === "rejected") {
      if (!hasPermission(adminRole, "submissions.reject")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const submission = await prisma.taskSubmission.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || "Submission rejected by admin",
        },
      });

      // Reputation: a rejection lowers trust + counts a fraud strike.
      await bumpTrust(existingSubmission.userId, TRUST_REJECT, { strike: true });

      // Notify user
      await prisma.notification.create({
        data: {
          userId: existingSubmission.userId,
          type: "TASK",
          title: "Submission rejected",
          message: `Your submission for "${existingSubmission.task.title}" was rejected. Reason: ${
            rejectionReason || "Not specified"
          }${adminNote ? `\n\n${adminNote}` : ""}`,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SUBMISSION_REJECTED",
          entity: "TaskSubmission",
          entityId: id,
          newData: {
            rejectionReason: rejectionReason ?? null,
            adminNote: adminNote ?? null,
          },
        },
      });

      return NextResponse.json({
        success: true,
        submission,
        message: "Submission rejected",
      });
    } else {
      // revision_requested
      if (!hasPermission(adminRole, "submissions.reject")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const submission = await prisma.taskSubmission.update({
        where: { id },
        data: {
          status: "REVISION_REQUESTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: adminNote || "Revision requested",
        },
      });

      // Notify user
      await prisma.notification.create({
        data: {
          userId: existingSubmission.userId,
          type: "TASK",
          title: "Revision requested",
          message: `Please revise your submission for "${existingSubmission.task.title}". ${
            adminNote ?? ""
          }`,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SUBMISSION_REVISION_REQUESTED",
          entity: "TaskSubmission",
          entityId: id,
          newData: { adminNote: adminNote ?? null },
        },
      });

      return NextResponse.json({
        success: true,
        submission,
        message: "Revision requested",
      });
    }
  } catch (error) {
    console.error("Error updating submission:", error);
    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 }
    );
  }
}
