import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TaskStatus, TaskType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePackage,
  packageHasFeature,
  type PackageFeatureKey,
} from "@/lib/packages";
import { taskAudienceWhere, type TaskAudienceUser } from "@/lib/task-targeting";

/**
 * THE definition of "may this viewer see this task".
 *
 * This clause set used to be hand-copied into nine places and every copy was
 * missing something different: `/api/tasks/quiz` had no `hidden`, no date
 * windows and no plan gate (so hidden, expired and plan-disabled quiz tasks
 * rendered to users and inflated their counts vs. admin), `/api/tasks/proxy`
 * and the board routes had no audience targeting at all, and the sequential
 * unlock chain ordered over a different set than the list it locks.
 *
 * Modelled on `servableCampaignWhere()` in src/lib/ad-serve.ts — one exported
 * where-builder, reused everywhere, so a fix lands once.
 */

/** Map TaskType → the per-plan feature flag that switches that type on. */
export const TASK_TYPE_FEATURE: Record<TaskType, PackageFeatureKey> = {
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

/** The viewer columns task visibility depends on. */
export const TASK_VIEWER_SELECT = {
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
} as const;

export type TaskViewer = TaskAudienceUser & { level?: number | null };

export interface TaskVisibilityOpts {
  accessLevel: number;
  allowedTypes: TaskType[];
  /** Narrow to a single type without rebuilding the clause set. */
  type?: TaskType | null;
  /** Category name filter, as /api/tasks supports. */
  category?: string | null;
  /**
   * Include tasks that belong to a board. Default false — board tasks are
   * played from their board, and a board task completed outside its board earns
   * nothing (`submit/route.ts` defers the payout to the board bundle), so
   * listing them in the general task list just looks broken.
   *
   * `isBoardOnly` existed on the model and was read in exactly one place
   * (`/api/tasks/summary`), never as a filter — so board-only tasks appeared in
   * the general list, in `/api/tasks/social`, `/proxy`, `/quiz` and in the
   * sequential-unlock chain. Board routes pass `true`.
   */
  includeBoardTasks?: boolean;
  now?: Date;
}

export function visibleTaskWhere(
  viewer: TaskViewer,
  opts: TaskVisibilityOpts
): Prisma.TaskWhereInput {
  const now = opts.now ?? new Date();
  const andClauses: Prisma.TaskWhereInput[] = [
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { minLevel: { lte: viewer.level ?? 1 } },
    { requiredAccessLevel: { lte: opts.accessLevel } },
    { type: { in: opts.allowedTypes } },
    // Audience targeting (country + state/division/district/upazila + gender +
    // age) — STRICT: a viewer missing a targeted attribute is excluded.
    ...taskAudienceWhere(viewer),
  ];

  if (!opts.includeBoardTasks) {
    andClauses.push({ isBoardOnly: false, boardId: null });
  }

  const where: Prisma.TaskWhereInput = {
    status: TaskStatus.ACTIVE,
    // Super-admin hard hide — never in any user-facing list.
    hidden: false,
    AND: andClauses,
  };
  if (opts.type) where.type = opts.type;
  if (opts.category) where.categories = { some: { name: opts.category } };
  return where;
}

export interface TaskViewerContext {
  viewer: TaskViewer & { id: string };
  accessLevel: number;
  allowedTypes: TaskType[];
  /** False when the plan has the whole tasks section switched off. */
  hasTasksFeature: boolean;
  packageName: string | null;
}

/** One round-trip that returns everything `visibleTaskWhere` needs. */
export async function getTaskViewerContext(
  userId: string
): Promise<TaskViewerContext | null> {
  const [user, pkg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: TASK_VIEWER_SELECT }),
    getEffectivePackage(userId),
  ]);
  if (!user) return null;

  return {
    viewer: user,
    accessLevel: pkg?.accessLevel ?? 0,
    allowedTypes: (Object.keys(TASK_TYPE_FEATURE) as TaskType[]).filter((t) =>
      packageHasFeature(pkg, TASK_TYPE_FEATURE[t])
    ),
    hasTasksFeature: packageHasFeature(pkg, "tasks"),
    packageName: pkg?.name ?? null,
  };
}

/**
 * A short list of tasks the viewer can actually start — for dashboard-style
 * previews that link straight into a task.
 */
export async function getVisibleTaskPreview(userId: string, take = 6) {
  const ctx = await getTaskViewerContext(userId);
  if (!ctx || !ctx.hasTasksFeature) return [];
  return prisma.task.findMany({
    where: visibleTaskWhere(ctx.viewer, {
      accessLevel: ctx.accessLevel,
      allowedTypes: ctx.allowedTypes,
    }),
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      type: true,
      pointsReward: true,
      xpReward: true,
      difficulty: true,
    },
  });
}

/**
 * THE definition of "may this viewer see this task board".
 *
 * Boards had no per-user gate at all beyond the unlock chain, so every active
 * board was listed to everyone. Targeting leaked through only as a board whose
 * task count came back 0 and whose claim then failed with "Board has no active
 * tasks" — which looks like a broken board, not a board meant for someone else.
 *
 * Use it on the list, the detail fetch AND the claim route. A list filter is
 * not a security boundary: the claim route hands out points.
 */
export function visibleBoardWhere(
  viewer: TaskViewer,
  opts: { accessLevel: number; now?: Date }
): Prisma.TaskBoardWhereInput {
  const now = opts.now ?? new Date();
  return {
    isActive: true,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { minLevel: { lte: viewer.level ?? 1 } },
      { requiredAccessLevel: { lte: opts.accessLevel } },
      ...taskAudienceWhere<Prisma.TaskBoardWhereInput>(viewer),
    ],
  };
}

/**
 * The quiz-GAME gate (the standalone `Quiz` model — not `Task{type:QUIZ}`).
 * Kept beside the task one so the two quiz systems' rules stay visibly distinct.
 */
export function publishedQuizWhere(viewer: {
  level?: number | null;
  accessLevel: number;
}): Prisma.QuizWhereInput {
  return {
    status: "PUBLISHED",
    requiredLevel: { lte: viewer.level ?? 1 },
    OR: [
      { requiredAccessLevel: null },
      { requiredAccessLevel: { lte: viewer.accessLevel } },
    ],
  };
}
