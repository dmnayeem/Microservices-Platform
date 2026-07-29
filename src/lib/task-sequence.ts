// Sequential task unlock (feature #7).
//
// When the admin toggle `tasks.sequential_unlock` is ON, a user's eligible tasks
// form ONE GLOBAL ordered chain: only the first not-yet-done task is startable;
// everything after it is locked until the previous one is completed. "Completed"
// means a submission exists TODAY (user-local midnight) — PENDING counts, so a
// submit unlocks the next task without waiting for admin approval. The chain
// resets every local day. Admins bypass the lock entirely.
//
// This is the single source of truth shared by the task list endpoint (to render
// the LOCKED badge) and the start/quiz gates (to enforce it), so the two can
// never disagree.

import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskType, type UserRole } from "@/generated/prisma";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import type { PackageFeatureKey } from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { getSetting } from "@/lib/system-settings";
import { isAdmin } from "@/lib/rbac";

// Keep in sync with TASK_TYPE_FEATURE in src/app/api/tasks/route.ts.
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

export interface TaskChainState {
  /** Whether sequential locking is actively applied for this user right now. */
  enabled: boolean;
  /** Task ids that are locked (strictly after the active task in the chain). */
  lockedTaskIds: Set<string>;
  /** The first not-yet-done task in the chain (the only newly-startable one). */
  activeTaskId: string | null;
}

const DISABLED: TaskChainState = {
  enabled: false,
  lockedTaskIds: new Set(),
  activeTaskId: null,
};

/**
 * Compute the sequential-unlock state for a user. Returns a no-op (nothing
 * locked) when the feature toggle is off, the user is an admin, or the user
 * has no eligible tasks.
 */
export async function getTaskChainState(userId: string): Promise<TaskChainState> {
  const enabled = await getSetting<boolean>("tasks.sequential_unlock", false);
  if (!enabled) return DISABLED;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, country: true, role: true },
  });
  if (!user) return DISABLED;

  // Admins see everything unlocked.
  if (isAdmin(user.role as UserRole | undefined)) return DISABLED;

  const userPackage = await getEffectivePackage(userId);
  // No tasks section for this plan → nothing to sequence.
  if (!packageHasFeature(userPackage, "tasks")) return DISABLED;

  const accessLevel = userPackage?.accessLevel ?? 0;
  const allowedTypes = (Object.keys(TASK_TYPE_FEATURE) as TaskType[]).filter(
    (t) => packageHasFeature(userPackage, TASK_TYPE_FEATURE[t])
  );

  const now = new Date();
  const andClauses: Array<Record<string, unknown>> = [
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { minLevel: { lte: user.level } },
    { requiredAccessLevel: { lte: accessLevel } },
    { type: { in: allowedTypes } },
  ];
  if (user.country) {
    andClauses.push({
      OR: [
        { countries: { isEmpty: true } },
        { countries: { has: user.country } },
      ],
    });
  }

  // The full ordered eligible set — id-only + the two fields needed to decide
  // whether a task is "satisfied" without another query. Cheap; short-cached
  // because it depends only on slow-moving inputs (level/accessLevel/country),
  // not on the user's submissions.
  const orderedTasks = (await prisma.task.findMany({
    where: { status: TaskStatus.ACTIVE, AND: andClauses },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: { id: true, totalLimit: true, completedCount: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  })) as unknown as Array<{
    id: string;
    totalLimit: number | null;
    completedCount: number;
  }>;

  if (orderedTasks.length === 0) return { enabled: true, lockedTaskIds: new Set(), activeTaskId: null };

  // Task ids the user has a submission for TODAY (any consuming status). This
  // MUST stay fresh (no caching) so a just-submitted task advances the chain.
  const { startOfDayUtc: todayStart } = await getUserDayContext(userId);
  const todaySubs = await prisma.taskSubmission.findMany({
    where: {
      userId,
      createdAt: { gte: todayStart },
      status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
    },
    select: { taskId: true },
  });
  const doneToday = new Set(todaySubs.map((s) => s.taskId));

  // Walk the chain. A task is "satisfied" (chain advances past it) if it was
  // submitted today OR it is globally full (totalLimit reached) — the latter
  // prevents an exhausted task from deadlocking everyone behind it.
  const lockedTaskIds = new Set<string>();
  let activeTaskId: string | null = null;
  let frontierPassed = false;
  for (const t of orderedTasks) {
    const satisfied =
      doneToday.has(t.id) ||
      (t.totalLimit != null && t.completedCount >= t.totalLimit);
    if (frontierPassed) {
      lockedTaskIds.add(t.id);
      continue;
    }
    if (satisfied) continue;
    // First non-satisfied task = the active/unlocked one; lock everything after.
    activeTaskId = t.id;
    frontierPassed = true;
  }

  return { enabled: true, lockedTaskIds, activeTaskId };
}
