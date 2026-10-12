// Sequential task unlock (feature #7).
//
// When the admin toggle `tasks.sequential_unlock` is ON, each task CATEGORY
// (task type — Video, Social, Article…) is its own ordered chain: only the
// first not-yet-done task of that category is startable; the rest of the
// category is locked until the previous one is completed. (It used to be one
// chain across every type, so a video task could be locked behind a quiz.)
// Tasks above the member's plan (Standard / Premium) are not in the chain at
// all — they are shown as upgrade offers and never block the free tasks. "Completed"
// means a submission exists TODAY (user-local midnight) — PENDING counts, so a
// submit unlocks the next task without waiting for admin approval. The chain
// resets every local day. Admins bypass the lock entirely.
//
// This is the single source of truth shared by the task list endpoint (to render
// the LOCKED badge) and the start/quiz gates (to enforce it), so the two can
// never disagree.

import { prisma } from "@/lib/prisma";
import { type UserRole } from "@/generated/prisma";
import { getUserDayContext } from "@/lib/user-day";
import {
  getTaskViewerContext,
  visibleTaskWhere,
} from "@/lib/task-visibility";
import { getSetting } from "@/lib/system-settings";
import { isAdmin } from "@/lib/rbac";

export interface TaskChainState {
  /** Whether sequential locking is actively applied for this user right now. */
  enabled: boolean;
  /** Task ids that are locked (strictly after the active task in the chain). */
  lockedTaskIds: Set<string>;
  /** The first not-yet-done task of the first category (kept for callers). */
  activeTaskId: string | null;
  /** The startable task of each category (task type). */
  activeByType: Map<string, string>;
}

const DISABLED: TaskChainState = {
  enabled: false,
  lockedTaskIds: new Set(),
  activeTaskId: null,
  activeByType: new Map(),
};

/**
 * Compute the sequential-unlock state for a user. Returns a no-op (nothing
 * locked) when the feature toggle is off, the user is an admin, or the user
 * has no eligible tasks.
 */
export async function getTaskChainState(userId: string): Promise<TaskChainState> {
  const enabled = await getSetting<boolean>("tasks.sequential_unlock", false);
  if (!enabled) return DISABLED;

  const [user, ctx] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
    getTaskViewerContext(userId),
  ]);
  if (!user || !ctx) return DISABLED;

  // Admins see everything unlocked.
  if (isAdmin(user.role as UserRole | undefined)) return DISABLED;

  // No tasks section for this plan → nothing to sequence.
  if (!ctx.hasTasksFeature) return DISABLED;

  // The chain MUST be ordered over exactly the set the list renders. It used to
  // apply only `countries` of the seven audience dimensions and skipped
  // `hidden`, so lock positions could land on tasks the user never sees.
  const chainWhere = visibleTaskWhere(ctx.viewer, {
    accessLevel: ctx.accessLevel,
    allowedTypes: ctx.allowedTypes,
  });

  // The full ordered eligible set — id-only + the two fields needed to decide
  // whether a task is "satisfied" without another query. Cheap; short-cached
  // because it depends only on slow-moving inputs (level/accessLevel/country),
  // not on the user's submissions.
  const orderedTasks = (await prisma.task.findMany({
    where: chainWhere,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: { id: true, type: true, totalLimit: true, completedCount: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  })) as unknown as Array<{
    id: string;
    type: string;
    totalLimit: number | null;
    completedCount: number;
  }>;

  if (orderedTasks.length === 0) {
    return { enabled: true, lockedTaskIds: new Set(), activeTaskId: null, activeByType: new Map() };
  }

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
  // One walk per category, in the admin's order within it.
  const lockedTaskIds = new Set<string>();
  const activeByType = new Map<string, string>();
  let activeTaskId: string | null = null;
  for (const t of orderedTasks) {
    const satisfied =
      doneToday.has(t.id) ||
      (t.totalLimit != null && t.completedCount >= t.totalLimit);
    if (activeByType.has(t.type)) {
      // This category's frontier is already set: everything after it waits.
      lockedTaskIds.add(t.id);
      continue;
    }
    if (satisfied) continue;
    // First non-satisfied task of the category = its startable one.
    activeByType.set(t.type, t.id);
    activeTaskId ??= t.id;
  }

  return { enabled: true, lockedTaskIds, activeTaskId, activeByType };
}
