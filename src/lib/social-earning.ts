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
import {
  parseSocialEarningConfig,
  RATIO_UNIT,
  SOCIAL_EARNING_CATEGORY,
  type PerSideRule,
  type SocialAction,
  type SocialEarningConfig,
} from "@/lib/social-actions";

// Re-exported so existing importers keep working.
export type { SocialAction, SocialEarningConfig } from "@/lib/social-actions";

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
  /**
   * Force the ledger reference for the RECIPIENT only. Legacy — prefer
   * `eventKey`, which applies to both sides.
   */
  referenceOverride?: string;
  /**
   * Uniquely identifies this occurrence when the default reference isn't unique
   * enough. Without it, repeatable actions between the same two users on the
   * same post (donations, above all) collapse to one reference and only ever pay
   * once. Applied to BOTH sides — `referenceOverride` only ever reached the
   * recipient, which is why the donor side of a repeat donation never paid.
   */
  eventKey?: string;
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

const CATEGORY = SOCIAL_EARNING_CATEGORY;

/**
 * The `SocialActionLog.action` written for the ACTOR of each award.
 *
 * All eight are mapped so any activity can drive a ratio. The log write is
 * separately gated — see `MISSION_LOG_ACTIONS`.
 */
const ACTOR_LOG_ACTION: Record<SocialAction, string> = {
  POST_CREATE: "POST_CREATED",
  LIKE_RECEIVED: "LIKE_GIVEN",
  COMMENT_RECEIVED: "COMMENT_GIVEN",
  VOTE_RECEIVED: "VOTE_GIVEN",
  SHARE_RECEIVED: "SHARE_GIVEN",
  VIEW_RECEIVED: "VIEW_GIVEN",
  MENTION_RECEIVED: "MENTION_GIVEN",
  DONATION_RECEIVED: "DONATION_GIVEN",
};

/**
 * Only these feed a daily-mission bucket (see `socialBucketToLogAction` in
 * lib/daily-mission-progress.ts). Logging anything else "for missions" is pure
 * write amplification — and `countTowardDailyMissions` defaults to ON, so
 * without this gate simply mapping VIEW_RECEIVED above would start writing one
 * row per post view for the entire platform.
 */
const MISSION_LOG_ACTIONS = new Set([
  "POST_CREATED",
  "LIKE_GIVEN",
  "COMMENT_GIVEN",
  "SHARE_GIVEN",
  "VOTE_GIVEN",
]);

let _cached: { value: SocialEarningConfig; ts: number } | null = null;
const CACHE_MS = 30_000;

export async function getSocialEarningConfig(): Promise<SocialEarningConfig> {
  if (_cached && Date.now() - _cached.ts < CACHE_MS) return _cached.value;

  const rows = await prisma.systemSetting.findMany({
    where: { category: CATEGORY },
  });
  // Parsing lives in the prisma-free shared module so the admin form, the API
  // route and a test script all resolve config identically.
  const cfg = parseSocialEarningConfig(
    new Map(rows.map((r) => [r.key, r.value]))
  );

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

/** `ready` = credit now. `reference` set = this is a ratio milestone payout. */
type RatioGate = { ready: boolean; reference?: string };

/**
 * Decide whether this event pays now, advancing the ratio counter if there is
 * one.
 *
 * `perCount === 1` (the default, and every activity out of the box) returns
 * immediately with **zero queries**, so turning the feature off costs nothing on
 * the like/comment hot path.
 *
 * The day key comes from the user being PAID — the author's local midnight for
 * the recipient side, the engager's for the actor. That is the whole reason this
 * can't be read off `SocialActionLog`, whose `dateKey` is always the actor's.
 */
async function resolveRatio(opts: {
  userId: string;
  role: "recipient" | "actor";
  action: SocialAction;
  rule: PerSideRule;
  countsThisEvent: boolean;
}): Promise<RatioGate> {
  const { userId, role, action, rule, countsThisEvent } = opts;
  const perCount = Math.max(1, Math.floor(rule.perCount ?? 1));

  // Flat payout, or the side is off — let creditOne decide and report why.
  if (perCount === 1 || !rule.enabled) return { ready: true };

  // A repeat on a post this actor already engaged: no progress, no payout.
  if (!countsThisEvent) return { ready: false };

  const dateKey =
    rule.window === "daily" ? (await getUserDayContext(userId)).dayKey : "*";

  // The upsert returns the post-increment count, so there is no COUNT query.
  let row;
  try {
    row = await prisma.socialRatioTally.upsert({
      where: {
        userId_role_action_window_dateKey: {
          userId,
          role,
          action,
          window: rule.window,
          dateKey,
        },
      },
      create: { userId, role, action, window: rule.window, dateKey, count: 1 },
      update: { count: { increment: 1 } },
      select: { id: true, count: true },
    });
  } catch {
    // Two concurrent creates raced on the unique key — retry once as an update.
    try {
      row = await prisma.socialRatioTally.update({
        where: {
          userId_role_action_window_dateKey: {
            userId,
            role,
            action,
            window: rule.window,
            dateKey,
          },
        },
        data: { count: { increment: 1 } },
        select: { id: true, count: true },
      });
    } catch (err) {
      console.error("[social-earning] ratio tally failed:", err);
      return { ready: false };
    }
  }

  if (row.count < perCount) return { ready: false };

  // Claim the milestone atomically. `count >= perCount` in the WHERE means only
  // one of N concurrent requests can win; the loser gets zero rows back.
  // Subtracting rather than zeroing keeps any overshoot, so nothing is lost.
  const claimed = await prisma.$queryRaw<{ paidCount: number }[]>`
    UPDATE "SocialRatioTally"
       SET "count" = "count" - ${perCount},
           "paidCount" = "paidCount" + 1,
           "updatedAt" = now()
     WHERE "id" = ${row.id} AND "count" >= ${perCount}
    RETURNING "paidCount"
  `;
  const paidCount = claimed[0]?.paidCount;
  if (paidCount == null) return { ready: false };

  // `paidCount` is monotonic and persisted, so this reference is never reused —
  // unlike the old `distinct / perCount` batch index, which shifted whenever an
  // admin edited perCount or log retention pruned rows underneath it.
  return {
    ready: true,
    reference: `social_ratio_${role}_${action.toLowerCase()}_${userId}_${rule.window}_${dateKey}_${paidCount}`,
  };
}

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

  // Cheap pre-flight duplicate check. The real guarantee is the DB constraint
  // Transaction @@unique([userId, reference]) — this just avoids doing the work
  // when we already know the answer.
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

      // Views deliberately never notify. A popular post is seen thousands of
      // times, so one notification per view buries every real notification the
      // user has and grows the Notification table without bound — which is also
      // what makes the unread badge slow. The POINTS are unaffected; only the
      // per-view notification row is skipped.
      const notify = action !== "VIEW_RECEIVED";
      if (notify && (allowPoints > 0 || allowXp > 0)) {
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
  const {
    postOwnerUserId,
    actorUserId,
    action,
    postId,
    referenceOverride,
    eventKey,
  } = args;

  const result: AwardResult = {
    recipient: { points: 0, xp: 0, skipped: "no_recipient" },
    actor: { points: 0, xp: 0, skipped: "no_recipient" },
  };

  const cfg = await getSocialEarningConfig();
  const recipRule = cfg.perActivity[action].recipient;
  const actorRule = cfg.perActivity[action].actor;
  const ratioOn = (r: PerSideRule) => r.enabled && r.perCount > 1;
  const anyRatio = ratioOn(recipRule) || ratioOn(actorRule);
  const logAction = ACTOR_LOG_ACTION[action];

  // Does THIS event add to a ratio counter?
  //
  // For `distinct_post` activities, repeating an action on a post the actor has
  // already engaged counts once — otherwise like → unlike → like would drive
  // both sides' counters. The probe runs only when a ratio is actually switched
  // on, so the normal path costs nothing, and it must happen BEFORE the log
  // write below or the row we're about to insert would match itself.
  let countsThisEvent = true;
  if (
    anyRatio &&
    RATIO_UNIT[action] === "distinct_post" &&
    postId &&
    actorUserId &&
    logAction
  ) {
    const prior = await prisma.socialActionLog.findFirst({
      where: { userId: actorUserId, action: logAction, postId },
      select: { id: true },
    }); // served by @@index([userId, action, postId])
    countsThisEvent = !prior;
  }

  // Log the actor's action. Two independent reasons to write a row:
  //  - daily missions read this table (only for the five actions that feed a
  //    mission bucket — logging the rest would be pure write amplification, and
  //    VIEW_GIVEN in particular would mean a row per post view platform-wide);
  //  - a ratio is configured for this action, and the counter needs the history
  //    to dedup repeats.
  // Deliberately ahead of the master-switch check: mission progress is decoupled
  // from earning.
  const logForMissions =
    cfg.countTowardDailyMissions && !!logAction && MISSION_LOG_ACTIONS.has(logAction);
  if ((logForMissions || anyRatio) && actorUserId && logAction) {
    // Key by the actor's LOCAL day so daily-mission progress reads it with the
    // same boundary (buildDailyProgress uses the same context).
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

  if (!cfg.enabled) {
    return {
      recipient: { points: 0, xp: 0, skipped: "disabled" },
      actor: { points: 0, xp: 0, skipped: "disabled" },
    };
  }

  // Recipient credit
  if (postOwnerUserId) {
    // The self-guard must stay ahead of the ratio counter, or liking your own
    // post would pump your own milestone without ever paying.
    if (actorUserId && actorUserId === postOwnerUserId && action !== "POST_CREATE") {
      result.recipient = { points: 0, xp: 0, skipped: "self" };
    } else {
      const gate = await resolveRatio({
        userId: postOwnerUserId,
        role: "recipient",
        action,
        rule: recipRule,
        countsThisEvent,
      });
      if (!gate.ready) {
        result.recipient = { points: 0, xp: 0, skipped: "duplicate" };
      } else {
        result.recipient = await creditOne({
          userId: postOwnerUserId,
          role: "recipient",
          rule: recipRule,
          cfg,
          action,
          // A milestone is earned across ALL the author's posts, so it isn't
          // tied to one — which also means `capPerPost` doesn't limit it. Only
          // the daily cap does. The admin UI says so.
          postId: gate.reference ? null : postId,
          sourceUserId: actorUserId,
          referenceOverride:
            gate.reference ??
            referenceOverride ??
            (eventKey ? `social_${action.toLowerCase()}_recipient_${eventKey}` : undefined),
        });
      }
    }
  }

  // Actor credit — skipped when actor === recipient (e.g. POST_CREATE is one-sided)
  if (actorUserId) {
    if (postOwnerUserId && actorUserId === postOwnerUserId) {
      result.actor = { points: 0, xp: 0, skipped: "self" };
    } else {
      const gate = await resolveRatio({
        userId: actorUserId,
        role: "actor",
        action,
        rule: actorRule,
        countsThisEvent,
      });
      if (!gate.ready) {
        result.actor = { points: 0, xp: 0, skipped: "duplicate" };
      } else {
        result.actor = await creditOne({
          userId: actorUserId,
          role: "actor",
          rule: actorRule,
          cfg,
          action,
          postId: gate.reference ? null : postId,
          sourceUserId: postOwnerUserId,
          // `referenceOverride` deliberately isn't forwarded here — it is
          // recipient-only by contract. `eventKey` is the both-sides version.
          referenceOverride:
            gate.reference ??
            (eventKey ? `social_${action.toLowerCase()}_actor_${eventKey}` : undefined),
        });
      }
    }
  }


  return result;
}
