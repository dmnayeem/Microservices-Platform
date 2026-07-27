import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  SubmissionStatus,
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma";
import { processReferralCommissions } from "@/lib/referral-commissions";
import { notifyUser } from "@/lib/notify";
import { getPointsPerUsd } from "@/lib/economy";
import {
  compareUniqueKey,
  type ArticleConfig,
} from "@/lib/article-tasks";
import type { VideoConfig } from "@/lib/video-tasks";
import {
  validateAnswers as validateSurveyAnswers,
  type SurveyConfig,
  type SurveyAnswers,
} from "@/lib/survey-tasks";
import {
  validateCustomAnswers,
  type CustomConfig,
  type CustomAnswers,
} from "@/lib/custom-tasks";
import type { AppInstallConfig } from "@/lib/app-install-tasks";

// POST /api/tasks/:id/submit - Submit task proof
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      submissionId,
      proof,
      proofImages,
      answers,
      // Actual media length (seconds) reported by the video player, so we can
      // cap the required watch time at the real video length.
      videoDuration,
      uniqueKey: submittedUniqueKey,
      // SOCIAL-only proof fields (sent by social-tasks-view.tsx)
      proofUrl,
      screenshotUrl,
      username,
      generatedContent,
      // SOCIAL bundle: per-action proof array
      // [{action, proofUrl?, screenshotUrl?, username?, generatedContent?}]
      items: socialItems,
      // CUSTOM-only proof field (admin-defined form answers)
      customAnswers,
    } = body;

    // Get the task
    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Find the pending submission
    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "No pending submission found. Please start the task first." },
        { status: 400 }
      );
    }

    // Already submitted (still PENDING = awaiting manual review). Block a second
    // submit so a reopened task can't overwrite proof or re-queue it.
    if (submission.submittedAt) {
      return NextResponse.json(
        { error: "You've already submitted this — it's awaiting review." },
        { status: 409 }
      );
    }

    // Check if the required watch time was met.
    // VIDEO tasks are gated on videoConfig.watchSeconds (what the player enforces),
    // NOT task.duration — the two can diverge (duration is often the full video
    // length), which would otherwise make a fully-watched video impossible to submit.
    let requiredSeconds =
      task.type === "VIDEO"
        ? (task.videoConfig as VideoConfig | null)?.watchSeconds ?? task.duration ?? 0
        : task.duration ?? 0;
    // If the real video is SHORTER than the configured watch target, cap the
    // requirement at the actual length — otherwise a fully-watched short video
    // can never satisfy 80% of a longer target.
    if (
      task.type === "VIDEO" &&
      typeof videoDuration === "number" &&
      videoDuration > 0 &&
      videoDuration < requiredSeconds
    ) {
      requiredSeconds = videoDuration;
    }
    // SOCIAL bundles verify each action via the locked player's watched flag,
    // not a wall-clock elapsed gate — skip the elapsed check for them even if an
    // admin left a stray task.duration on the task.
    if (requiredSeconds && task.type !== "SOCIAL") {
      const requiredDuration = Math.floor(requiredSeconds * 0.8); // 80% of required time

      // VIDEO tasks are validated against server-accrued watched seconds (the
      // /heartbeat route only credits real, foreground playback), so a client
      // can't satisfy the gate just by waiting. Other timed types fall back to
      // wall-clock elapsed since the submission was started.
      if (task.type === "VIDEO") {
        if (submission.watchedSeconds < requiredDuration) {
          return NextResponse.json(
            {
              error: `Please watch the full video. ${requiredDuration - submission.watchedSeconds} seconds of watch time remaining.`,
            },
            { status: 400 }
          );
        }
      } else {
        const elapsedSeconds = Math.floor(
          (Date.now() - submission.createdAt.getTime()) / 1000
        );
        if (elapsedSeconds < requiredDuration) {
          return NextResponse.json(
            {
              error: `Please complete the task. ${requiredDuration - elapsedSeconds} seconds remaining.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Validate quiz answers if it's a quiz task
    let score: number | null = null;
    if (task.type === "QUIZ" && answers && task.questions) {
      const questions = task.questions as Array<{
        question: string;
        options: string[];
        correctAnswer: number;
      }>;

      let correctCount = 0;
      questions.forEach((q, index) => {
        if (answers[index] === q.correctAnswer) {
          correctCount++;
        }
      });

      score = Math.round((correctCount / questions.length) * 100);
    }

    // ── Article task: check unique key + force PENDING (admin reviews) ──
    let uniqueKeyMismatch = false;
    let claimedArticleKeyId: string | null = null;
    if (task.type === "ARTICLE") {
      const cfg = task.articleConfig as ArticleConfig | null;
      if (cfg?.useKeyPool) {
        // v2 (key-pool) mode: the key MUST exist in the pool, MUST be
        // claimed by this user, and MUST not already be tied to a
        // submission. Atomically bind it to this submission.
        const submitted = String(submittedUniqueKey ?? "").trim();
        if (!submitted) {
          return NextResponse.json(
            { error: "Unique key is required" },
            { status: 400 }
          );
        }
        const keyRow = await prisma.articleTaskKey.findUnique({
          where: { taskId_keyValue: { taskId: task.id, keyValue: submitted } },
          select: {
            id: true,
            claimedByUserId: true,
            submissionId: true,
          },
        });
        if (!keyRow) {
          return NextResponse.json(
            { error: "Invalid key — not found in this task's pool" },
            { status: 400 }
          );
        }
        if (keyRow.submissionId) {
          return NextResponse.json(
            { error: "This key has already been submitted" },
            { status: 400 }
          );
        }
        if (
          keyRow.claimedByUserId &&
          keyRow.claimedByUserId !== session.user.id
        ) {
          return NextResponse.json(
            { error: "This key was claimed by another user" },
            { status: 400 }
          );
        }
        // Atomic bind: only claim if still unclaimed by anyone OR claimed
        // by us. updateMany returns 0 if a race lost — treat as conflict.
        const update = await prisma.articleTaskKey.updateMany({
          where: {
            id: keyRow.id,
            submissionId: null,
            OR: [
              { claimedByUserId: null },
              { claimedByUserId: session.user.id },
            ],
          },
          data: {
            claimedByUserId: session.user.id,
            claimedAt: keyRow.claimedByUserId ? undefined : new Date(),
            submissionId: submission.id,
          },
        });
        if (update.count === 0) {
          return NextResponse.json(
            { error: "Key was just consumed — refresh and try again" },
            { status: 409 }
          );
        }
        claimedArticleKeyId = keyRow.id;
      } else if (cfg?.proofRequirements?.uniqueKey && cfg.uniqueKey) {
        // Legacy single-key mode
        if (!compareUniqueKey(submittedUniqueKey, cfg.uniqueKey)) {
          uniqueKeyMismatch = true;
        }
      }
    }

    // ── Survey task: validate answers against the configured questions ──
    if (task.type === "SURVEY") {
      const cfg = task.surveyConfig as SurveyConfig | null;
      if (!cfg || !Array.isArray(cfg.questions) || cfg.questions.length === 0) {
        return NextResponse.json(
          { error: "Survey is misconfigured" },
          { status: 400 }
        );
      }
      const v = validateSurveyAnswers(cfg, (answers ?? {}) as SurveyAnswers);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.error ?? "Invalid answers", missing: v.missing ?? [] },
          { status: 400 }
        );
      }
    }

    // ── Custom task: validate answers against admin-defined fields ──
    if (task.type === "CUSTOM") {
      const cfg = task.customConfig as CustomConfig | null;
      if (!cfg || !Array.isArray(cfg.fields) || cfg.fields.length === 0) {
        return NextResponse.json(
          { error: "Custom task is misconfigured" },
          { status: 400 }
        );
      }
      const err = validateCustomAnswers(
        cfg,
        (customAnswers ?? {}) as CustomAnswers
      );
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }
    }

    // ── App-install task: a proof screenshot is required ──
    if (task.type === "APPINSTALL") {
      if (!Array.isArray(proofImages) || proofImages.length === 0) {
        return NextResponse.json(
          { error: "Upload a screenshot showing the app installed." },
          { status: 400 }
        );
      }
    }

    // ── Video task: hard-fail on bad unique key (auto-reject) ──
    if (task.type === "VIDEO") {
      const cfg = task.videoConfig as VideoConfig | null;
      if (cfg?.proofRequirements?.uniqueKey && cfg.uniqueKey) {
        if (!compareUniqueKey(submittedUniqueKey, cfg.uniqueKey)) {
          await prisma.taskSubmission.update({
            where: { id: submission.id },
            data: {
              proof: proof || null,
              proofImages: proofImages || [],
              answers: answers || null,
              status: SubmissionStatus.REJECTED,
              reviewedAt: new Date(),
              rejectionReason: "Incorrect verification key",
            },
          });
          return NextResponse.json(
            {
              status: "rejected",
              error: "Incorrect verification key",
              message:
                "The unique key you submitted didn't match. Please rewatch and try again.",
            },
            { status: 400 }
          );
        }
      }
    }

    // Determine if task should be auto-approved.
    // ARTICLE (legacy) and SURVEY always go to PENDING for admin manual review.
    // ARTICLE (key-pool) auto-approves since the key was atomically verified
    // against the pool — no human review needed.
    // VIDEO and QUIZ may auto-approve.
    // CUSTOM auto-approves only when the admin opted into it via customConfig.autoApprove.
    const isArticleKeyPool =
      task.type === "ARTICLE" && claimedArticleKeyId !== null;
    const customAutoApprove =
      task.type === "CUSTOM" &&
      (task.customConfig as CustomConfig | null)?.autoApprove === true;
    const appInstallAutoApprove =
      task.type === "APPINSTALL" &&
      (task.appInstallConfig as AppInstallConfig | null)?.autoApprove === true;
    const shouldAutoApprove =
      !uniqueKeyMismatch &&
      task.type !== "SURVEY" &&
      (isArticleKeyPool ||
        customAutoApprove ||
        appInstallAutoApprove ||
        (task.type !== "ARTICLE" &&
          task.type !== "CUSTOM" &&
          task.type !== "APPINSTALL" &&
          (task.autoApprove || task.type === "VIDEO" || task.type === "QUIZ")));

    const newStatus = shouldAutoApprove
      ? SubmissionStatus.AUTO_APPROVED
      : SubmissionStatus.PENDING;

    // Tasks assigned to a Task Board don't grant individual rewards. The full
    // reward bundle is paid out only when the user claims the entire board.
    // Submission still flows normally so progress can be tracked; we just
    // record pointsEarned / xpEarned as 0 and skip the credit block.
    const isBoardTask = !!task.boardId;

    // For SOCIAL: map the type-specific POST body fields onto the existing
    // proof/proofImages columns and stash extras (username, AI-generated
    // content) in metadata so the admin panel can render them.
    const isSocial = task.type === "SOCIAL";
    // Bundle submissions send an `items` array (one proof set per action).
    const socialBundle: Array<Record<string, unknown>> | null =
      isSocial && Array.isArray(socialItems) ? socialItems : null;
    const submissionMetadata: Record<string, unknown> = {};
    if (isSocial) {
      if (socialBundle) {
        // Store per-action proof; mirror item[0] into the legacy keys so any
        // lagging consumer still shows something.
        submissionMetadata.items = socialBundle.map((it) => ({
          action: it.action ?? null,
          proofUrl: it.proofUrl ?? null,
          screenshotUrl: it.screenshotUrl ?? null,
          username: it.username ?? null,
          generatedContent: it.generatedContent ?? null,
          watched: it.watched ?? null,
        }));
        submissionMetadata.socialUsername = socialBundle[0]?.username ?? null;
        submissionMetadata.socialGeneratedContent =
          socialBundle[0]?.generatedContent ?? null;
      } else {
        // Legacy single-action submission (old client / in-flight task).
        submissionMetadata.socialUsername = username ?? null;
        submissionMetadata.socialGeneratedContent = generatedContent ?? null;
      }
    }
    // For ARTICLE: surface the unique-key mismatch flag so the admin sees
    // it during review (article submissions don't auto-reject on mismatch).
    if (task.type === "ARTICLE" && uniqueKeyMismatch) {
      submissionMetadata.articleUniqueKeyMismatch = true;
      submissionMetadata.articleSubmittedUniqueKey = submittedUniqueKey ?? null;
    }
    // For CUSTOM: stash the admin-defined form answers so the admin review
    // screen can render them next to the task config.
    if (task.type === "CUSTOM" && customAnswers) {
      submissionMetadata.customAnswers = customAnswers;
    }
    // For PROXY: record the submit IP so the admin fraud surface can verify the
    // user actually browsed through the assigned proxy region.
    if (task.type === "PROXY") {
      const submitIp = (
        request.headers.get("x-forwarded-for")?.split(",")[0] ??
        request.headers.get("x-real-ip") ??
        ""
      ).trim();
      submissionMetadata.submitIp = submitIp || null;
    }
    const hasMetadata = Object.keys(submissionMetadata).length > 0;

    const resolvedProof = isSocial
      ? socialBundle
        ? ((socialBundle[0]?.proofUrl as string | undefined) ?? null)
        : (proofUrl ?? null)
      : proof || null;
    const resolvedProofImages = isSocial
      ? socialBundle
        ? socialBundle
            .map((it) => it.screenshotUrl as string | undefined)
            .filter((s): s is string => !!s)
        : screenshotUrl
          ? [screenshotUrl]
          : []
      : proofImages || [];

    // Atomically claim the submission: only the FIRST concurrent submit flips
    // it from PENDING/not-submitted to its new state. Two parallel POSTs (a
    // double-click / client retry) would otherwise both pass the guard above
    // and both run the credit block below — and since Transaction.reference
    // has no unique backstop, the duplicate EARNING would stick (double pay).
    const claim = await prisma.taskSubmission.updateMany({
      where: {
        id: submission.id,
        status: SubmissionStatus.PENDING,
        submittedAt: null,
      },
      data: {
        proof: resolvedProof,
        proofImages: { set: resolvedProofImages },
        answers: answers || null,
        score,
        status: newStatus,
        // Mark the actual submit moment (distinguishes "in progress" from
        // "submitted / pending review" for a still-PENDING submission).
        submittedAt: new Date(),
        ...(hasMetadata
          ? { metadata: JSON.parse(JSON.stringify(submissionMetadata)) }
          : {}),
        ...(shouldAutoApprove && {
          reviewedAt: new Date(),
          pointsEarned: isBoardTask ? 0 : task.pointsReward,
          xpEarned: isBoardTask ? 0 : task.xpReward,
        }),
      },
    });
    if (claim.count === 0) {
      // Lost the race (another request already submitted this).
      return NextResponse.json(
        { error: "You've already submitted this — it's awaiting review." },
        { status: 409 }
      );
    }
    const updatedSubmission = (await prisma.taskSubmission.findUnique({
      where: { id: submission.id },
    }))!;

    // If auto-approved AND not a board task, award points and update user
    if (shouldAutoApprove && !isBoardTask) {
      // Apply per-plan task reward multiplier
      const userPlan = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { package: { select: { taskRewardMultiplier: true } } },
      });
      const multiplier =
        (userPlan as unknown as { package: { taskRewardMultiplier: number } | null })?.package
          ?.taskRewardMultiplier ?? 1;
      const effectivePoints = Math.round(task.pointsReward * multiplier);
      const effectiveXp = Math.round(task.xpReward * multiplier);
      const pointsPerUsd = await getPointsPerUsd();

      // Funded (user-created) task: draw from the pool FIRST (CAS). If the pool
      // can't cover this reward, never mint unfunded points — close the task and
      // return without crediting. (Funded tasks are normally manual-review; this
      // guards the auto path against concurrent overspend.)
      if (task.fundedByUserId) {
        const drawn = await prisma.task.updateMany({
          where: { id: task.id, remainingBudget: { gte: effectivePoints } },
          data: { remainingBudget: { decrement: effectivePoints } },
        });
        if (drawn.count === 0) {
          await prisma.task.update({
            where: { id: task.id },
            data: { remainingBudget: 0, status: "COMPLETED" },
          });
          return NextResponse.json({
            submission: updatedSubmission,
            status: "approved",
            message: "This task's reward budget is exhausted — no reward granted.",
            rewards: { points: 0, xp: 0 },
          });
        }
        if (task.remainingBudget - effectivePoints < task.pointsReward) {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "COMPLETED" },
          });
        }
      }

      // Update user points and XP
      const user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          pointsBalance: { increment: effectivePoints },
          xp: { increment: effectiveXp },
          totalEarnings: { increment: effectivePoints / pointsPerUsd },
        },
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points: effectivePoints,
          amount: effectivePoints / pointsPerUsd,
          description: `Completed task: ${task.title}`,
          reference: `task_${task.id}_${submission.id}`,
          metadata: {
            taskId: task.id,
            taskType: task.type,
            submissionId: submission.id,
            multiplier,
          },
        },
      });

      // Update task completed count
      await prisma.task.update({
        where: { id: task.id },
        data: {
          completedCount: { increment: 1 },
        },
      });

      // Check for level up
      const newLevel = calculateLevel(user.xp + effectiveXp);
      if (newLevel > user.level) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { level: newLevel },
        });

        // Level up notification (in-app + email + push)
        await notifyUser({
          userId: session.user.id,
          type: NotificationType.ACHIEVEMENT,
          title: "Level Up!",
          message: `Congratulations! You've reached level ${newLevel}!`,
          data: { newLevel, previousLevel: user.level },
        });
      }

      // Task completed notification (in-app + email + push)
      await notifyUser({
        userId: session.user.id,
        type: NotificationType.TASK,
        title: "Task Completed!",
        message: `You earned ${effectivePoints} points from "${task.title}"`,
        data: { taskId: task.id, points: effectivePoints, xp: effectiveXp },
        link: "/wallet",
      });

      // Process referral commissions on the effective (multiplied) reward.
      await processReferralCommissions(session.user.id, effectivePoints, task.id);

      return NextResponse.json({
        submission: updatedSubmission,
        status: "approved",
        message: "Task completed successfully!",
        rewards: {
          points: effectivePoints,
          xp: effectiveXp,
        },
        newBalance: user.pointsBalance + effectivePoints,
        score,
      });
    }

    // Board task — reward deferred to board claim
    if (isBoardTask) {
      // Still bump the task's completed counter on auto-approve so analytics
      // and per-task progress remain accurate.
      if (shouldAutoApprove) {
        await prisma.task.update({
          where: { id: task.id },
          data: { completedCount: { increment: 1 } },
        });
      }
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: NotificationType.TASK,
          title: shouldAutoApprove
            ? "Task done — reward bundled"
            : "Submitted — reward bundled",
          message: shouldAutoApprove
            ? `Counted toward your Task Board progress. Claim the board once all tasks are done.`
            : `Submitted and pending review. Reward will be granted when you claim the Task Board.`,
          data: {
            taskId: task.id,
            boardId: task.boardId,
            deferred: true,
          },
        },
      });
      return NextResponse.json({
        submission: updatedSubmission,
        status: shouldAutoApprove ? "approved" : "pending_review",
        deferred: true,
        message: shouldAutoApprove
          ? "Counted toward your Task Board progress. Claim the board once all tasks are done."
          : "Submitted. Reward will be granted when you claim the Task Board.",
      });
    }

    // For manual review tasks
    return NextResponse.json({
      submission: updatedSubmission,
      status: "pending_review",
      message:
        "Your submission has been received and is pending review. You will be notified once it's approved.",
    });
  } catch (error) {
    console.error("Error submitting task:", error);
    return NextResponse.json(
      { error: "Failed to submit task" },
      { status: 500 }
    );
  }
  });
}

// Calculate user level based on XP
function calculateLevel(xp: number): number {
  // Level formula: Each level requires more XP than the previous
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, etc.
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 2000) return 5;
  if (xp < 4000) return 6;
  if (xp < 7000) return 7;
  if (xp < 11000) return 8;
  if (xp < 16000) return 9;
  if (xp < 22000) return 10;

  // After level 10, each level requires 10000 more XP
  return Math.floor(10 + (xp - 22000) / 10000);
}

