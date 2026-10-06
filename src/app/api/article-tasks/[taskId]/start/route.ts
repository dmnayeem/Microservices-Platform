import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { openSubmission, OpenSubmissionBlocked } from "@/lib/open-submission";
import { taskStartFraudGate, taskStartPlanGate } from "@/lib/task-start-gates";
import { getEffectivePackage } from "@/lib/packages";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { SubmissionStatus } from "@/generated/prisma/client";
import { TaskType } from "@/generated/prisma";
import type { ArticleConfig } from "@/lib/article-tasks";
import { coerceArticleEntry } from "@/lib/article-tasks";
import {
  signArticleTaskToken,
  appendArticleToken,
} from "@/lib/article-task-token";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import {
  getTaskViewerContext,
  visibleTaskWhere,
} from "@/lib/task-visibility";
import { profileGateResponse } from "@/lib/profile-gate-server";

/**
 * POST /api/article-tasks/[taskId]/start
 *
 * Called by the user-side article task view when the user clicks "Start
 * task". We:
 *   1. Validate the task is ARTICLE + key-pool mode and has at least one
 *      page configured.
 *   2. Find or create a PENDING TaskSubmission for this user/task.
 *   3. Sign a session token bound to the submission.
 *   4. Return the page-1 URL with `?eg=<token>` appended.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /article-tasks is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/article-tasks");
  if (pageHidden) return pageHidden;
  // Profile gate — see lib/profile-gate-server.ts. Checked on every route
  // that lets a user earn, or a locked user earns through the unchecked one.
  // Resuming an attempt already started (not yet sent in) is not a new start.
  const { taskId: gateTaskId } = await params;
  const gateUserId = session.user.id;
  const profileGated = await profileGateResponse(session.user.id, "tasks", async () =>
    !!(await prisma.taskSubmission.findFirst({
      where: { taskId: gateTaskId, userId: gateUserId, status: SubmissionStatus.PENDING, submittedAt: null },
      select: { id: true },
    }))
  );
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

  const fraudBlocked = await taskStartFraudGate(request, session.user.id);
  if (fraudBlocked) return fraudBlocked;

  const { taskId } = await params;

  // Loaded through the SAME visibility clause the task list uses.
  //
  // This is a second start path, and it enforced only "exists, is ARTICLE, has
  // a key pool" plus the per-user limits below. Everything else was missing:
  // status, hidden, expiresAt, startsAt, minLevel, requiredAccessLevel, the
  // per-plan feature gate and audience targeting. The PENDING submission it
  // creates is then accepted by `/api/tasks/[id]/submit`, and key-pool ARTICLE
  // is on the auto-approve list — so this route paid out while bypassing every
  // eligibility rule on the platform.
  const ctx = await getTaskViewerContext(session.user.id);
  if (!ctx || !ctx.hasTasksFeature) {
    return NextResponse.json(
      { error: "Your plan doesn't include tasks." },
      { status: 403 }
    );
  }
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...visibleTaskWhere(ctx.viewer, {
        accessLevel: ctx.accessLevel,
        allowedTypes: ctx.allowedTypes,
        type: TaskType.ARTICLE,
      }),
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Article task not found" }, { status: 404 });
  }

  // Sequential-unlock chain — the same guard `/api/tasks/[id]/start` applies,
  // so this path can't be used to skip a locked task.
  const { lockedTaskIds } = await getTaskChainState(session.user.id);
  if (lockedTaskIds.has(task.id)) {
    return NextResponse.json(
      {
        error: "Complete the previous task first to unlock this one.",
        code: "TASK_LOCKED",
      },
      { status: 403 }
    );
  }

  const cfg = task.articleConfig as ArticleConfig | null;
  if (!cfg?.useKeyPool) {
    return NextResponse.json(
      { error: "This task is not configured for the key-pool flow." },
      { status: 400 }
    );
  }
  const pages = (cfg.pages ?? []).filter((p) => p.url.trim());
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "Task has no pages configured." },
      { status: 400 }
    );
  }

  // Reuse an in-flight PENDING submission if one exists for this user/task —
  // this lets the user resume mid-flow without losing popup progress.
  //
  // In flight means NOT yet submitted (`submittedAt: null`), as in
  // /api/tasks/[id]/start. PENDING alone also matches yesterday's submission
  // still waiting for review, and resuming that one sent the user through the
  // whole article again only for submit to answer "You've already submitted
  // this" — a repeatable task could never be done a second time while the
  // first was in the review queue.
  let submission = await prisma.taskSubmission.findFirst({
    where: {
      taskId: task.id,
      userId: session.user.id,
      status: SubmissionStatus.PENDING,
      submittedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  // If we'd be CREATING a new submission (no in-flight pending), enforce
  // the same per-user limits as the legacy /api/tasks/[id]/start: total,
  // daily, cooldown. Resuming a pending session bypasses the gate so the
  // user can finish what they started.
  if (!submission) {
    // totalLimit (global across all users)
    if (task.totalLimit && task.completedCount >= task.totalLimit) {
      return NextResponse.json(
        { error: "Task limit has been reached" },
        { status: 400 }
      );
    }

    // dailyLimit (per user, midnight-to-midnight in the user's LOCAL tz)
    const { startOfDayUtc: todayStart } = await getUserDayContext(session.user.id);
    const todayCount = await prisma.taskSubmission.count({
      where: {
        taskId: task.id,
        userId: session.user.id,
        createdAt: { gte: todayStart },
        status: {
          in: [
            SubmissionStatus.APPROVED,
            SubmissionStatus.AUTO_APPROVED,
            SubmissionStatus.PENDING,
          ],
        },
      },
    });
    const dailyLimit = task.dailyLimit ?? 1;
    if (todayCount >= dailyLimit) {
      return NextResponse.json(
        { error: "Daily limit reached for this task" },
        { status: 400 }
      );
    }

    // The daily mission / plan allowance, as on every other task.
    const planBlocked = await taskStartPlanGate(
      session.user.id,
      task,
      await getEffectivePackage(session.user.id),
      todayStart
    );
    if (planBlocked) return planBlocked;

    // cooldownMinutes (per user, since last submission of any status)
    if (task.cooldownMinutes > 0) {
      const cooldownTime = new Date(
        Date.now() - task.cooldownMinutes * 60 * 1000
      );
      const recentSubmission = await prisma.taskSubmission.findFirst({
        where: {
          taskId: task.id,
          userId: session.user.id,
          createdAt: { gte: cooldownTime },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recentSubmission) {
        const waitMinutes = Math.ceil(
          (recentSubmission.createdAt.getTime() +
            task.cooldownMinutes * 60 * 1000 -
            Date.now()) /
            1000 /
            60
        );
        return NextResponse.json(
          {
            error: `Please wait ${waitMinutes} more minute${waitMinutes === 1 ? "" : "s"} before starting again`,
          },
          { status: 400 }
        );
      }
    }

    // Daily limit + cooldown re-checked under the user-row lock, in the same
    // transaction as the insert (count-then-insert raced) — see openSubmission.
    const startUserId = session.user.id;
    try {
      submission = await openSubmission(task.id, startUserId, async (tx) => {
        const n = await tx.taskSubmission.count({
          where: {
            taskId: task.id,
            userId: startUserId,
            createdAt: { gte: todayStart },
            status: {
              in: [
                SubmissionStatus.APPROVED,
                SubmissionStatus.AUTO_APPROVED,
                SubmissionStatus.PENDING,
              ],
            },
          },
        });
        if (n >= dailyLimit) return "Daily limit reached for this task";
        if (task.cooldownMinutes > 0) {
          const recent = await tx.taskSubmission.findFirst({
            where: {
              taskId: task.id,
              userId: startUserId,
              createdAt: { gte: new Date(Date.now() - task.cooldownMinutes * 60 * 1000) },
            },
            select: { id: true },
          });
          if (recent) return "Please wait before starting this task again";
        }
        return null;
      });
    } catch (err) {
      if (err instanceof OpenSubmissionBlocked) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  const token = signArticleTaskToken({
    s: submission.id,
    t: task.id,
    u: session.user.id,
  });

  const entry = coerceArticleEntry(cfg?.entry);

  /* A task that asks the worker to arrive from a search or a post must NOT be
     handed a ready link to the article. Give them one and they will click it —
     which is a direct arrival, which the door then refuses, and they will have
     done nothing wrong. So those modes get the search page or the post, and
     the destination is described rather than linked. */
  const firstPageUrl = entry ? null : appendArticleToken(pages[0].url, token);

  let landingHost: string | null = null;
  if (entry?.landingUrl) {
    try {
      landingHost = new URL(entry.landingUrl).host.replace(/^www\./, "");
    } catch {
      landingHost = null;
    }
  }

  return NextResponse.json({
    submissionId: submission.id,
    token,
    firstPageUrl,
    pageCount: pages.length,
    entry: entry
      ? {
          mode: entry.mode,
          searchKeyword: entry.searchKeyword ?? null,
          searchEngine: entry.searchEngine ?? "any",
          postUrl: entry.postUrl ?? null,
          /* The NAME of the site, never its URL — the worker has to recognise
             it in the results, not paste it. */
          landingHost,
        }
      : null,
  });
}
