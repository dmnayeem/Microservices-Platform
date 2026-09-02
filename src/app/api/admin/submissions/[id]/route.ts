import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateLevel } from "@/lib/level";
import { writeAudit } from "@/lib/audit";
import { processReferralCommissions } from "@/lib/referral-commissions";
import { Prisma } from "@/generated/prisma/client";
import { normalizeSocialConfig } from "@/lib/social-tasks";
import { getPointsPerUsd } from "@/lib/economy";
import { bumpTrust, TRUST_APPROVE, TRUST_REJECT } from "@/lib/trust";
import { notifyUser } from "@/lib/notify";
import { recordUserAction } from "@/lib/goal-progress";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { runAchievementCheck } from "@/lib/achievements";
import { closeTaskIfFull } from "@/lib/task-slots";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "submissions.view"))) {
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


    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason, adminNote } = body;
    // Free-text feedback shown to the user (adminNote kept as a back-compat alias).
    const feedback: string | null =
      (typeof body.feedback === "string" && body.feedback.trim()) ||
      (typeof adminNote === "string" && adminNote.trim()) ||
      null;
    // Admin marking (0–100) + optional custom points award (approve) / penalty
    // deduction (reject). All optional.
    const score: number | null =
      body.score != null && Number.isFinite(Number(body.score))
        ? Math.max(0, Math.min(100, Math.round(Number(body.score))))
        : null;
    const pointsOverride: number | null =
      body.pointsOverride != null && Number.isFinite(Number(body.pointsOverride))
        ? Math.max(0, Math.round(Number(body.pointsOverride)))
        : null;
    const penaltyPoints: number =
      body.penaltyPoints != null && Number.isFinite(Number(body.penaltyPoints))
        ? Math.max(0, Math.round(Number(body.penaltyPoints)))
        : 0;
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

    // `/start` creates a PENDING row the moment a user opens a task, so PENDING
    // alone does not mean "there is something to review". Without this an admin
    // could approve — and pay for — a row whose proof, images and answers are
    // all still null, simply because it appeared in the queue.
    if (!existingSubmission.submittedAt) {
      return NextResponse.json(
        {
          error:
            "This task was opened but never submitted, so there's nothing to review yet.",
        },
        { status: 409 }
      );
    }

    if (normalized === "approved") {
      if (!(await can(session.user.id, "submissions.approve"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Tasks assigned to a Task Board don't grant individual rewards on
      // approval — the bundle pays out via /api/tasks/boards/[id]/claim.
      const isBoardTask = !!existingSubmission.task.boardId;
      const task = existingSubmission.task;

      // Apply the submitter's plan reward multiplier (matches the auto-approve
      // path in submit/route.ts, which the admin path previously ignored).
      const submitterPlan = await prisma.user.findUnique({
        where: { id: existingSubmission.userId },
        select: { package: { select: { taskRewardMultiplier: true } } },
      });
      const multiplier =
        (
          submitterPlan as unknown as {
            package: { taskRewardMultiplier: number } | null;
          }
        )?.package?.taskRewardMultiplier ?? 1;
      const basePoints =
        pointsOverride ?? Math.round(task.pointsReward * multiplier);
      const baseXp = Math.round(task.xpReward * multiplier);

      // Default: whole-submission approval → full reward (override / multiplied).
      let earnedPoints = isBoardTask ? 0 : basePoints;
      let earnedXp = isBoardTask ? 0 : baseXp;
      let referralPoints = basePoints;
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
      // credits nothing. `Transaction @@unique([userId, reference])` is the
      // second line of defence; see `ledgerReference` below.
      //
      // The reference format is deliberately IDENTICAL to the auto-approve path
      // (`api/tasks/[id]/submit/route.ts`). It used to be the bare submission id
      // here, which meant a submission that was auto-approved, sent back for
      // revision, resubmitted and then approved manually wrote two rows under
      // two different keys — the constraint never fired and the user was paid
      // TWICE for one submission.
      const ledgerReference = `task_${existingSubmission.taskId}_${existingSubmission.id}`;
      const submission = await prisma.$transaction(async (tx) => {
        const claim = await tx.taskSubmission.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: finalStatus,
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            pointsEarned: earnedPoints,
            xpEarned: earnedXp,
            ...(score != null ? { score } : {}),
            ...(feedback ? { feedback } : {}),
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
          // Has this submission already been paid? Checked BEFORE the budget
          // draw so a replay does not also drain the funder's pool.
          //
          // A pre-check rather than catching the unique violation: in Postgres a
          // constraint error aborts the enclosing transaction, so catching it
          // here and carrying on is not possible — it would roll back the status
          // claim above and strand the submission PENDING forever. The unique
          // index still backstops a genuine concurrent race, where rolling back
          // is the correct (non-paying) outcome.
          const alreadyPaid = await tx.transaction.findFirst({
            where: {
              userId: existingSubmission.userId,
              reference: ledgerReference,
            },
            select: { id: true },
          });

          // Funded (user-created) task: draw from the budget pool FIRST (CAS).
          // Only credit the worker with what the pool actually covers — never
          // mint unfunded points. Unfunded (admin) tasks always credit.
          let credit = !alreadyPaid;
          if (credit && task.fundedByUserId) {
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
            const credited = await tx.user.update({
              where: { id: existingSubmission.userId },
              data: {
                pointsBalance: { increment: earnedPoints },
                xp: { increment: earnedXp },
                totalEarnings: { increment: earnedPoints / pointsPerUsd },
              },
              select: { xp: true, level: true },
            });
            // Recompute the level. This path never did, so a user whose XP came
            // only from manually-reviewed tasks accumulated XP and never levelled
            // up — until some other earning path happened to fire and jumped them
            // several levels at once. `minLevel` gates task visibility, so it
            // quietly locked them out of content they had already earned.
            // `credited.xp` is the post-increment value; do NOT add earnedXp again.
            const newLevel = calculateLevel(credited.xp);
            if (newLevel > credited.level) {
              await tx.user.update({
                where: { id: existingSubmission.userId },
                data: { level: newLevel },
              });
            }
            await tx.transaction.create({
              data: {
                userId: existingSubmission.userId,
                type: "EARNING",
                status: "COMPLETED",
                points: earnedPoints,
                amount: earnedPoints / pointsPerUsd,
                description: `Completed task: ${task.title}`,
                reference: ledgerReference,
                metadata: {
                  taskId: task.id,
                  taskType: task.type,
                  submissionId: existingSubmission.id,
                  reviewedBy: session.user.id,
                },
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
        // The slot counter just went up — if that filled the task's global
        // `totalLimit`, retire it. Nothing used to do this, so a full task
        // stayed ACTIVE in every list and every user who opened it got as far
        // as "start" before being told it was full.
        await closeTaskIfFull(existingSubmission.taskId);
        await bumpTrust(existingSubmission.userId, TRUST_APPROVE);
        // Achievements are counted here, after the payment has committed.
        // `runAchievementCheck` swallows its own failures — an achievement
        // must never be able to fail a task approval.
        await runAchievementCheck(existingSubmission.userId);
        // Event progress is credited at APPROVAL, not at submission time. The
        // old read-time computation filtered on `createdAt`, so a task
        // submitted before an event but approved during it never counted, and
        // one submitted during the window counted even if it was approved after
        // the event ended.
        //
        // A task inside a Task Board credits NOTHING here — the board is one
        // piece of work, and `/api/tasks/boards/[id]/claim` emits a single
        // `board_claim` when it is finished. Without this guard a five-task
        // board ticked a "complete 3 tasks" goal on its own, and then the claim
        // would have counted again on top. The auto-approve path in
        // `/api/tasks/[id]/submit` already skips board tasks (its whole reward
        // block is behind `!isBoardTask`); this was the one path that did not.
        if (!isBoardTask) {
          await recordUserAction({
            userId: existingSubmission.userId,
            action:
              existingSubmission.task?.type === "QUIZ"
                ? "quiz_approved"
                : "task_approved",
            targetId: existingSubmission.id,
          });
        }
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
          existingSubmission.taskId,
          existingSubmission.id
        );
      }

      // Audit log
      await writeAudit({
        actorId: session.user.id,
        action: "SUBMISSION_APPROVED",
        entity: "TaskSubmission",
        entityId: id,
        targetUserId: existingSubmission.userId,
        summary: `Approved a task submission (+${earnedPoints} pts)`,
        meta: {
          taskId: existingSubmission.taskId,
          feedback: feedback ?? null,
          score: score ?? null,
          pointsAwarded: earnedPoints,
          finalStatus,
        },
      });

      // Notify the user (in-app + push + email), deep-linked to the task. The
      // manual-approve path previously sent nothing.
      if (finalStatus === "APPROVED") {
        await notifyUser({
          userId: existingSubmission.userId,
          type: "TASK",
          title: "Task approved 🎉",
          message:
            `Your submission for "${task.title}" was approved` +
            (earnedPoints > 0 ? ` — ${earnedPoints} pts credited.` : ".") +
            (score != null ? ` Marks: ${score}/100.` : "") +
            (feedback ? `\n\n${feedback}` : ""),
          link: `/tasks/${existingSubmission.taskId}`,
        }).catch(() => {});
      } else {
        await notifyUser({
          userId: existingSubmission.userId,
          type: "TASK",
          title: "Submission reviewed",
          message: `Your submission for "${task.title}" was not accepted.${
            feedback ? `\n\n${feedback}` : ""
          }`,
          link: `/tasks/${existingSubmission.taskId}`,
        }).catch(() => {});
      }

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
      if (!(await can(session.user.id, "submissions.reject"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Claim the review before doing anything else. Without this, the reject
      // path was guarded only by the status read at the top of the handler, so
      // two concurrent rejects both applied the penalty — and rejecting an
      // already-APPROVED submission ran the penalty against a reference the
      // approval had already used (see below), which P2002'd: no penalty
      // applied, the awarded points never clawed back, and a 500 to the admin.
      const claimed = await prisma.taskSubmission.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (claimed.count === 0) {
        return NextResponse.json(
          {
            error:
              "This submission was already reviewed by someone else. Reload to see its current status.",
          },
          { status: 409 }
        );
      }

      // Optional penalty: deduct points from the user's balance (clamped so it
      // can't go negative) + record a PENALTY transaction.
      let appliedPenalty = 0;
      if (penaltyPoints > 0) {
        appliedPenalty = await prisma.$transaction(async (tx) => {
          const u = await tx.user.findUnique({
            where: { id: existingSubmission.userId },
            select: { pointsBalance: true },
          });
          const applied = Math.min(penaltyPoints, u?.pointsBalance ?? 0);
          if (applied > 0) {
            await tx.user.update({
              where: { id: existingSubmission.userId },
              data: { pointsBalance: { decrement: applied } },
            });
            await tx.transaction.create({
              data: {
                userId: existingSubmission.userId,
                type: "PENALTY",
                status: "COMPLETED",
                points: -applied,
                amount: 0,
                description: `Penalty: rejected task "${existingSubmission.task.title}"`,
                // Prefixed. This used to be the bare submission id — the SAME
                // reference the approval's EARNING row writes — so an earning
                // and a penalty for one submission collided on
                // @@unique([userId, reference]).
                reference: `task_penalty_${existingSubmission.id}`,
              },
            });
          }
          return applied;
        });
      }

      const submission = await prisma.taskSubmission.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || "Submission rejected by admin",
          ...(feedback ? { feedback } : {}),
          ...(score != null ? { score } : {}),
          ...(appliedPenalty > 0 ? { penaltyPoints: appliedPenalty } : {}),
        },
      });

      // Reputation: a rejection lowers trust + counts a fraud strike.
      await bumpTrust(existingSubmission.userId, TRUST_REJECT, { strike: true });

      // Notify user (in-app + push + email), deep-linked to the task.
      await notifyUser({
        userId: existingSubmission.userId,
        type: "TASK",
        title: "Submission rejected",
        message:
          `Your submission for "${existingSubmission.task.title}" was rejected. Reason: ${
            rejectionReason || "Not specified"
          }` +
          (appliedPenalty > 0 ? `\nPenalty: −${appliedPenalty} pts.` : "") +
          (feedback ? `\n\n${feedback}` : ""),
        link: `/tasks/${existingSubmission.taskId}`,
      }).catch(() => {});

      // Audit log
      await writeAudit({
        actorId: session.user.id,
        action: "SUBMISSION_REJECTED",
        entity: "TaskSubmission",
        entityId: id,
        targetUserId: existingSubmission.userId,
        summary: `Rejected a task submission${appliedPenalty > 0 ? ` (−${appliedPenalty} pts penalty)` : ""}`,
        meta: {
          taskId: existingSubmission.taskId,
          rejectionReason: rejectionReason ?? null,
          feedback: feedback ?? null,
          penaltyPoints: appliedPenalty,
        },
      });

      return NextResponse.json({
        success: true,
        submission,
        message: "Submission rejected",
      });
    } else {
      // revision_requested
      if (!(await can(session.user.id, "submissions.reject"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // CAS on the status. This used to update on `where: { id }` alone, so an
      // admin could send an ALREADY-PAID submission back for revision; the user
      // resubmitted, `api/tasks/[id]/start` reopened the same row to PENDING,
      // and it could be approved — and paid — a second time. Revision only makes
      // sense on work that has not been settled, so only unsettled states match.
      const revised = await prisma.taskSubmission.updateMany({
        where: { id, status: { in: ["PENDING", "REVISION_REQUESTED"] } },
        data: {
          status: "REVISION_REQUESTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || "Revision requested",
          feedback: feedback || "Please redo this task.",
        },
      });
      if (revised.count === 0) {
        return NextResponse.json(
          {
            error:
              "This submission has already been reviewed and cannot be sent back for revision. Reject it instead if the work needs to be reversed.",
          },
          { status: 409 }
        );
      }
      const submission = await prisma.taskSubmission.findUnique({
        where: { id },
      });

      // Notify user (deep-linked so they can jump straight into the redo).
      await notifyUser({
        userId: existingSubmission.userId,
        type: "TASK",
        title: "Please redo this task",
        message: `Your submission for "${existingSubmission.task.title}" needs changes.${
          feedback ? `\n\n${feedback}` : ""
        }`,
        link: `/tasks/${existingSubmission.taskId}`,
      }).catch(() => {});

      // Audit log
      await writeAudit({
        actorId: session.user.id,
        action: "SUBMISSION_REVISION_REQUESTED",
        entity: "TaskSubmission",
        entityId: id,
        targetUserId: existingSubmission.userId,
        summary: "Requested a task revision",
        meta: { taskId: existingSubmission.taskId, feedback: feedback ?? null },
      });

      return NextResponse.json({
        success: true,
        submission,
        message: "Revision requested",
      });
    }
  } catch (error) {
    // A genuine concurrent race on the same submission trips
    // `Transaction @@unique([userId, reference])`. The transaction rolls back,
    // which is the correct outcome — nobody is paid twice — but it is a
    // conflict, not a server fault, so say so rather than returning a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json(
        { error: "This submission has already been paid." },
        { status: 409 }
      );
    }
    console.error("Error updating submission:", error);
    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 }
    );
  }
}
