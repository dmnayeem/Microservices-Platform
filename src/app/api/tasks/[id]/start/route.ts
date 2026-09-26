import { NextRequest, NextResponse } from "next/server";
import { countryOfIp } from "@/lib/geo";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { TaskStatus, TaskType, SubmissionStatus } from "@/generated/prisma";
import {
  getEffectivePackage,
  resolveUserFeature,
  parseFeatureOverrides,
  type PackageFeatureKey,
} from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import { matchesTaskAudience } from "@/lib/task-targeting";
import { stripUniqueKey, toPlayerQuestions } from "@/lib/task-player-view";
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
} from "@/lib/fraud";
import { addFraudRisk } from "@/lib/fraud-risk";
import { accountsOnDevice, flagOnce, readDevice, recordDevice } from "@/lib/device";
import { profileGateResponse } from "@/lib/profile-gate-server";

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
    // Profile gate — see lib/profile-gate-server.ts. Checked on every route
    // that lets a user earn, or a locked user earns through the unchecked one.
    const profileGated = await profileGateResponse(session.user.id, "tasks");
    if (profileGated) return profileGated;

    // A banned or suspended account must not be able to start a task. `User.status`
    // is otherwise only ever read at login, and the JWT lives 30 days with no
    // status claim, so a ban had no effect until the session expired.
    const active = await requireActiveUser(session.user.id);
    if (!active.ok) {
      return NextResponse.json(
        { error: active.message },
        { status: active.httpStatus }
      );
    }

    // ── Anti-fraud gate (all admin-toggleable) ──────────────────────────────
    const ip = clientIp(request);
    const ua = request.headers.get("user-agent");
    const fraud = await getFraudConfig();
    // Record the most-recent IP (best-effort) for the per-IP account cap.
    if (ip && ip !== "unknown") {
      void prisma.user
        .update({ where: { id: session.user.id }, data: { lastIp: ip, lastCountry: countryOfIp(ip) } })
        .catch(() => {});
    }
    // VPN/proxy block (best-effort heuristic).
    // One offence per user per day: every retry of a blocked start used to
    // write another event, and now each one would also add risk.
    const today = new Date().toISOString().slice(0, 10);
    if (isVpnIp(ip, fraud)) {
      await addFraudRisk({
        userId: session.user.id,
        signal: "VPN_DETECTED",
        dedupeKey: `vpn:${session.user.id}:${today}`,
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
    // Accounts per DEVICE — the real multi-account signal. Several accounts
    // working from one browser is what account farming looks like; it adds
    // fraud risk (once a day) and, by default, stops the task.
    const seen = await readDevice();
    void recordDevice(session.user.id, { ...seen, ip: ip && ip !== "unknown" ? ip : seen.ip });
    if (fraud.maxAccountsPerDevice > 0 && seen.deviceId) {
      const n = await accountsOnDevice(seen.deviceId);
      if (n > fraud.maxAccountsPerDevice) {
        await addFraudRisk({
          userId: session.user.id,
          signal: "MULTIPLE_ACCOUNTS",
          dedupeKey: `multidev:${session.user.id}:${today}`,
          ipAddress: ip,
          userAgent: ua,
          details: { accountsOnDevice: n, cap: fraud.maxAccountsPerDevice, deviceId: seen.deviceId },
        });
        if (fraud.deviceLimitAction === "block") {
          return NextResponse.json(
            {
              error: `This device is used by ${n} accounts — the limit is ${fraud.maxAccountsPerDevice}. Work from your own account on your own device.`,
              code: "DEVICE_LIMIT",
            },
            { status: 403 }
          );
        }
      }
    }

    // Accounts per IP. A home or office WiFi puts many honest people behind
    // one IP, so by default ("flag") this is recorded once a day for review
    // and adds NO fraud risk — with risk points, a 20-person office would
    // have been auto-suspended in ten days. "block" refuses, as it used to.
    if (fraud.maxUsersPerIp > 0) {
      const n = await accountsOnIp(ip, session.user.id);
      if (n >= fraud.maxUsersPerIp) {
        if (fraud.ipLimitAction === "block") {
          await addFraudRisk({
            userId: session.user.id,
            signal: "MULTIPLE_ACCOUNTS",
            dedupeKey: `multiacct:${session.user.id}:${today}`,
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
        await flagOnce(`ipflag:${session.user.id}:${today}`, {
          userId: session.user.id,
          eventType: "SHARED_IP",
          ipAddress: ip,
          userAgent: ua,
          details: { accountsOnIp: n + 1, cap: fraud.maxUsersPerIp, note: "review only — shared WiFi is normal" },
        });
      }
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // The super-admin hard hide. This route checks status, expiry, start date,
    // level, access level, audience, the unlock chain and every limit — but
    // never read `hidden`, so "hidden" was a list filter and nothing more: a
    // task pulled from circulation was still startable and payable by id.
    if (task.hidden) {
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
    // (The profile gate is enforced at the top of this route, before the
    // fraud checks, by profileGateResponse — it honours the admin's chosen
    // standard and feature list, which this old check could not.)

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
    const mission = await getActiveMissionForUser(session.user.id);
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

    // A survey is answered once per PERSON, for the lifetime of the task —
    // asking the same respondent twice would corrupt the results.
    //
    // The admin routes used to express this as `totalLimit: 1`, but that is a
    // global counter, so the first approval closed the survey for everyone.
    // The rule belongs here, per user.
    if (task.type === TaskType.SURVEY) {
      const alreadyAnswered = await prisma.taskSubmission.findFirst({
        where: {
          taskId: id,
          userId: session.user.id,
          status: {
            in: [
              SubmissionStatus.PENDING,
              SubmissionStatus.APPROVED,
              SubmissionStatus.AUTO_APPROVED,
            ],
          },
        },
        select: { id: true },
      });
      if (alreadyAnswered) {
        return NextResponse.json(
          { error: "You've already answered this survey." },
          { status: 400 }
        );
      }
    }

    // An attempt the user walked away from, before any limit is counted.
    //
    // This is THE reason a task the user opened and left became impossible to
    // get back into. Starting writes a PENDING row; the daily-limit count below
    // includes PENDING; `dailyLimit` defaults to 1. So one abandoned attempt
    // filled the day's only slot, the gate fired, and the resume path further
    // down — which exists precisely for this — was never reached. The card
    // still said "Start", and pressing it answered "Daily limit reached for
    // this task" on a task the user had never finished once.
    //
    // Resuming what you already started is not a second attempt, so it is
    // looked up first. `submittedAt: null` is what separates "still in the
    // middle of it" from "sent in, waiting for review" — the second one IS
    // finished from the user's side and must still be counted.
    //
    // /api/article-tasks/[taskId]/start already had this order. Only this route
    // had it backwards, which is why every type except ARTICLE was affected.
    const resumable = await prisma.taskSubmission.findFirst({
      where: {
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
        submittedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    // Per-task daily limit (admin-set on the task itself)
    if (!resumable) {
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
        // A submission that is in for review is not "the daily limit" as far as
        // the user is concerned, and telling them it is sends them looking for
        // a limit they have not hit.
        const awaitingReview = await prisma.taskSubmission.count({
          where: {
            taskId: id,
            userId: session.user.id,
            status: SubmissionStatus.PENDING,
            submittedAt: { not: null },
          },
        });
        return NextResponse.json(
          {
            error: awaitingReview
              ? "You have already submitted this task — it is waiting to be reviewed."
              : "Daily limit reached for this task",
          },
          { status: 400 }
        );
      }
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
          // Sanitised — the raw videoConfig carries `uniqueKey`, the value the
          // submit route validates proof against, and `questions` carries the
          // answer key. See task-player-view.ts.
          videoConfig: stripUniqueKey(task.videoConfig),
          articleConfig: stripUniqueKey(task.articleConfig),
          questions: toPlayerQuestions(task.questions),
          autoApprove: task.autoApprove,
        },
        message: "Redo — your previous submission was reopened.",
      });
    }

    // Cooldown between attempts — again, only for a NEW attempt. A cooldown
    // measured from "the last submission of any status" includes the very row
    // the user is trying to get back into, so without this a task with any
    // cooldown at all locked the user out of their own unfinished attempt.
    if (!resumable && task.cooldownMinutes > 0) {
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

    if (resumable) {
      return NextResponse.json({
        submission: resumable,
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
          // Sanitised — the raw videoConfig carries `uniqueKey`, the value the
          // submit route validates proof against, and `questions` carries the
          // answer key. See task-player-view.ts.
          videoConfig: stripUniqueKey(task.videoConfig),
          articleConfig: stripUniqueKey(task.articleConfig),
          questions: toPlayerQuestions(task.questions),
          autoApprove: task.autoApprove,
        },
        message: "Picking up where you left off.",
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
