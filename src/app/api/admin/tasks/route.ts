import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can, canAny } from "@/lib/permissions";
import { taskCreatePermFor, TASK_CREATE_PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
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
import { resolveTaskThumbnail } from "@/lib/task-thumbnail";
import { taskCompletabilityError } from "@/lib/task-completability";
import { isGeminiConfigured } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Coarse gate: must be able to create at least one task type.
    if (
      !(await canAny(session.user.id, ["tasks.create", ...TASK_CREATE_PERMISSIONS]))
    ) {
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

    // Per-type creation gate: the umbrella `tasks.create` OR this type's permission.
    if (
      !(await can(session.user.id, "tasks.create")) &&
      !(await can(session.user.id, taskCreatePermFor(type)))
    ) {
      return NextResponse.json(
        { error: `You don't have permission to create ${type} tasks` },
        { status: 403 }
      );
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

    // Can a user actually finish this and get paid? APPINSTALL, CUSTOM and
    // SOCIAL are validated above; VIDEO, ARTICLE and QUIZ had no gate at all,
    // and nothing checked the reward — which is how 8 live video tasks paying
    // 0/0 and 6 article tasks with no article ended up visible to every user.
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
        hidden: hidden === true,
        order: order != null ? parseInt(String(order)) || 0 : 0,
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

    if (!(await can(session.user.id, "tasks.view"))) {
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
