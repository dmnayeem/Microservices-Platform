import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskType, SubmissionStatus } from "@/generated/prisma";
import {
  getEffectivePackage,
  resolveUserFeature,
  parseFeatureOverrides,
  type PackageFeatureKey,
} from "@/lib/packages";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { isProfileComplete } from "@/lib/profile-completion";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import { matchesTaskAudience } from "@/lib/task-targeting";
import {
  getActiveMissionForUser,
  buildDailyProgress,
  resolveTaskTypeBucket,
} from "@/lib/daily-mission-progress";
import { clientIp } from "@/lib/rate-limit";
import {
  getFraudConfig,
  isVpnIp,
  accountsOnIp,
  recordFraudEvent,
} from "@/lib/fraud";

const TASK_TYPE_FEATURE: Record<TaskType, PackageFeatureKey> = {
  SOCIAL: "socialTasks",
  PROXY: "proxyTasks",
  ARTICLE: "articleTasks",
  VIDEO: "videoTasks",
  QUIZ: "quizTasks",
  SURVEY: "surveyTasks",
  OFFERWALL: "offerwallTasks",
  CUSTOM: "tasks",
  APPINSTALL: "appInstall",
};

// POST /api/tasks/:id/start - Start a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Anti-fraud gate (all admin-toggleable) ──────────────────────────────
    const ip = clientIp(request);
    const ua = request.headers.get("user-agent");
    const fraud = await getFraudConfig();
    // Record the most-recent IP (best-effort) for the per-IP account cap.
    if (ip && ip !== "unknown") {
      void prisma.user
        .update({ where: { id: session.user.id }, data: { lastIp: ip } })
        .catch(() => {});
    }
    // VPN/proxy block (best-effort heuristic).
    if (isVpnIp(ip, fraud)) {
      await recordFraudEvent({
        userId: session.user.id,
        eventType: "VPN_DETECTED",
        severity: "HIGH",
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json(
        {
          error:
            "Please turn off your VPN/proxy to work on tasks.",
          code: "VPN_BLOCKED",
        },
        { status: 403 }
      );
    }
    // Per-IP account/worker cap.
    if (fraud.maxUsersPerIp > 0) {
      const n = await accountsOnIp(ip, session.user.id);
      if (n >= fraud.maxUsersPerIp) {
        await recordFraudEvent({
          userId: session.user.id,
          eventType: "MULTIPLE_ACCOUNTS",
          severity: "HIGH",
          ipAddress: ip,
          userAgent: ua,
          details: { accountsOnIp: n + 1, cap: fraud.maxUsersPerIp },
        });
        return NextResponse.json(
          {
            error:
              "Too many accounts are working from this network. Only a limited number are allowed per connection.",
            code: "IP_LIMIT",
          },
          { status: 403 }
        );
      }
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== TaskStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Task is not available" },
        { status: 400 }
      );
    }

    if (task.expiresAt && new Date() > task.expiresAt) {
      return NextResponse.json({ error: "Task has expired" }, { status: 400 });
    }

    if (task.startsAt && new Date() < task.startsAt) {
      return NextResponse.json(
        { error: "Task has not started yet" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        level: true,
        country: true,
        region: true,
        division: true,
        district: true,
        subDistrict: true,
        postalCode: true,
        avatar: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        featureOverrides: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const overrides = parseFeatureOverrides(user.featureOverrides);

    // Admin-gated profile-completion requirement — block starting any task until
    // the user's core profile is filled.
    const { requireProfileCompletion } = await getUiToggles();
    if (requireProfileCompletion && !isProfileComplete(user)) {
      return NextResponse.json(
        { error: "Complete your profile to start tasks." },
        { status: 403 }
      );
    }

    // Resolve effective plan (handles expiry + isDefault fallback).
    const userPackage = await getEffectivePackage(session.user.id);

    // Plan-level Tasks gate (admin can switch off all tasks for a plan;
    // per-user overrides win).
    if (!resolveUserFeature(userPackage, overrides, "tasks")) {
      return NextResponse.json(
        { error: "Tasks are disabled for your plan" },
        { status: 403 }
      );
    }

    // Per-task-type gate (e.g. plan with articleTasksEnabled=false can't
    // start an ARTICLE task).
    const typeFeature = TASK_TYPE_FEATURE[task.type];
    if (!resolveUserFeature(userPackage, overrides, typeFeature)) {
      return NextResponse.json(
        { error: `${task.type} tasks are disabled for your plan` },
        { status: 403 }
      );
    }

    // Level requirement
    if (user.level < task.minLevel) {
      return NextResponse.json(
        { error: `Minimum level ${task.minLevel} required` },
        { status: 403 }
      );
    }

    // Access-level gate replaces the old PackageTier check.
    const userLevel = userPackage?.accessLevel ?? 0;
    if (userLevel < task.requiredAccessLevel) {
      return NextResponse.json(
        {
          error: `This task requires a higher plan (level ${task.requiredAccessLevel}+, you have ${userLevel}).`,
        },
        { status: 403 }
      );
    }

    // Audience targeting (country + state/division/district/upazila + gender +
    // age) — STRICT: a user missing a targeted attribute is rejected.
    if (!matchesTaskAudience(task, user)) {
      return NextResponse.json(
        { error: "This task isn't available for your profile or area." },
        { status: 403 }
      );
    }

    // Sequential-unlock gate (feature #7): if this task is locked behind an
    // earlier, not-yet-completed task in the user's chain, block it. No-ops when
    // the toggle is off or the user is an admin.
    const { lockedTaskIds } = await getTaskChainState(session.user.id);
    if (lockedTaskIds.has(id)) {
      return NextResponse.json(
        {
          error: "Complete the previous task first to unlock this one.",
          code: "TASK_LOCKED",
        },
        { status: 403 }
      );
    }

    // Day boundary for all daily counters below — the user's LOCAL midnight,
    // computed once and reused (both the plan-wide and per-task daily limits).
    const { startOfDayUtc: dayStart } = await getUserDayContext(session.user.id);

    // Daily-mission cap: the user's daily mission defines their per-type task
    // allowance. A type not in the mission, or one whose target is already met,
    // is upgrade-gated. Only applies when an active qualifying mission exists.
    const mission = await getActiveMissionForUser(
      userPackage?.accessLevel ?? 0,
      user.level
    );
    if (mission && mission.items.length > 0) {
      const bucket = task.boardId ? "BOARD" : resolveTaskTypeBucket(task.type);
      const item = mission.items.find(
        (it) => resolveTaskTypeBucket(it.taskType) === bucket
      );
      if (!item) {
        return NextResponse.json(
          {
            error:
              "This task isn't part of your daily mission. Upgrade your plan to unlock more tasks.",
            code: "UPGRADE_REQUIRED",
          },
          { status: 403 }
        );
      }
      const countByType = await buildDailyProgress(
        session.user.id,
        mission.items
      );
      if ((countByType[bucket] ?? 0) >= item.targetCount) {
        return NextResponse.json(
          {
            error: `You've finished today's ${task.type.toLowerCase()} tasks in your daily mission. Upgrade your plan for more.`,
            code: "UPGRADE_REQUIRED",
          },
          { status: 403 }
        );
      }
    }

    // Plan-level dailyTaskLimit (across all tasks today).
    if (userPackage && userPackage.dailyTaskLimit !== -1) {
      const totalToday = await prisma.taskSubmission.count({
        where: {
          userId: session.user.id,
          createdAt: { gte: dayStart },
          status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
        },
      });
      if (totalToday >= userPackage.dailyTaskLimit) {
        return NextResponse.json(
          {
            error: `Daily task limit reached for your plan (${userPackage.dailyTaskLimit}/day).`,
          },
          { status: 400 }
        );
      }
    }

    // Total task limit (global across all users)
    if (task.totalLimit && task.completedCount >= task.totalLimit) {
      return NextResponse.json(
        { error: "Task limit has been reached" },
        { status: 400 }
      );
    }

    // Per-task daily limit (admin-set on the task itself)
    const todaySubmissions = await prisma.taskSubmission.count({
      where: {
        taskId: id,
        userId: session.user.id,
        createdAt: { gte: dayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
    });

    const dailyLimit = task.dailyLimit || 1;
    if (todaySubmissions >= dailyLimit) {
      return NextResponse.json(
        { error: "Daily limit reached for this task" },
        { status: 400 }
      );
    }

    // Admin-requested redo: if the latest submission is REVISION_REQUESTED,
    // reopen that same row (flip back to PENDING) and skip the cooldown — the
    // admin explicitly asked the user to redo it.
    const revisionSub = await prisma.taskSubmission.findFirst({
      where: {
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.REVISION_REQUESTED,
      },
      orderBy: { createdAt: "desc" },
    });
    if (revisionSub) {
      const reopened = await prisma.taskSubmission.update({
        where: { id: revisionSub.id },
        data: {
          status: SubmissionStatus.PENDING,
          submittedAt: null,
          reviewedAt: null,
          reviewedBy: null,
        },
      });
      return NextResponse.json({
        submission: reopened,
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          instructions: task.instructions,
          type: task.type,
          pointsReward: task.pointsReward,
          xpReward: task.xpReward,
          duration: task.duration,
          contentUrl: task.contentUrl,
          socialPlatform: task.socialPlatform,
          socialAction: task.socialAction,
          socialUrl: task.socialUrl,
          socialConfig: task.socialConfig,
          videoConfig: task.videoConfig,
          questions: task.questions,
          autoApprove: task.autoApprove,
        },
        message: "Redo — your previous submission was reopened.",
      });
    }

    // Cooldown between attempts on this specific task
    if (task.cooldownMinutes > 0) {
      const cooldownTime = new Date(
        Date.now() - task.cooldownMinutes * 60 * 1000
      );
      const recentSubmission = await prisma.taskSubmission.findFirst({
        where: {
          taskId: id,
          userId: session.user.id,
          createdAt: { gte: cooldownTime },
        },
      });

      if (recentSubmission) {
        const waitTime = Math.ceil(
          (recentSubmission.createdAt.getTime() +
            task.cooldownMinutes * 60 * 1000 -
            Date.now()) /
            1000 /
            60
        );
        return NextResponse.json(
          { error: `Please wait ${waitTime} more minutes before starting again` },
          { status: 400 }
        );
      }
    }

    // Resume a pending submission if one exists.
    const existingPending = await prisma.taskSubmission.findFirst({
      where: {
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
    });

    if (existingPending) {
      return NextResponse.json({
        submission: existingPending,
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          instructions: task.instructions,
          type: task.type,
          pointsReward: task.pointsReward,
          xpReward: task.xpReward,
          duration: task.duration,
          contentUrl: task.contentUrl,
          socialPlatform: task.socialPlatform,
          socialAction: task.socialAction,
          socialUrl: task.socialUrl,
          socialConfig: task.socialConfig,
          videoConfig: task.videoConfig,
          questions: task.questions,
          autoApprove: task.autoApprove,
        },
        message: "You already have an active submission for this task",
      });
    }

    const submission = await prisma.taskSubmission.create({
      data: {
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
    });

    return NextResponse.json({
      submission: {
        id: submission.id,
        taskId: submission.taskId,
        status: submission.status,
        createdAt: submission.createdAt,
      },
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        type: task.type,
        pointsReward: task.pointsReward,
        xpReward: task.xpReward,
        duration: task.duration,
        contentUrl: task.contentUrl,
        socialPlatform: task.socialPlatform,
        socialAction: task.socialAction,
        socialUrl: task.socialUrl,
        socialConfig: task.socialConfig,
        videoConfig: task.videoConfig,
        questions: task.questions,
        autoApprove: task.autoApprove,
      },
      message: "Task started successfully",
    });
  } catch (error) {
    console.error("Error starting task:", error);
    return NextResponse.json(
      { error: "Failed to start task" },
      { status: 500 }
    );
  }
}
