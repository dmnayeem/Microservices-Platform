import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
import {
  normalizeSocialConfig,
  validateSocialBundle,
  bundleTotalPoints,
} from "@/lib/social-tasks";
import {
  validateAppInstallConfig,
  normalizeAppInstallConfig,
  type AppInstallConfig,
} from "@/lib/app-install-tasks";
import { resolveTaskThumbnail } from "@/lib/task-thumbnail";
import { taskCompletabilityError } from "@/lib/task-completability";
import { isGeminiConfigured } from "@/lib/gemini";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        _count: {
          select: { submissions: true },
        },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const {
      title,
      description,
      instructions,
      instructionVideoUrl,
      type,
      status,
      pointsReward,
      xpReward,
      dailyLimit,
      totalLimit,
      minLevel,
      requiredAccessLevel,
      hidden,
      order,
      contentUrl,
      thumbnailUrl,
      duration,
      questions,
      socialPlatform,
      socialAction,
      socialUrl,
      socialConfig,
      articleConfig,
      videoConfig,
      surveyConfig,
      customConfig,
      appInstallConfig,
      proxyInstructions,
      startsAt,
      expiresAt,
      cooldownMinutes,
      autoApprove,
      boardId,
    } = body;

    // Validate boardId references an existing active board, if provided
    if (boardId) {
      const board = await prisma.taskBoard.findUnique({
        where: { id: boardId },
        select: { id: true, isActive: true },
      });
      if (!board || !board.isActive) {
        return NextResponse.json(
          { error: "Selected Task Board not found or inactive" },
          { status: 400 }
        );
      }
    }

    // SOCIAL: normalize/validate/sort the bundle and make the server
    // authoritative on points (Task.pointsReward = Σ item points).
    let socialConfigOut = socialConfig
      ? JSON.parse(JSON.stringify(socialConfig))
      : null;
    let socialPlatformOut = socialPlatform || null;
    let socialActionOut = socialAction || null;
    let socialUrlOut = socialUrl || null;
    let pointsRewardOut = parseInt(pointsReward.toString());
    if (type === "SOCIAL") {
      const norm = normalizeSocialConfig(socialConfig);
      const v = validateSocialBundle(norm);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.error || "Invalid social bundle" },
          { status: 400 }
        );
      }
      // Preserve the admin's chosen action order (drag-and-drop) verbatim.
      const items = norm.items;
      pointsRewardOut = bundleTotalPoints(items);
      socialConfigOut = {
        platform: norm.platform,
        items,
        version: 2,
        sequential: norm.sequential,
      };
      socialPlatformOut = norm.platform;
      socialActionOut = items[0]?.action ?? null;
      socialUrlOut =
        items[0]?.fields?.targetUrl ??
        items[0]?.fields?.targetHandle ??
        socialUrl ??
        null;
    }

    // APPINSTALL: validate + normalize server-side (mirror the create route, so
    // proof requirements / app-kind persist cleanly instead of raw client JSON).
    let appInstallConfigOut = appInstallConfig
      ? JSON.parse(JSON.stringify(appInstallConfig))
      : null;
    if (type === "APPINSTALL" && appInstallConfig) {
      const err = validateAppInstallConfig(appInstallConfig);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      appInstallConfigOut = JSON.parse(
        JSON.stringify(normalizeAppInstallConfig(appInstallConfig as AppInstallConfig))
      );
    }

    // The same completability gate as creation. A task that was fine when it
    // was created and is then edited into an unfinishable state is exactly as
    // broken — and the edit path is the easier one to leave ungated.
    const completability = taskCompletabilityError(
      {
        type,
        pointsReward: pointsRewardOut,
        xpReward: xpReward,
        contentUrl,
        questions,
        videoConfig,
        articleConfig,
      },
      { aiQuizAvailable: isGeminiConfigured() }
    );
    if (completability) {
      return NextResponse.json({ error: completability }, { status: 400 });
    }

    // Auto-derive a thumbnail from the task's link when none was set.
    const resolvedThumbnailUrl = await resolveTaskThumbnail({
      thumbnailUrl,
      contentUrl,
      socialConfig,
      socialUrl: socialUrlOut,
    });

    // Update the task
    const task = await prisma.task.update({
      where: { id },
      data: {
        title,
        description,
        instructions: instructions || null,
        instructionVideoUrl: instructionVideoUrl || null,
        type,
        status: status || existingTask.status,
        pointsReward: pointsRewardOut,
        xpReward: parseInt(xpReward?.toString() || "0"),
        dailyLimit: dailyLimit ? parseInt(dailyLimit.toString()) : null,
        totalLimit: totalLimit ? parseInt(totalLimit.toString()) : null,
        minLevel: parseInt(minLevel?.toString() || "1"),
        requiredAccessLevel:
          typeof requiredAccessLevel === "number"
            ? requiredAccessLevel
            : parseInt(String(requiredAccessLevel ?? 0)) || 0,
        ...(hidden !== undefined ? { hidden: hidden === true } : {}),
        order: order != null ? parseInt(String(order)) || 0 : existingTask.order,
        // Audience targeting (countries + state/division/district/upazila + gender + age).
        ...sanitizeTaskAudience(body),
        contentUrl: contentUrl || null,
        thumbnailUrl: resolvedThumbnailUrl,
        duration: duration ? parseInt(duration.toString()) : null,
        questions: questions || null,
        socialPlatform: socialPlatformOut,
        socialAction: socialActionOut,
        socialUrl: socialUrlOut,
        socialConfig: socialConfigOut,
        articleConfig: articleConfig
          ? JSON.parse(JSON.stringify(articleConfig))
          : null,
        videoConfig: videoConfig
          ? JSON.parse(JSON.stringify(videoConfig))
          : null,
        surveyConfig: surveyConfig
          ? JSON.parse(JSON.stringify(surveyConfig))
          : null,
        customConfig: customConfig
          ? JSON.parse(JSON.stringify(customConfig))
          : null,
        appInstallConfig: appInstallConfigOut,
        proxyInstructions: proxyInstructions || null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        cooldownMinutes: parseInt(cooldownMinutes?.toString() || "0"),
        autoApprove: autoApprove || false,
        boardId: boardId || null,
        // Surveys: always manual review, and once per user — enforced per user
        // in /api/tasks/[id]/start, NOT via `totalLimit`.
        //
        // `totalLimit` is a GLOBAL counter (`task.completedCount >= totalLimit`),
        // incremented once per approval across all users. Setting it to 1 to
        // mean "once each" meant the first user to have a survey approved closed
        // it for the entire platform, and everyone after saw "Task limit has
        // been reached".
        ...(type === "SURVEY" ? { autoApprove: false, dailyLimit: 1 } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "TASK_UPDATED",
        entity: "Task",
        entityId: task.id,
        newData: { type, title, pointsReward: task.pointsReward },
      },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Does anyone's work hang off this task?
    //
    // `TaskSubmission.taskId` is Restrict, so `task.delete()` on a task with
    // submissions raises a foreign-key error — which this handler used to
    // swallow into a bare 500 "Failed to delete task". 52 of the 102 live tasks
    // were in that state, so for half the catalogue the button simply did not
    // work and said nothing useful about why.
    //
    // Cascading is not the fix: those rows ARE the record of work users were
    // paid for, and every ledger entry is keyed `task_<taskId>_<submissionId>`,
    // so deleting them orphans the money trail. A task with history is retired
    // instead — `visibleTaskWhere()` matches only ACTIVE, so ARCHIVED leaves
    // every user-facing list by itself.
    const submissions = await prisma.taskSubmission.count({
      where: { taskId: id },
    });

    if (submissions > 0) {
      if (existingTask.status === "ARCHIVED") {
        return NextResponse.json({
          success: true,
          archived: true,
          submissions,
          message: "Task is already archived",
        });
      }
      const archived = await prisma.task.update({
        where: { id },
        data: { status: "ARCHIVED" },
        select: { id: true, status: true },
      });
      return NextResponse.json({
        success: true,
        archived: true,
        submissions,
        task: archived,
        message: `Archived — ${submissions} submission${
          submissions === 1 ? "" : "s"
        } and their payment records are kept`,
      });
    }

    // No history → really delete it.
    await prisma.task.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      archived: false,
      submissions: 0,
      message: "Task deleted successfully",
    });
  } catch (error) {
    // A foreign key we did not anticipate. Say which, instead of a blanket 500 —
    // that opacity is what made the original bug take so long to pin down.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "This task still has linked records, so it can't be deleted. Archive it instead.",
        },
        { status: 409 }
      );
    }
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}

// PATCH for status changes (pause/resume)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let newStatus: "ACTIVE" | "PAUSED" | "COMPLETED" | "EXPIRED";

    switch (action) {
      case "pause":
        newStatus = "PAUSED";
        break;
      case "resume":
        newStatus = "ACTIVE";
        break;
      case "complete":
        newStatus = "COMPLETED";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { status: newStatus },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error updating task status:", error);
    return NextResponse.json(
      { error: "Failed to update task status" },
      { status: 500 }
    );
  }
}
