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
import { prisma } from "@/lib/prisma";
import { SubmissionStatus, TaskType } from "@/generated/prisma/client";
import { getSocialEarningConfig } from "@/lib/social-earning";
import { getUserDayContext } from "@/lib/user-day";

const TASK_TYPE_VALUES = new Set(Object.values(TaskType));

interface MissionItemForCount {
  taskType: string;
}

export interface ActiveMissionItem {
  id: string;
  taskType: string;
  targetCount: number;
  description: string | null;
  xpPerComplete: number;
  pointsPerComplete: number;
}
export interface ActiveMission {
  id: string;
  name: string;
  items: ActiveMissionItem[];
}

/**
 * The highest tier-qualifying active daily mission template (with items) for a
 * user, or null. Shared by /daily-mission/{today,claim}, rail-widgets, and the
 * task-start gate so they all resolve the same mission.
 */
export async function getActiveMissionForUser(
  accessLevel: number,
  level: number
): Promise<ActiveMission | null> {
  const mission = await prisma.dailyMissionTemplate.findFirst({
    where: {
      requiredAccessLevel: { lte: accessLevel },
      isActive: true,
      requiredLevel: { lte: level },
    },
    orderBy: [
      { requiredAccessLevel: "desc" },
      { order: "asc" },
      { createdAt: "desc" },
    ],
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!mission) return null;
  return mission as unknown as ActiveMission;
}

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
    const t = s.task.type;
    countByType[t] = (countByType[t] ?? 0) + 1;
    if (s.task.boardId) {
      countByType.BOARD = (countByType.BOARD ?? 0) + 1;
    }
  }

  // Source 2: SocialActionLog counts (new — admin-gated)
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
