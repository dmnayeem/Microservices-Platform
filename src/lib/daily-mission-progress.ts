/**
 * Shared progress builder for daily missions.
 *
 * Counts a user's mission-relevant actions for "today" (UTC) and returns a
 * map from task-type bucket → count. Used by both /api/daily-mission/today
 * (display) and /api/daily-mission/claim (server-side completion check) so
 * the two never drift.
 *
 * Two sources are merged:
 *   1. TaskSubmission rows for today (existing behaviour) — keyed by
 *      task.type, with a special BOARD bucket for board-tied tasks.
 *   2. SocialActionLog rows for today — keyed by SOCIAL_<ACTION>, where
 *      <ACTION> = LIKE | COMMENT | SHARE | POST | VOTE. Only consulted when
 *      mission items reference SOCIAL_* and admin has opted in via
 *      `social_earning.count_toward_daily_missions`.
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { SubmissionStatus, TaskType } from "@/generated/prisma/client";
import { getSocialEarningConfig } from "@/lib/social-earning";
import { getUserDayContext } from "@/lib/user-day";
import { getEffectivePackage } from "@/lib/packages";
import type { MoneyInput } from "@/lib/money";
import { taskAudienceWhere } from "@/lib/task-targeting";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";

const TASK_TYPE_VALUES = new Set(Object.values(TaskType));

interface MissionItemForCount {
  taskType: string;
}

/**
 * The full row shapes. These interfaces used to list a handful of fields while
 * every caller cast the Prisma row to `as unknown as ActiveMission` and then
 * read fields the interface didn't declare — so the types documented nothing
 * and caught nothing.
 */
export interface ActiveMissionItem {
  id: string;
  taskType: string;
  targetCount: number;
  description: string | null;
  xpPerComplete: number;
  pointsPerComplete: number;
  duration: number | null;
  requiredLevel: number | null;
  order: number;
}

export interface ActiveMission {
  id: string;
  name: string;
  description: string | null;
  requiredAccessLevel: number;
  requiredLevel: number;
  completionXpReward: number;
  completionPointsReward: number;
  /** Prisma Decimal — run it through toNum() before doing arithmetic. */
  completionCashReward: MoneyInput;
  streakBonusEvery: number;
  streakBonusPoints: number;
  linkReferralBonus: boolean;
  autoRefresh: boolean;
  items: ActiveMissionItem[];
}

/**
 * The viewer attributes daily-mission eligibility reads, resolved once per
 * request. Deliberately the same select tasks and boards use.
 */
export const getDailyMissionViewer = cache(async (userId: string) => {
  const [user, pkg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: TASK_VIEWER_SELECT }),
    getEffectivePackage(userId).catch(() => null),
  ]);
  return user ? { viewer: user, accessLevel: pkg?.accessLevel ?? 0 } : null;
});

/**
 * THE eligibility rule for a daily mission template.
 *
 * Five routes hand-rolled this `findFirst` with their own copy of the where
 * clause. `getActiveMissionForUser` existed precisely so it lived in one place
 * and they simply didn't use it — which is why adding targeting here would
 * otherwise have meant patching six query sites and missing one.
 */
function eligibleTemplateWhere(
  viewer: { level?: number | null } & Parameters<typeof taskAudienceWhere>[0],
  accessLevel: number,
  now: Date = new Date()
): Prisma.DailyMissionTemplateWhereInput {
  return {
    isActive: true,
    requiredAccessLevel: { lte: accessLevel },
    requiredLevel: { lte: viewer.level ?? 1 },
    AND: [
      { OR: [{ startAt: null }, { startAt: { lte: now } }] },
      { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ...taskAudienceWhere<Prisma.DailyMissionTemplateWhereInput>(viewer),
    ],
  };
}

const TEMPLATE_ORDER: Prisma.DailyMissionTemplateOrderByWithRelationInput[] = [
  { requiredAccessLevel: "desc" },
  { order: "asc" },
  { createdAt: "desc" },
];

/**
 * The highest tier-qualifying active daily mission template (with items) for a
 * user, or null. Shared by /daily-mission/{today,claim}, rail-widgets and the
 * task-start gate so they all resolve the same mission.
 *
 * Takes a userId rather than (accessLevel, level) so a caller cannot resolve a
 * mission without the targeting check — that was how five copies drifted.
 */
export const getActiveMissionForUser = cache(
  async (userId: string): Promise<ActiveMission | null> => {
    const ctx = await getDailyMissionViewer(userId);
    if (!ctx) return null;
    const mission = await prisma.dailyMissionTemplate.findFirst({
      where: eligibleTemplateWhere(ctx.viewer, ctx.accessLevel),
      orderBy: TEMPLATE_ORDER,
      include: { items: { orderBy: { order: "asc" } } },
    });
    return (mission as unknown as ActiveMission) ?? null;
  }
);

/**
 * The template that gates the referral day-claim (`linkReferralBonus`).
 *
 * A separate resolver because it filters on the flag and deliberately ignores
 * `requiredLevel` — a low-level user must still be able to earn the referral
 * bonus. It shares the audience/schedule clauses so the two can't diverge.
 */
export const getReferralBonusMission = cache(async (userId: string) => {
  const ctx = await getDailyMissionViewer(userId);
  if (!ctx) return null;
  const { requiredLevel: _ignored, ...base } = eligibleTemplateWhere(
    ctx.viewer,
    ctx.accessLevel
  );
  return prisma.dailyMissionTemplate.findFirst({
    where: { ...base, linkReferralBonus: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true },
  });
});

/** Map a mission item taskType to the bucket used by countByType. */
export function resolveTaskTypeBucket(taskType: string): string {
  if (TASK_TYPE_VALUES.has(taskType as TaskType)) return taskType;
  if (taskType === "BOARD") return "BOARD";
  if (taskType === "MANUAL") return "CUSTOM";
  return taskType;
}

/** SOCIAL_LIKE → LIKE_GIVEN ; SOCIAL_POST → POST_CREATED ; etc. */
function socialBucketToLogAction(bucket: string): string | null {
  if (!bucket.startsWith("SOCIAL_")) return null;
  const tail = bucket.slice("SOCIAL_".length);
  if (tail === "POST") return "POST_CREATED";
  if (
    tail === "LIKE" ||
    tail === "COMMENT" ||
    tail === "SHARE" ||
    tail === "VOTE"
  ) {
    return `${tail}_GIVEN`;
  }
  return null;
}

export async function buildDailyProgress(
  userId: string,
  items: MissionItemForCount[]
): Promise<Record<string, number>> {
  // Reset boundary is the user's LOCAL midnight (country-based), not UTC.
  const { dayKey: today, startOfDayUtc: todayStart } =
    await getUserDayContext(userId);

  // Source 1: TaskSubmission counts (existing behaviour)
  const submissions = await prisma.taskSubmission.findMany({
    where: {
      userId,
      createdAt: { gte: todayStart },
      status: { in: [SubmissionStatus.APPROVED, SubmissionStatus.AUTO_APPROVED] },
    },
    select: { taskId: true, task: { select: { type: true, boardId: true } } },
  });

  const countByType: Record<string, number> = {};
  for (const s of submissions) {
    // A task that lives inside a board counts for NOTHING on its own.
    //
    // A board is one piece of work presented as one thing: the user is paid for
    // the board, not for its parts (`/api/tasks/boards/[id]/claim` is the only
    // place a board task's reward is released). Letting the parts also tick off
    // mission items would pay the same effort twice — a five-task board would
    // have cleared a "do 3 videos" item by itself, and the same submissions
    // would then ALSO have counted as five separate BOARD completions.
    //
    // BOARD is counted from BoardClaim below, which is the row that actually
    // means "this person finished a board".
    if (s.task.boardId) continue;
    const t = s.task.type;
    countByType[t] = (countByType[t] ?? 0) + 1;
  }

  // Source 2: platform activity that has its own table. Each query only runs
  // when a mission item actually asks for that type — a mission with no
  // marketplace item costs nothing here.
  //
  // A type listed in MISSION_TASK_TYPES with no counter below would silently
  // never complete, which is worse than not offering it at all.
  const wanted = new Set(items.map((i) => i.taskType));

  if (wanted.has("BOARD")) {
    // One completed board = one BoardClaim row = one BOARD credit, however many
    // tasks the board contained. `@@unique([userId, boardId])` means a board
    // can only ever be claimed once, so this cannot double-count either.
    countByType.BOARD = await prisma.boardClaim.count({
      where: { userId, claimedAt: { gte: todayStart } },
    });
  }
  if (wanted.has("LOTTERY_TICKET")) {
    countByType.LOTTERY_TICKET = await prisma.lotteryTicket.count({
      where: { userId, createdAt: { gte: todayStart } },
    });
  }
  if (wanted.has("GAME_PLAY")) {
    countByType.GAME_PLAY = await prisma.gameSession.count({
      where: { userId, startedAt: { gte: todayStart } },
    });
  }
  if (wanted.has("MARKETPLACE_PURCHASE")) {
    countByType.MARKETPLACE_PURCHASE = await prisma.marketplacePurchase.count({
      where: { buyerId: userId, status: "COMPLETED", createdAt: { gte: todayStart } },
    });
  }
  if (wanted.has("REFERRAL_SIGNUP")) {
    // Verified signups only — matching the referral system's own rule that a
    // click, or an unverified account, is worth nothing.
    countByType.REFERRAL_SIGNUP = await prisma.user.count({
      where: {
        referredById: userId,
        emailVerified: { not: null, gte: todayStart },
      },
    });
  }
  if (wanted.has("COURSE_LESSON")) {
    countByType.COURSE_LESSON = await prisma.courseLessonProgress.count({
      where: {
        enrollment: { userId },
        isCompleted: true,
        updatedAt: { gte: todayStart },
      },
    });
  }

  // Source 3: SocialActionLog counts (admin-gated)
  const socialBuckets = items
    .map((i) => i.taskType)
    .filter((t) => t.startsWith("SOCIAL_"));

  if (socialBuckets.length > 0) {
    const cfg = await getSocialEarningConfig();
    if (cfg.countTowardDailyMissions) {
      // Map each requested SOCIAL_* bucket to its log action
      const wantedActions = new Set<string>();
      const bucketByAction = new Map<string, string>();
      for (const b of socialBuckets) {
        const a = socialBucketToLogAction(b);
        if (a) {
          wantedActions.add(a);
          bucketByAction.set(a, b);
        }
      }

      if (wantedActions.size > 0) {
        if (cfg.missionDistinctPost) {
          // Count distinct postIds per action (anti-spam: 5 likes on same post = 1)
          const rows = await prisma.socialActionLog.findMany({
            where: {
              userId,
              dateKey: today,
              action: { in: Array.from(wantedActions) },
            },
            select: { action: true, postId: true },
          });
          const distinctPerAction: Record<string, Set<string>> = {};
          // Null postId rows count once each (using row id as key not available — track null count separately)
          const nullCountPerAction: Record<string, number> = {};
          for (const r of rows) {
            if (r.postId === null) {
              nullCountPerAction[r.action] =
                (nullCountPerAction[r.action] ?? 0) + 1;
            } else {
              if (!distinctPerAction[r.action]) {
                distinctPerAction[r.action] = new Set();
              }
              distinctPerAction[r.action].add(r.postId);
            }
          }
          for (const action of wantedActions) {
            const bucket = bucketByAction.get(action);
            if (!bucket) continue;
            const distinct =
              (distinctPerAction[action]?.size ?? 0) +
              (nullCountPerAction[action] ?? 0);
            countByType[bucket] = distinct;
          }
        } else {
          // Raw count via findMany (avoids fragile groupBy typing)
          const rows = await prisma.socialActionLog.findMany({
            where: {
              userId,
              dateKey: today,
              action: { in: Array.from(wantedActions) },
            },
            select: { action: true },
          });
          const counts: Record<string, number> = {};
          for (const r of rows) {
            counts[r.action] = (counts[r.action] ?? 0) + 1;
          }
          for (const [action, n] of Object.entries(counts)) {
            const bucket = bucketByAction.get(action);
            if (!bucket) continue;
            countByType[bucket] = n;
          }
        }
      }
    }
  }

  return countByType;
}
