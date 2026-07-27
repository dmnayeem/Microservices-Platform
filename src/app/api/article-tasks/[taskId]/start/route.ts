import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmissionStatus } from "@/generated/prisma/client";
import type { ArticleConfig } from "@/lib/article-tasks";
import { signArticleTaskToken } from "@/lib/article-task-token";
import { getUserDayContext } from "@/lib/user-day";

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
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "ARTICLE") {
    return NextResponse.json({ error: "Article task not found" }, { status: 404 });
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
  let submission = await prisma.taskSubmission.findFirst({
    where: {
      taskId: task.id,
      userId: session.user.id,
      status: SubmissionStatus.PENDING,
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

    submission = await prisma.taskSubmission.create({
      data: {
        taskId: task.id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
    });
  }

  const token = signArticleTaskToken({
    s: submission.id,
    t: task.id,
    u: session.user.id,
  });

  const firstPageUrl = appendToken(pages[0].url, token);

  return NextResponse.json({
    submissionId: submission.id,
    token,
    firstPageUrl,
    pageCount: pages.length,
  });
}

function appendToken(url: string, token: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}eg=${encodeURIComponent(token)}`;
}
