import { prisma } from "@/lib/prisma";
import { syncCountryMode } from "@/lib/country-mode";
import { TaskType } from "@/generated/prisma";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { getTaskChainState } from "@/lib/task-sequence";
import { TASK_TYPE_FEATURE, visibleTaskWhere } from "@/lib/task-visibility";

export interface TaskListParams {
  type?: TaskType | null;
  category?: string | null;
  page?: number;
  limit?: number;
}

/**
 * The viewer's task list — the body of GET /api/tasks, shared with the /earn
 * page so its default tab renders without a client round trip.
 *
 * DISPLAY ONLY: `canStart`, `remainingToday` and friends are hints for the
 * cards. The start/submit routes re-check every limit uncached with their own
 * locks; nothing here decides a credit. `null` when the user does not exist.
 * Throws on DB errors.
 */
export async function listTasksForUser(
  userId: string,
  params: TaskListParams = {},
) {
  const type = params.type ?? null;
  const category = params.category ?? null;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  // Round 1 — everything keyed only on the user id, in parallel. These were
  // five serial round trips (country mode -> user -> plan -> day -> chain
  // state). The country-mode sync must finish before visibleTaskWhere is
  // built; it is awaited here with the rest, and the where is built after.
  const [, user, userPackage, dayCtx, chain] = await Promise.all([
    syncCountryMode(), // country targeting: profile+IP or IP only
    // Get user with their level + country
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        level: true,
        country: true,
        region: true,
        division: true,
        district: true,
        subDistrict: true,
        // IP country — the fallback when the profile has none (lib/effective-country).
        lastCountry: true,
        signupCountry: true,
        postalCode: true,
        gender: true,
        dateOfBirth: true,
        pointsBalance: true,
        xp: true,
      },
    }),
    // Resolve the user's effective plan — handles expiry + isDefault fallback.
    getEffectivePackage(userId),
    // The user's LOCAL midnight — the daily-limit boundary.
    getUserDayContext(userId),
    // Sequential-unlock chain state (no-op unless the admin toggle is on and the
    // user isn't an admin). Same helper the start/quiz gates enforce with.
    getTaskChainState(userId),
  ]);

  if (!user) return null;

  // Tasks-section gate. If admin disabled tasks for this plan, return empty.
  if (!packageHasFeature(userPackage, "tasks")) {
    return {
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
    };
  }

  const accessLevel = userPackage?.accessLevel ?? 0;

  const todayStart = dayCtx.startOfDayUtc;

  // Hide entire task types that this plan has switched off (e.g. plan with
  // articleTasksEnabled=false should never see ARTICLE tasks in the list).
  const allowedTypes = (Object.keys(TASK_TYPE_FEATURE) as TaskType[]).filter(
    (t) => packageHasFeature(userPackage, TASK_TYPE_FEATURE[t]),
  );

  // ONE definition of task visibility — src/lib/task-visibility.ts. Every
  // other task route builds its where from the same function now.
  const where = visibleTaskWhere(user, {
    accessLevel,
    allowedTypes,
    type,
    category,
  });

  // Round 2 — the user's submissions and the task page, in parallel (were
  // three serial rounds).
  const [countingSubs, statusSubs, tasks, total] = await Promise.all([
    // Daily-limit counting (display only — the start route re-checks) — only
    // states that consume a daily slot, today.
    prisma.taskSubmission.findMany({
      where: {
        userId,
        createdAt: { gte: todayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
      select: { taskId: true },
    }),

    // Badge status — the actionable/informative state per task:
    //   REVISION    — admin asked for changes (must resubmit)          [any day]
    //   IN_PROGRESS — a PENDING submission started but not yet submitted [any day]
    //   SUBMITTED   — a PENDING submission already submitted (awaiting review) [any day]
    //   REJECTED    — rejected today (informational, can retry within limits) [today]
    //   COMPLETED   — an APPROVED/AUTO_APPROVED submission today          [today]
    // Pending review / in-progress / revision are queried across ALL days so a
    // task submitted yesterday still shows its badge instead of resetting to
    // "Available" (was scoped to today — the reported status bug).
    prisma.taskSubmission.findMany({
      where: {
        userId,
        OR: [
          { status: { in: ["PENDING", "REVISION_REQUESTED"] } },
          {
            status: { in: ["APPROVED", "AUTO_APPROVED", "REJECTED"] },
            createdAt: { gte: todayStart },
          },
        ],
      },
      select: { taskId: true, status: true, submittedAt: true },
    }),
    prisma.task.findMany({
      where,
      // Sequential-unlock ordering (feature #7): admin-set `order` first, then
      // newest — so the displayed order matches the unlock chain.
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      // Explicit, and only what the DTO below actually reads.
      //
      // This used to select every column — which meant `createdById` (which
      // admin made the task) was loaded on every user's task list. The DTO
      // never emitted it, so nothing leaked; but "safe because the mapping
      // happens to be careful" is one `...task` away from not being safe, and
      // the answer to "which admin made this" is not a user's business.
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        instructionVideoUrl: true,
        type: true,
        pointsReward: true,
        xpReward: true,
        duration: true,
        thumbnailUrl: true,
        contentUrl: true,
        videoConfig: true,
        minLevel: true,
        requiredAccessLevel: true,
        socialPlatform: true,
        socialAction: true,
        autoApprove: true,
        expiresAt: true,
        completedCount: true,
        dailyLimit: true,
        totalLimit: true,
      },
    }),
    prisma.task.count({ where }),
  ]);

  type UserTaskStatus =
    "COMPLETED" | "REJECTED" | "SUBMITTED" | "IN_PROGRESS" | "REVISION";

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

  const taskIds = tasks.map((t) => t.id);
  // Round 3 — categories and per-task submission totals for this page.
  const [taskCategories, submissionCountRows] = await Promise.all([
    prisma.taskCategory.findMany({
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
    }),
    // One grouped query for per-task submission totals (was N counts).
    prisma.taskSubmission.groupBy({
      by: ["taskId"],
      where: { taskId: { in: taskIds } },
      _count: { _all: true },
    }) as unknown as Promise<{ taskId: string; _count: { _all: number } }[]>,
  ]);

  const taskCategoryMap = new Map<
    string,
    Array<{
      id: string;
      name: string;
      icon: string | null;
      color: string | null;
    }>
  >();
  taskCategories.forEach((cat) => {
    cat.tasks.forEach((task) => {
      const existing = taskCategoryMap.get(task.id) || [];
      existing.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
      });
      taskCategoryMap.set(task.id, existing);
    });
  });

  const submissionCountMap = new Map(
    submissionCountRows.map((r) => [r.taskId, r._count._all]),
  );

  const { lockedTaskIds } = chain;

  const processedTasks = tasks.map((task) => {
    const todayCount = userTodayCounts.get(task.id) ?? 0;
    const hasPending = pendingTaskIds.has(task.id);
    const dailyLimit = task.dailyLimit ?? 1;
    const dailyLimitReached = todayCount >= dailyLimit;

    const reachedTotalLimit =
      task.totalLimit && task.completedCount >= task.totalLimit;

    const canStart = hasPending || (!dailyLimitReached && !reachedTotalLimit);

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
    (t) => t.canStart || t.locked || t.userStatus !== "AVAILABLE",
  );

  return {
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
  };
}
