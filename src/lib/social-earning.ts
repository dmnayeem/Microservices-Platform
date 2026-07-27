/**
 * Social engagement earning helper.
 *
 * Awards points + XP to BOTH sides of an engagement:
 *   - The "recipient" (the post author who received the engagement).
 *   - The "actor" (the user who performed the action — liker / commenter / sharer / voter).
 *
 * Each side has its own admin-tunable enable, points, and xp setting per action.
 * Defaults keep the actor side OFF so day-one behaviour matches the legacy
 * recipient-only system.
 *
 * Idempotency: every credit writes a Transaction with a deterministic
 * `reference` that includes a `_recipient_` or `_actor_` segment so the two
 * sides cannot collide. POST_CREATE keeps its date-keyed once-per-day reference.
 */
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext } from "@/lib/user-day";
import {
  TransactionStatus,
  TransactionType,
  NotificationType,
} from "@/generated/prisma/client";

export type SocialAction =
  | "POST_CREATE"
  | "VIEW_RECEIVED"
  | "LIKE_RECEIVED"
  | "VOTE_RECEIVED"
  | "COMMENT_RECEIVED"
  | "SHARE_RECEIVED"
  | "DONATION_RECEIVED"
  | "MENTION_RECEIVED";

export type SkipReason =
  | "disabled"
  | "self"
  | "min_age"
  | "banned"
  | "post_cap"
  | "daily_cap"
  | "daily_xp_cap"
  | "duplicate"
  | "no_recipient";

export interface AwardArgs {
  postOwnerUserId: string | null;
  actorUserId: string | null;
  action: SocialAction;
  postId?: string | null;
  referenceOverride?: string;
}

export interface SideResult {
  points: number;
  xp: number;
  skipped?: SkipReason;
}

export interface AwardResult {
  recipient: SideResult;
  actor: SideResult;
}

interface PerSideRule {
  enabled: boolean;
  points: number;
  xp: number;
  /** Actor side only: award `points` once per this many DISTINCT-post actions
   *  (lifetime). 1 = flat per action (legacy). e.g. 100 → +points per 100 likes. */
  perCount?: number;
}

interface SocialEarningConfig {
  enabled: boolean;
  perActivity: Record<
    SocialAction,
    { recipient: PerSideRule; actor: PerSideRule }
  >;
  dailyCapPerUser: number;
  dailyXpCapPerUser: number;
  capPerPost: number;
  minAccountAgeHours: number;
  countTowardDailyMissions: boolean;
  missionDistinctPost: boolean;
}

const DEFAULTS: SocialEarningConfig = {
  enabled: true,
  perActivity: {
    POST_CREATE: {
      recipient: { enabled: true, points: 5, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    VIEW_RECEIVED: {
      recipient: { enabled: true, points: 0, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    LIKE_RECEIVED: {
      recipient: { enabled: true, points: 1, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    VOTE_RECEIVED: {
      recipient: { enabled: true, points: 1, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    COMMENT_RECEIVED: {
      recipient: { enabled: true, points: 2, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    SHARE_RECEIVED: {
      recipient: { enabled: true, points: 3, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    DONATION_RECEIVED: {
      recipient: { enabled: false, points: 0, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
    MENTION_RECEIVED: {
      recipient: { enabled: true, points: 1, xp: 0 },
      actor: { enabled: false, points: 0, xp: 0 },
    },
  },
  dailyCapPerUser: 500,
  dailyXpCapPerUser: 1000,
  capPerPost: 100,
  minAccountAgeHours: 24,
  countTowardDailyMissions: true,
  missionDistinctPost: true,
};

const CATEGORY = "social_earning";

const ACTOR_LOG_ACTION: Partial<Record<SocialAction, string>> = {
  POST_CREATE: "POST_CREATED",
  LIKE_RECEIVED: "LIKE_GIVEN",
  COMMENT_RECEIVED: "COMMENT_GIVEN",
  VOTE_RECEIVED: "VOTE_GIVEN",
  SHARE_RECEIVED: "SHARE_GIVEN",
};

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return fallback;
}

let _cached: { value: SocialEarningConfig; ts: number } | null = null;
const CACHE_MS = 30_000;

export async function getSocialEarningConfig(): Promise<SocialEarningConfig> {
  if (_cached && Date.now() - _cached.ts < CACHE_MS) return _cached.value;

  const rows = await prisma.systemSetting.findMany({
    where: { category: CATEGORY },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const cfg: SocialEarningConfig = {
    enabled: asBoolean(map.get("social_earning.enabled"), DEFAULTS.enabled),
    perActivity: { ...DEFAULTS.perActivity },
    dailyCapPerUser: asNumber(
      map.get("social_earning.daily_cap_per_user"),
      DEFAULTS.dailyCapPerUser
    ),
    dailyXpCapPerUser: asNumber(
      map.get("social_earning.daily_xp_cap_per_user"),
      DEFAULTS.dailyXpCapPerUser
    ),
    capPerPost: asNumber(
      map.get("social_earning.cap_per_post"),
      DEFAULTS.capPerPost
    ),
    minAccountAgeHours: asNumber(
      map.get("social_earning.min_account_age_hours"),
      DEFAULTS.minAccountAgeHours
    ),
    countTowardDailyMissions: asBoolean(
      map.get("social_earning.count_toward_daily_missions"),
      DEFAULTS.countTowardDailyMissions
    ),
    missionDistinctPost: asBoolean(
      map.get("social_earning.mission_distinct_post"),
      DEFAULTS.missionDistinctPost
    ),
  };
  for (const action of Object.keys(DEFAULTS.perActivity) as SocialAction[]) {
    const k = action.toLowerCase();
    const def = DEFAULTS.perActivity[action];
    cfg.perActivity[action] = {
      recipient: {
        enabled: asBoolean(
          map.get(`social_earning.${k}_enabled`),
          def.recipient.enabled
        ),
        points: asNumber(
          map.get(`social_earning.${k}_points`),
          def.recipient.points
        ),
        xp: asNumber(
          map.get(`social_earning.${k}_recipient_xp`),
          def.recipient.xp
        ),
      },
      actor: {
        enabled: asBoolean(
          map.get(`social_earning.${k}_actor_enabled`),
          def.actor.enabled
        ),
        points: asNumber(
          map.get(`social_earning.${k}_actor_points`),
          def.actor.points
        ),
        xp: asNumber(
          map.get(`social_earning.${k}_actor_xp`),
          def.actor.xp
        ),
        // Every N distinct-post actions → `points`. 1 = flat per action.
        perCount: Math.max(
          1,
          Math.floor(asNumber(map.get(`social_earning.${k}_actor_per_count`), 1))
        ),
      },
    };
  }

  _cached = { value: cfg, ts: Date.now() };
  return cfg;
}

export function invalidateSocialEarningCache() {
  _cached = null;
}


const ACTION_DESCRIPTION_RECIPIENT: Record<SocialAction, string> = {
  POST_CREATE: "Created a post",
  VIEW_RECEIVED: "Earned from a view on your post",
  LIKE_RECEIVED: "Earned from a like on your post",
  VOTE_RECEIVED: "Earned from a vote on your poll",
  COMMENT_RECEIVED: "Earned from a comment on your post",
  SHARE_RECEIVED: "Earned from a share of your post",
  DONATION_RECEIVED: "Earned from a donation",
  MENTION_RECEIVED: "Mentioned in a post / comment",
};

const ACTION_DESCRIPTION_ACTOR: Record<SocialAction, string> = {
  POST_CREATE: "Created a post",
  VIEW_RECEIVED: "Viewed a post",
  LIKE_RECEIVED: "Liked a post",
  VOTE_RECEIVED: "Voted on a poll",
  COMMENT_RECEIVED: "Commented on a post",
  SHARE_RECEIVED: "Shared a post",
  DONATION_RECEIVED: "Made a donation",
  MENTION_RECEIVED: "Mentioned someone",
};

interface CreditCtx {
  userId: string;
  role: "recipient" | "actor";
  rule: PerSideRule;
  cfg: SocialEarningConfig;
  action: SocialAction;
  postId: string | null | undefined;
  sourceUserId: string | null | undefined;
  referenceOverride?: string;
}

async function creditOne(ctx: CreditCtx): Promise<SideResult> {
  const { userId, role, rule, cfg, action, postId, sourceUserId } = ctx;

  // Global enable is the master switch for this action.
  if (!rule.enabled) {
    return { points: 0, xp: 0, skipped: "disabled" };
  }

  // User must be ACTIVE and old enough
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      package: {
        select: {
          socialEarningMultiplier: true,
          socialEarningEnabled: true,
          socialEarningConfig: true,
        },
      },
    },
  });
  if (!user || user.status !== "ACTIVE") {
    return { points: 0, xp: 0, skipped: "banned" };
  }
  const ageHours =
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < cfg.minAccountAgeHours) {
    return { points: 0, xp: 0, skipped: "min_age" };
  }

  const pkg = (
    user as unknown as {
      package: {
        socialEarningMultiplier: number;
        socialEarningEnabled: boolean;
        socialEarningConfig: unknown;
      } | null;
    }
  ).package;

  // Plan-level hard gate — this package earns nothing socially.
  if (pkg && pkg.socialEarningEnabled === false) {
    return { points: 0, xp: 0, skipped: "disabled" };
  }

  // Per-plan multiplier (defaults to 1× if no plan).
  const planMultiplier = pkg?.socialEarningMultiplier ?? 1;

  // Per-package points override (recipient side): the plan can define its own
  // points per action, replacing the global base. null/missing → global.
  let basePoints = rule.points;
  if (
    role === "recipient" &&
    pkg?.socialEarningConfig &&
    typeof pkg.socialEarningConfig === "object"
  ) {
    const KEY: Partial<Record<SocialAction, string>> = {
      LIKE_RECEIVED: "likePoints",
      COMMENT_RECEIVED: "commentPoints",
      POST_CREATE: "postPoints",
      SHARE_RECEIVED: "sharePoints",
      VOTE_RECEIVED: "votePoints",
    };
    const key = KEY[action];
    const override = key
      ? (pkg.socialEarningConfig as Record<string, unknown>)[key]
      : undefined;
    if (typeof override === "number" && override >= 0) basePoints = override;
  }

  // Nothing to pay for this action/plan.
  if (basePoints <= 0 && rule.xp <= 0) {
    return { points: 0, xp: 0, skipped: "disabled" };
  }

  // Per-post cap (only counted against recipient credits — the post is what fills up)
  let postEarned = 0;
  if (postId && role === "recipient") {
    const p = await prisma.post.findUnique({
      where: { id: postId },
      select: { socialEarnings: true },
    });
    if (!p) return { points: 0, xp: 0, skipped: "no_recipient" };
    postEarned = p.socialEarnings;
    if (postEarned >= cfg.capPerPost) {
      return { points: 0, xp: 0, skipped: "post_cap" };
    }
  }

  // Daily caps reset at the credited user's LOCAL midnight (country-based).
  const day = await getUserDayContext(userId);
  const todayStart = day.startOfDayUtc;

  // Daily points cap
  const dailyPts = await prisma.transaction.aggregate({
    where: {
      userId,
      reference: { startsWith: "social_" },
      createdAt: { gte: todayStart },
    },
    _sum: { points: true },
  });
  const todayPoints = Math.max(0, dailyPts._sum.points ?? 0);

  // Daily XP cap (sum metadata.xp on today's social_* rows)
  let todayXp = 0;
  if (cfg.dailyXpCapPerUser > 0) {
    const todayRows = await prisma.transaction.findMany({
      where: {
        userId,
        reference: { startsWith: "social_" },
        createdAt: { gte: todayStart },
      },
      select: { metadata: true },
    });
    for (const r of todayRows) {
      const md = r.metadata as { xp?: number } | null;
      if (md && typeof md.xp === "number") todayXp += md.xp;
    }
  }

  // Cap points (apply plan multiplier first, then daily/post caps)
  let allowPoints = Math.max(0, Math.floor(basePoints * planMultiplier));
  if (allowPoints > 0) {
    if (postId && role === "recipient") {
      allowPoints = Math.min(allowPoints, cfg.capPerPost - postEarned);
    }
    allowPoints = Math.min(allowPoints, Math.max(0, cfg.dailyCapPerUser - todayPoints));
  }
  if (allowPoints > 0 && cfg.dailyCapPerUser > 0 && todayPoints >= cfg.dailyCapPerUser) {
    allowPoints = 0;
  }

  // Cap xp (plan multiplier applies here too)
  let allowXp = Math.max(0, Math.floor(rule.xp * planMultiplier));
  if (allowXp > 0 && cfg.dailyXpCapPerUser > 0) {
    allowXp = Math.min(allowXp, Math.max(0, cfg.dailyXpCapPerUser - todayXp));
  }

  if (allowPoints <= 0 && allowXp <= 0) {
    if (cfg.dailyCapPerUser > 0 && todayPoints >= cfg.dailyCapPerUser) {
      return { points: 0, xp: 0, skipped: "daily_cap" };
    }
    if (cfg.dailyXpCapPerUser > 0 && todayXp >= cfg.dailyXpCapPerUser) {
      return { points: 0, xp: 0, skipped: "daily_xp_cap" };
    }
    return { points: 0, xp: 0, skipped: "disabled" };
  }

  // Idempotent reference
  const reference =
    ctx.referenceOverride ??
    (action === "POST_CREATE"
      ? `social_post_${role}_${userId}_${day.dayKey}`
      : `social_${action.toLowerCase()}_${role}_${postId ?? "_"}_${sourceUserId ?? "_"}`);

  // Pre-flight duplicate check (the reference field is not unique on Transaction
  // but we treat it as logically unique for idempotency).
  const dup = await prisma.transaction.findFirst({
    where: { reference },
    select: { id: true },
  });
  if (dup) return { points: 0, xp: 0, skipped: "duplicate" };

  const description =
    role === "recipient"
      ? ACTION_DESCRIPTION_RECIPIENT[action]
      : ACTION_DESCRIPTION_ACTOR[action];

  // Serialize concurrent credits for this user — Transaction.reference has no
  // DB unique constraint, so the pre-flight check above can race. Lock the user
  // row and re-check the duplicate INSIDE the lock before crediting, so two
  // racing engagements (e.g. rapid like/unlike/like) can't both pay out.
  const pointsPerUsd = await getPointsPerUsd();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const raceDup = await tx.transaction.findFirst({
        where: { reference },
        select: { id: true },
      });
      if (raceDup) return null;

      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points: allowPoints,
          amount: allowPoints / pointsPerUsd,
          description,
          reference,
          metadata: {
            action,
            role,
            postId: postId ?? null,
            sourceUserId: sourceUserId ?? null,
            xp: allowXp,
          },
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          pointsBalance: { increment: allowPoints },
          totalEarnings: { increment: allowPoints / pointsPerUsd },
          xp: { increment: allowXp },
        },
      });

      if (postId && role === "recipient" && allowPoints > 0) {
        await tx.post.update({
          where: { id: postId },
          data: { socialEarnings: { increment: allowPoints } },
        });
      }

      if (allowPoints > 0 || allowXp > 0) {
        const parts: string[] = [];
        if (allowPoints > 0) parts.push(`+${allowPoints} pts`);
        if (allowXp > 0) parts.push(`+${allowXp} XP`);
        await tx.notification.create({
          data: {
            userId,
            type: NotificationType.WALLET,
            title: parts.join(" · "),
            message: description,
            data: {
              action,
              role,
              postId: postId ?? null,
              sourceUserId: sourceUserId ?? null,
              points: allowPoints,
              xp: allowXp,
            },
          },
        });
      }

      // Note: SocialActionLog (daily-mission counting) is written in
      // awardSocialEarning, independent of these earning gates/caps.
      return { points: allowPoints, xp: allowXp };
    });
    if (!result) return { points: 0, xp: 0, skipped: "duplicate" };
    return result;
  } catch (err) {
    console.error("[social-earning] credit failed:", err);
    return { points: 0, xp: 0, skipped: "duplicate" };
  }
}

/**
 * Award social engagement rewards. Handles both recipient (post owner) and
 * actor (engaging user) credits. Safe to call from anywhere; never throws on
 * business-rule misses, only on infra errors.
 *
 * For POST_CREATE the post owner IS the actor — actor side is short-circuited
 * as `self` to avoid double-credit; the recipient credit is the only payout.
 */
export async function awardSocialEarning(
  args: AwardArgs
): Promise<AwardResult> {
  const { postOwnerUserId, actorUserId, action, postId, referenceOverride } = args;

  const result: AwardResult = {
    recipient: { points: 0, xp: 0, skipped: "no_recipient" },
    actor: { points: 0, xp: 0, skipped: "no_recipient" },
  };

  const cfg = await getSocialEarningConfig();

  // Daily-mission counting is DECOUPLED from earning: log the actor's action
  // whenever mission-counting is on, regardless of whether social earning is
  // enabled/disabled, its per-action rule, or the daily caps. This is what
  // makes SOCIAL_LIKE/COMMENT/POST/SHARE/VOTE missions actually progress
  // (for POST_CREATE the actor === the poster). One row per action call; the
  // mission progress builder de-dupes by distinct post when configured.
  //
  // Also log when this action's actor batch reward is on (perCount > 1) — the
  // batch milestone counter reads SocialActionLog, so it must stay populated
  // even if daily-mission counting is off.
  const actorRule = cfg.perActivity[action].actor;
  const actorPerCount = Math.max(1, Math.floor(actorRule.perCount ?? 1));
  const batchRewardOn = actorRule.enabled && actorPerCount > 1;
  if ((cfg.countTowardDailyMissions || batchRewardOn) && actorUserId) {
    const logAction = ACTOR_LOG_ACTION[action];
    if (logAction) {
      // Key the log by the actor's LOCAL day so daily-mission progress reads it
      // with the same boundary (buildDailyProgress uses the same context).
      const { dayKey: dateKey } = await getUserDayContext(actorUserId);
      try {
        await prisma.socialActionLog.create({
          data: {
            userId: actorUserId,
            action: logAction,
            postId: postId ?? null,
            dateKey,
          },
        });
      } catch (err) {
        console.error("[social-earning] mission log failed:", err);
      }
    }
  }

  if (!cfg.enabled) {
    return {
      recipient: { points: 0, xp: 0, skipped: "disabled" },
      actor: { points: 0, xp: 0, skipped: "disabled" },
    };
  }

  // Recipient credit
  if (postOwnerUserId) {
    if (actorUserId && actorUserId === postOwnerUserId && action !== "POST_CREATE") {
      result.recipient = { points: 0, xp: 0, skipped: "self" };
    } else {
      result.recipient = await creditOne({
        userId: postOwnerUserId,
        role: "recipient",
        rule: cfg.perActivity[action].recipient,
        cfg,
        action,
        postId,
        sourceUserId: actorUserId,
        referenceOverride,
      });
    }
  }

  // Actor credit — skipped when actor === recipient (e.g. POST_CREATE is one-sided)
  if (actorUserId) {
    if (postOwnerUserId && actorUserId === postOwnerUserId) {
      result.actor = { points: 0, xp: 0, skipped: "self" };
    } else if (
      batchRewardOn &&
      postId &&
      (action === "LIKE_RECEIVED" || action === "COMMENT_RECEIVED")
    ) {
      // Milestone reward: pay `points` once per `perCount` DISTINCT posts the
      // actor has engaged (lifetime), so like/unlike-spam on one post can't farm
      // it. The current action was just logged above, so it's included.
      const logAction = ACTOR_LOG_ACTION[action]!;
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "postId") AS count
        FROM "SocialActionLog"
        WHERE "userId" = ${actorUserId}
          AND "action" = ${logAction}
          AND "postId" IS NOT NULL
      `;
      const distinct = Number(rows[0]?.count ?? 0);
      if (distinct > 0 && distinct % actorPerCount === 0) {
        const batchIndex = distinct / actorPerCount;
        result.actor = await creditOne({
          userId: actorUserId,
          role: "actor",
          rule: {
            enabled: true,
            points: actorRule.points,
            xp: actorRule.xp,
          },
          cfg,
          action,
          postId: null, // milestone reward isn't tied to a single post
          sourceUserId: postOwnerUserId,
          referenceOverride: `social_${action.toLowerCase()}_actorbatch_${actorUserId}_${batchIndex}`,
        });
      } else {
        // Not a milestone crossing on this action — no actor payout yet.
        result.actor = { points: 0, xp: 0, skipped: "duplicate" };
      }
    } else {
      result.actor = await creditOne({
        userId: actorUserId,
        role: "actor",
        rule: cfg.perActivity[action].actor,
        cfg,
        action,
        postId,
        sourceUserId: postOwnerUserId,
      });
    }
  }

  return result;
}
