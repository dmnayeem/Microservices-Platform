import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { validateCustomConfig, type CustomConfig } from "@/lib/custom-tasks";
import {
  validateAppInstallConfig,
  normalizeAppInstallConfig,
  type AppInstallConfig,
} from "@/lib/app-install-tasks";
import {
  normalizeSocialConfig,
  validateSocialBundle,
  bundleTotalPoints,
} from "@/lib/social-tasks";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "tasks.create")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

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

    // Validate required fields
    if (!title || !description || !type || pointsReward === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: title, description, type, and pointsReward are required" },
        { status: 400 }
      );
    }

    // Validate task type
    const validTypes = ["VIDEO", "ARTICLE", "QUIZ", "SURVEY", "SOCIAL", "PROXY", "OFFERWALL", "CUSTOM", "APPINSTALL"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
    }

    // Validate APPINSTALL task config
    let appInstallConfigOut: AppInstallConfig | null = null;
    if (type === "APPINSTALL") {
      const err = validateAppInstallConfig(appInstallConfig);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      appInstallConfigOut = normalizeAppInstallConfig(appInstallConfig as AppInstallConfig);
    }

    // Validate CUSTOM task config
    if (type === "CUSTOM") {
      if (!customConfig) {
        return NextResponse.json(
          { error: "Custom tasks need a form configuration" },
          { status: 400 }
        );
      }
      const err = validateCustomConfig(customConfig as CustomConfig);
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }
    }

    // SOCIAL: normalize (tolerates v1/v2), validate, natural-flow sort, and make
    // the server authoritative on points (Task.pointsReward = Σ item points).
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
      // Preserve the admin's chosen action order (drag-and-drop) verbatim —
      // no tier re-sort.
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

    // Create the task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        instructions: instructions || null,
        instructionVideoUrl: instructionVideoUrl || null,
        type,
        status: status || "ACTIVE",
        pointsReward: pointsRewardOut,
        xpReward: parseInt(xpReward?.toString() || "0"),
        dailyLimit: dailyLimit ? parseInt(dailyLimit.toString()) : null,
        totalLimit: totalLimit ? parseInt(totalLimit.toString()) : null,
        minLevel: parseInt(minLevel?.toString() || "1"),
        requiredAccessLevel:
          typeof requiredAccessLevel === "number"
            ? requiredAccessLevel
            : parseInt(String(requiredAccessLevel ?? 0)) || 0,
        order: order != null ? parseInt(String(order)) || 0 : 0,
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
        appInstallConfig: appInstallConfigOut
          ? JSON.parse(JSON.stringify(appInstallConfigOut))
          : null,
        proxyInstructions: proxyInstructions || null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        cooldownMinutes: parseInt(cooldownMinutes?.toString() || "0"),
        autoApprove: autoApprove || false,
        boardId: boardId || null,
        createdById: session.user.id,
        // Surveys: always manual review, once-per-user. These overrides win.
        ...(type === "SURVEY"
          ? { autoApprove: false, dailyLimit: 1, totalLimit: 1 }
          : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "TASK_CREATED",
        entity: "Task",
        entityId: task.id,
        newData: { type, title, pointsReward: task.pointsReward },
      },
    });

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "tasks.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (type && type !== "all") {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { submissions: true },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
