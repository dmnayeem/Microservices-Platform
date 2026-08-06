import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
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
      order,
      countries,
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
        order: order != null ? parseInt(String(order)) || 0 : existingTask.order,
        countries: countries || [],
        contentUrl: contentUrl || null,
        thumbnailUrl: thumbnailUrl || null,
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
        // Surveys: always manual review, once-per-user. These overrides win.
        ...(type === "SURVEY"
          ? { autoApprove: false, dailyLimit: 1, totalLimit: 1 }
          : {}),
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
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Delete the task
    await prisma.task.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
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
