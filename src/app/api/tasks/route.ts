import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskType } from "@/generated/prisma";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import {
  TASK_TYPE_FEATURE,
  visibleTaskWhere,
} from "@/lib/task-visibility";

// GET /api/tasks - Fetch available tasks for user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TaskType | null;
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Get user with their level + country
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
        gender: true,
        dateOfBirth: true,
        pointsBalance: true,
        xp: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Resolve the user's effective plan — handles expiry + isDefault fallback.
    const userPackage = await getEffectivePackage(session.user.id);

    // Tasks-section gate. If admin disabled tasks for this plan, return empty.
    if (!packageHasFeature(userPackage, "tasks")) {
      return NextResponse.json({
        tasks: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        user: {
          level: user.level,
          packageName: userPackage?.name ?? null,
          accessLevel: userPackage?.accessLevel ?? 0,
          pointsBalance: user.pointsBalance,
          xp: user.xp,
        },
        reason: "tasks_disabled_for_plan",
      });
    }

    const accessLevel = userPackage?.accessLevel ?? 0;

    // Get user's completed tasks today for daily limit check — boundary is the
    // user's LOCAL midnight.
    const { startOfDayUtc: todayStart } = await getUserDayContext(session.user.id);

    // Daily-limit counting — only states that consume a daily slot, today.
    const countingSubs = await prisma.taskSubmission.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: todayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
      select: { taskId: true },
    });

    // Badge status — the actionable/informative state per task:
    //   REVISION    — admin asked for changes (must resubmit)          [any day]
    //   IN_PROGRESS — a PENDING submission started but not yet submitted [any day]
    //   SUBMITTED   — a PENDING submission already submitted (awaiting review) [any day]
    //   REJECTED    — rejected today (informational, can retry within limits) [today]
    //   COMPLETED   — an APPROVED/AUTO_APPROVED submission today          [today]
    // Pending review / in-progress / revision are queried across ALL days so a
    // task submitted yesterday still shows its badge instead of resetting to
    // "Available" (was scoped to today — the reported status bug).
    type UserTaskStatus =
      | "COMPLETED"
      | "REJECTED"
      | "SUBMITTED"
      | "IN_PROGRESS"
      | "REVISION";
    const statusSubs = await prisma.taskSubmission.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { status: { in: ["PENDING", "REVISION_REQUESTED"] } },
          {
            status: { in: ["APPROVED", "AUTO_APPROVED", "REJECTED"] },
            createdAt: { gte: todayStart },
          },
        ],
      },
      select: { taskId: true, status: true, submittedAt: true },
    });

    const userTodayCounts = new Map<string, number>();
    const pendingTaskIds = new Set<string>();
    const userStatusByTask = new Map<string, UserTaskStatus>();
    // Higher rank wins when a task has several submissions. Actionable states
    // (revision → in-progress → submitted) outrank terminal ones so a completed
    // attempt never hides a fresh in-progress/pending one (rank-collapse bug).
    const rank: Record<UserTaskStatus, number> = {
      REJECTED: 1,
      COMPLETED: 2,
      SUBMITTED: 3,
      IN_PROGRESS: 4,
      REVISION: 5,
    };
    const mapStatus = (s: {
      status: string;
      submittedAt: Date | null;
    }): UserTaskStatus => {
      if (s.status === "REVISION_REQUESTED") return "REVISION";
      if (s.status === "REJECTED") return "REJECTED";
      if (s.status === "PENDING")
        return s.submittedAt ? "SUBMITTED" : "IN_PROGRESS";
      return "COMPLETED";
    };
    for (const s of countingSubs) {
      userTodayCounts.set(s.taskId, (userTodayCounts.get(s.taskId) ?? 0) + 1);
    }
    for (const s of statusSubs) {
      if (s.status === "PENDING") pendingTaskIds.add(s.taskId);
      const st = mapStatus(s);
      const prev = userStatusByTask.get(s.taskId);
      if (!prev || rank[st] > rank[prev]) userStatusByTask.set(s.taskId, st);
    }

    // Hide entire task types that this plan has switched off (e.g. plan with
    // articleTasksEnabled=false should never see ARTICLE tasks in the list).
    const allowedTypes = (Object.keys(TASK_TYPE_FEATURE) as TaskType[]).filter(
      (t) => packageHasFeature(userPackage, TASK_TYPE_FEATURE[t])
    );

    // ONE definition of task visibility — src/lib/task-visibility.ts. Every
    // other task route builds its where from the same function now.
    const where = visibleTaskWhere(user, {
      accessLevel,
      allowedTypes,
      type,
      category,
    });

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        // Sequential-unlock ordering (feature #7): admin-set `order` first, then
        // newest — so the displayed order matches the unlock chain.
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    const taskIds = tasks.map((t) => t.id);
    const taskCategories = await prisma.taskCategory.findMany({
      where: {
        tasks: { some: { id: { in: taskIds } } },
      },
      select: {
        id: true,
        name: true,
        icon: true,
        color: true,
        tasks: { where: { id: { in: taskIds } }, select: { id: true } },
      },
    });

    const taskCategoryMap = new Map<string, Array<{ id: string; name: string; icon: string | null; color: string | null }>>();
    taskCategories.forEach((cat) => {
      cat.tasks.forEach((task) => {
        const existing = taskCategoryMap.get(task.id) || [];
        existing.push({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color });
        taskCategoryMap.set(task.id, existing);
      });
    });

    // One grouped query for per-task submission totals (was N counts).
    const submissionCountRows = (await prisma.taskSubmission.groupBy({
      by: ["taskId"],
      where: { taskId: { in: taskIds } },
      _count: { _all: true },
    })) as unknown as { taskId: string; _count: { _all: number } }[];
    const submissionCountMap = new Map(
      submissionCountRows.map((r) => [r.taskId, r._count._all])
    );

    // Sequential-unlock chain state (no-op unless the admin toggle is on and the
    // user isn't an admin). Same helper the start/quiz gates enforce with.
    const { lockedTaskIds } = await getTaskChainState(session.user.id);

    const processedTasks = tasks.map((task) => {
      const todayCount = userTodayCounts.get(task.id) ?? 0;
      const hasPending = pendingTaskIds.has(task.id);
      const dailyLimit = task.dailyLimit ?? 1;
      const dailyLimitReached = todayCount >= dailyLimit;

      const reachedTotalLimit =
        task.totalLimit && task.completedCount >= task.totalLimit;

      const canStart =
        hasPending || (!dailyLimitReached && !reachedTotalLimit);

      const completedToday = !canStart;

      const remainingToday = Math.max(0, dailyLimit - todayCount);
      const remainingSlots = task.totalLimit
        ? task.totalLimit - task.completedCount
        : null;

      const locked = lockedTaskIds.has(task.id);

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        pointsReward: task.pointsReward,
        xpReward: task.xpReward,
        thumbnailUrl: task.thumbnailUrl,
        duration: task.duration,
        instructions: task.instructions,
        instructionVideoUrl: task.instructionVideoUrl,
        contentUrl: task.contentUrl,
        videoConfig: task.videoConfig,
        minLevel: task.minLevel,
        requiredAccessLevel: task.requiredAccessLevel,
        categories: taskCategoryMap.get(task.id) || [],
        socialPlatform: task.socialPlatform,
        socialAction: task.socialAction,
        autoApprove: task.autoApprove,
        expiresAt: task.expiresAt,
        // `completedCount` is the CREDITED count the slot limit is enforced
        // against (Task.completedCount). The number of attempts is a different
        // thing and now ships under its own name — shipping attempts as
        // "completedCount" made cards read "47 completed / 50" on a task that
        // actually closes at 31.
        completedCount: task.completedCount,
        submissionCount: submissionCountMap.get(task.id) || 0,
        remainingSlots,
        dailyLimit,
        remainingToday,
        hasPending,
        userStatus: userStatusByTask.get(task.id) ?? "AVAILABLE",
        dailyLimitReached,
        totalLimitReached: !!reachedTotalLimit,
        canStart,
        completedToday,
        locked,
        lockReason: locked ? "Complete the previous task first" : null,
        reason: !canStart
          ? dailyLimitReached
            ? "Daily limit reached"
            : reachedTotalLimit
              ? "Task limit reached"
              : null
          : null,
      };
    });

    // Show startable tasks AND any task that already has a user status
    // (completed today, pending review, in-progress, revision, rejected) so the
    // badge shows instead of the task silently vanishing. Only globally
    // unavailable tasks with no user history stay hidden.
    // Locked tasks stay visible (shown with a lock) instead of vanishing.
    const visibleTasks = processedTasks.filter(
      (t) => t.canStart || t.locked || t.userStatus !== "AVAILABLE"
    );

    return NextResponse.json({
      tasks: visibleTasks,
      pagination: {
        page,
        limit,
        // `total` is the full page-able set; `shown` is what survived the
        // per-user visibility filter below. Rendering `total` as "N tasks" was
        // wrong whenever the two differed.
        total,
        shown: visibleTasks.length,
        totalPages: Math.ceil(total / limit),
      },
      user: {
        level: user.level,
        packageName: userPackage?.name ?? null,
        accessLevel,
        pointsBalance: user.pointsBalance,
        xp: user.xp,
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
