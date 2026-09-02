import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { EventActionType, Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { EVENTS_ACTIVE_TAG, MISSIONS_ACTIVE_TAG } from "@/lib/cache-tags";
import { audienceWhere, type AudienceCriteria } from "@/lib/audience";
import {
  matchesTaskAudience,
  hasAudienceTargeting,
  type TaskAudience,
} from "@/lib/task-targeting";
import { getEffectivePackage } from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { notifyUser } from "@/lib/notify";
import { parseEventTiers } from "@/lib/events-shared";

/**
 * The ONLY place goal progress is written — for BOTH Events and Missions.
 *
 * Progress used to be recomputed on every read by counting rows in shared
 * activity tables over `[startAt … now]`. Three things were wrong with that,
 * and all three are fixed by writing a counter at the action site instead:
 *
 *  1. **It was retroactive.** There was no per-user baseline, so everything a
 *     user had already done since the goal's start date counted the moment it
 *     was published. Publish this evening with a start-of-day date and an
 *     active user is already finished — the Claim button is green before they
 *     have seen it.
 *  2. **It couldn't tell actions apart.** `SOCIAL_ACTION` counted every row in
 *     `SocialActionLog` with no `action` filter, so a goal meant as "share your
 *     referral link" was satisfied by one unrelated feed like.
 *  3. **It was farmable.** `SocialActionLog` has no unique constraint and the
 *     unlike handler never deletes its row, so like → unlike → like wrote a new
 *     row every time.
 *
 * Here every credited action is one log row under a `@@unique(goal, user,
 * dedupKey)`. That constraint — not application logic — is what makes each rule
 * true.
 *
 * ## Why one engine for two products
 *
 * Events and Missions are deliberately different products (marketing pushes vs.
 * a big-prize grind) but they count the same real actions with the same
 * anti-abuse requirements. Two engines would mean two chances to get the dedup
 * rule wrong, and the action sites would have to remember to call both. One
 * call credits everything.
 *
 * ## Cost
 *
 * This runs on the feed like/comment/share path, the highest-frequency write in
 * the app. **When no active goal wants the action, this function issues zero
 * database queries** — it is a filter over a cached array and returns. Never
 * add a query above that check.
 */

/** What an action site emits. Narrower than `EventActionType`, which has aliases. */
export type GoalActionKey =
  | "feed_like"
  | "feed_comment"
  | "feed_share"
  | "feed_post"
  | "feed_vote"
  | "task_approved"
  | "quiz_approved"
  | "board_claim"
  | "lottery_ticket"
  | "referral_signup";

/** @deprecated Old name from when this only handled events. */
export type EventActionKey = GoalActionKey;

const FEED_KEYS: GoalActionKey[] = [
  "feed_like",
  "feed_comment",
  "feed_share",
  "feed_post",
  "feed_vote",
];

/**
 * Which emitted keys satisfy each configured action type.
 *
 * `TEAM_ADD` and `SOCIAL_ACTION` are kept as aliases rather than migrated: an
 * enum value with no writer reads zero forever, which is precisely the bug
 * being fixed. Existing goals keep working; the admin forms hide them from
 * *new* ones.
 */
const ACCEPTS: Record<EventActionType, GoalActionKey[]> = {
  TEAM_ADD: ["referral_signup"],
  REFERRAL_SIGNUP: ["referral_signup"],
  // A finished Task Board counts as ONE task completion, and its individual
  // tasks count as none — the same rule the daily mission uses. A board is one
  // piece of work presented as one thing; letting its five tasks each tick a
  // "complete 3 tasks" goal pays the same effort twice. The action sites skip
  // board sub-tasks; `board_claim` is emitted once, by the claim route.
  TASK_COMPLETE: ["task_approved", "quiz_approved", "board_claim"],
  QUIZ_COMPLETE: ["quiz_approved"],
  LOTTERY_BUY: ["lottery_ticket"],
  FEED_LIKE: ["feed_like"],
  FEED_COMMENT: ["feed_comment"],
  FEED_SHARE: ["feed_share"],
  FEED_POST: ["feed_post"],
  FEED_VOTE: ["feed_vote"],
  SOCIAL_ACTION: FEED_KEYS,
  // Proof goals are claimed by uploading, never by an action.
  UPLOAD_PROOF: [],
};

type GoalKind = "event" | "mission";

interface ActiveGoal {
  kind: GoalKind;
  id: string;
  title: string;
  actionType: EventActionType;
  threshold: number;
  tiers: Prisma.JsonValue;
  /** Missions may be open-ended; events always have a window. */
  startAt: Date | null;
  endAt: Date | null;
  requiredAccessLevel: number;
  /** Missions only — events have no user-level gate. */
  requiredLevel: number;
  /** Events: JSON AudienceCriteria. Missions: discrete columns (see below). */
  audienceJson: Prisma.JsonValue;
  targeting: TaskAudience | null;
  dailyCap: number;
  link: string;
}

const TARGET_SELECT = {
  countries: true,
  genders: true,
  regions: true,
  divisions: true,
  districts: true,
  subDistricts: true,
  postalCodes: true,
  minAge: true,
  maxAge: true,
} as const;

const loadIndex = unstable_cache(
  async (): Promise<ActiveGoal[]> => {
    const now = new Date();
    const [events, missions] = await Promise.all([
      prisma.event.findMany({
        // Deliberately NOT filtered on `startAt <= now`: the window is checked
        // per-call against the cached row, so a goal that switches on at a
        // scheduled time needs no invalidation.
        where: { isActive: true, endAt: { gte: now } },
        select: {
          id: true,
          title: true,
          actionType: true,
          threshold: true,
          tiers: true,
          startAt: true,
          endAt: true,
          requiredAccessLevel: true,
          audience: true,
          dailyCap: true,
        },
        orderBy: { endAt: "asc" },
        take: 50,
      }),
      prisma.mission.findMany({
        where: {
          isActive: true,
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
        select: {
          id: true,
          title: true,
          actionType: true,
          targetValue: true,
          tiers: true,
          startAt: true,
          endAt: true,
          requiredAccessLevel: true,
          requiredLevel: true,
          dailyCap: true,
          ...TARGET_SELECT,
        },
        orderBy: { order: "asc" },
        take: 50,
      }),
    ]);

    return [
      ...events.map(
        (e): ActiveGoal => ({
          kind: "event",
          id: e.id,
          title: e.title,
          actionType: e.actionType,
          threshold: e.threshold,
          tiers: e.tiers,
          startAt: e.startAt,
          endAt: e.endAt,
          requiredAccessLevel: e.requiredAccessLevel,
          requiredLevel: 0,
          audienceJson: e.audience,
          targeting: null,
          dailyCap: e.dailyCap,
          link: "/events",
        })
      ),
      ...missions.map(
        (m): ActiveGoal => ({
          kind: "mission",
          id: m.id,
          title: m.title,
          actionType: m.actionType,
          threshold: m.targetValue,
          tiers: m.tiers,
          startAt: m.startAt,
          endAt: m.endAt,
          requiredAccessLevel: m.requiredAccessLevel,
          requiredLevel: m.requiredLevel,
          audienceJson: null,
          targeting: {
            countries: m.countries,
            genders: m.genders,
            regions: m.regions,
            divisions: m.divisions,
            districts: m.districts,
            subDistricts: m.subDistricts,
            postalCodes: m.postalCodes,
            minAge: m.minAge,
            maxAge: m.maxAge,
          },
          dailyCap: m.dailyCap,
          link: "/missions",
        })
      ),
    ];
  },
  ["goals:active-index"],
  { revalidate: 60, tags: [EVENTS_ACTIVE_TAG, MISSIONS_ACTIVE_TAG] }
);

/**
 * Last known good index, so a cache or database blip degrades to slightly stale
 * data instead of dropping progress. A total outage drops that request's
 * progress — the user's like still succeeds, which is the right trade.
 */
let lastGood: ActiveGoal[] | null = null;
let lastGoodAt = 0;
let memo: ActiveGoal[] | null = null;
let memoAt = 0;
const MEMO_MS = 10_000;
const STALE_OK_MS = 5 * 60_000;

async function getActiveGoalIndex(): Promise<ActiveGoal[]> {
  const now = Date.now();
  // A burst of likes on one warm instance shouldn't even touch the Data Cache.
  if (memo && now - memoAt < MEMO_MS) return memo;
  try {
    const rows = await loadIndex();
    memo = rows;
    memoAt = now;
    lastGood = rows;
    lastGoodAt = now;
    return rows;
  } catch {
    if (lastGood && now - lastGoodAt < STALE_OK_MS) return lastGood;
    return [];
  }
}

/**
 * The viewer attributes mission targeting needs, fetched at most once per
 * request. Only called when a targeted mission actually wants the action —
 * an untargeted mission costs nothing.
 */
const getGoalViewer = cache(async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      level: true,
      country: true,
      region: true,
      division: true,
      district: true,
      subDistrict: true,
      postalCode: true,
      gender: true,
      dateOfBirth: true,
    },
  })
);

export interface RecordUserActionArgs {
  /** Who earns the progress. For referrals this is the REFERRER. */
  userId: string;
  action: GoalActionKey;
  /** Post id / submission id / ticket number / referred user id. */
  targetId: string;
  /** Defaults to 1. Lottery passes the ticket count. */
  units?: number;
  /** Pass it when the caller already knows it — saves a package lookup. */
  accessLevel?: number;
}

function dedupKeyFor(action: GoalActionKey, targetId: string): string {
  switch (action) {
    case "feed_like":
      return `like:${targetId}`;
    case "feed_comment":
      // Per POST, not per comment — otherwise 100 comments on one post farms it.
      return `comment:${targetId}`;
    case "feed_share":
      return `share:${targetId}`;
    case "feed_post":
      return `post:${targetId}`;
    case "feed_vote":
      return `vote:${targetId}`;
    case "task_approved":
    case "quiz_approved":
      return `submission:${targetId}`;
    case "board_claim":
      // Keyed on the BOARD, not the claim row: `BoardClaim` is already unique
      // per (user, board), and this makes the dedup obvious at a glance.
      return `board:${targetId}`;
    case "lottery_ticket":
      return `lottery:${targetId}`;
    case "referral_signup":
      return `referral:${targetId}`;
  }
}

async function eligible(
  g: ActiveGoal,
  userId: string,
  accessLevel?: number
): Promise<boolean> {
  if (g.requiredAccessLevel > 0) {
    let level = accessLevel;
    if (level == null) {
      const pkg = await getEffectivePackage(userId).catch(() => null);
      level = pkg?.accessLevel ?? 0;
    }
    if (level < g.requiredAccessLevel) return false;
  }

  // Events: JSON AudienceCriteria, checked with one PK-anchored query, and only
  // when an admin actually set targeting.
  if (g.audienceJson && typeof g.audienceJson === "object") {
    const hit = await prisma.user.findFirst({
      where: {
        id: userId,
        ...audienceWhere(g.audienceJson as AudienceCriteria),
      },
      select: { id: true },
    });
    if (!hit) return false;
  }

  // Missions: discrete columns, checked in memory against a request-cached
  // profile. `hasAudienceTargeting` first so an untargeted mission — the common
  // case — never triggers the fetch.
  const needsProfile =
    g.requiredLevel > 1 || (g.targeting != null && hasAudienceTargeting(g.targeting));
  if (needsProfile) {
    const viewer = await getGoalViewer(userId).catch(() => null);
    if (!viewer) return false;
    if (g.requiredLevel > 1 && (viewer.level ?? 1) < g.requiredLevel) return false;
    if (g.targeting && !matchesTaskAudience(g.targeting, viewer)) return false;
  }

  return true;
}

/**
 * Credit one real action toward every active goal that wants it.
 *
 * Call it AFTER the caller's own transaction commits, and await it. Not inside:
 * a duplicate-key error would abort a lottery purchase, and holding a money
 * transaction open for extra round-trips is how lock convoys start. Not
 * un-awaited either: a serverless instance can freeze the moment it responds.
 *
 * Never throws.
 */
export async function recordUserAction(
  args: RecordUserActionArgs
): Promise<void> {
  try {
    const index = await getActiveGoalIndex();
    if (index.length === 0) return; // ← the zero-query fast path

    const now = new Date();
    const wanted = index.filter(
      (g) =>
        ACCEPTS[g.actionType]?.includes(args.action) &&
        (g.startAt === null || now >= g.startAt) &&
        (g.endAt === null || now <= g.endAt)
    );
    if (wanted.length === 0) return; // ← still zero queries

    const units = Math.max(1, Math.floor(args.units ?? 1));
    const dedupKey = dedupKeyFor(args.action, args.targetId);

    for (const g of wanted) {
      try {
        if (!(await eligible(g, args.userId, args.accessLevel))) continue;

        // Daily cap: bounded per user per LOCAL day, so the boundary matches
        // what the user sees.
        let dayKey: string | null = null;
        if (g.dailyCap > 0) {
          const ctx = await getUserDayContext(args.userId).catch(() => null);
          dayKey = ctx?.dayKey ?? null;
          if (dayKey) {
            const usedToday = await readDayCount(g, args.userId, dayKey);
            if (usedToday >= g.dailyCap) continue;
          }
        }

        const before = await creditOne(
          g,
          args.userId,
          args.action,
          dedupKey,
          units,
          dayKey
        );
        if (before != null) await maybeNotify(g, args.userId, before, before + units);
      } catch {
        // One goal failing must not stop the others.
      }
    }
  } catch {
    // Telemetry must never break the user's action.
  }
}

async function readDayCount(
  g: ActiveGoal,
  userId: string,
  dayKey: string
): Promise<number> {
  if (g.kind === "event") {
    const row = await prisma.userEventProgress.findUnique({
      where: { userId_eventId: { userId, eventId: g.id } },
      select: { dayKey: true, dayCount: true },
    });
    return row?.dayKey === dayKey ? row.dayCount : 0;
  }
  const row = await prisma.userMissionProgress.findUnique({
    where: { userId_missionId: { userId, missionId: g.id } },
    select: { dayKey: true, dayCount: true },
  });
  return row?.dayKey === dayKey ? row.dayCount : 0;
}

/**
 * Insert the log row and bump the counter in one transaction.
 * Returns the progress value BEFORE the increment, or null if it was a
 * duplicate (already counted).
 */
async function creditOne(
  g: ActiveGoal,
  userId: string,
  actionKey: GoalActionKey,
  dedupKey: string,
  units: number,
  dayKey: string | null
): Promise<number | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const nowTs = new Date();

      if (g.kind === "event") {
        // A duplicate throws P2002 here and rolls the whole thing back, so the
        // counter can never move twice for the same action.
        await tx.eventActionLog.create({
          data: { userId, eventId: g.id, actionKey, dedupKey, units },
        });
        const existing = await tx.userEventProgress.findUnique({
          where: { userId_eventId: { userId, eventId: g.id } },
          select: { progress: true, dayKey: true },
        });
        const before = existing?.progress ?? 0;
        const sameDay = dayKey != null && existing?.dayKey === dayKey;
        await tx.userEventProgress.upsert({
          where: { userId_eventId: { userId, eventId: g.id } },
          create: {
            userId,
            eventId: g.id,
            progress: units,
            joinedAt: nowTs,
            lastActionAt: nowTs,
            dayKey,
            dayCount: dayKey ? 1 : 0,
          },
          update: {
            progress: { increment: units },
            lastActionAt: nowTs,
            ...(dayKey ? { dayKey, dayCount: sameDay ? { increment: 1 } : 1 } : {}),
          },
        });
        return before;
      }

      await tx.missionActionLog.create({
        data: { userId, missionId: g.id, actionKey, dedupKey, units },
      });
      const existing = await tx.userMissionProgress.findUnique({
        where: { userId_missionId: { userId, missionId: g.id } },
        select: { progress: true, dayKey: true },
      });
      const before = existing?.progress ?? 0;
      const sameDay = dayKey != null && existing?.dayKey === dayKey;
      await tx.userMissionProgress.upsert({
        where: { userId_missionId: { userId, missionId: g.id } },
        create: {
          userId,
          missionId: g.id,
          progress: units,
          joinedAt: nowTs,
          lastActionAt: nowTs,
          dayKey,
          dayCount: dayKey ? 1 : 0,
        },
        update: {
          progress: { increment: units },
          lastActionAt: nowTs,
          ...(dayKey ? { dayKey, dayCount: sameDay ? { increment: 1 } : 1 } : {}),
        },
      });
      return before;
    });
  } catch {
    // P2002 (already counted) or a transient failure — either way, no credit.
    return null;
  }
}

/**
 * Tell the user once, the moment they cross the finish line. Goals never
 * notified anyone before this, so a reward could sit unclaimed until it expired.
 */
async function maybeNotify(
  g: ActiveGoal,
  userId: string,
  before: number,
  after: number
): Promise<void> {
  const tiers = parseEventTiers(g.tiers);
  const target = tiers.length > 0 ? tiers[0].threshold : g.threshold;
  if (before >= target || after < target) return;

  // `notifiedComplete` is the backstop for two actions landing at once.
  const claimed =
    g.kind === "event"
      ? await prisma.userEventProgress.updateMany({
          where: { userId, eventId: g.id, notifiedComplete: false },
          data: { notifiedComplete: true },
        })
      : await prisma.userMissionProgress.updateMany({
          where: { userId, missionId: g.id, notifiedComplete: false },
          data: { notifiedComplete: true },
        });
  if (claimed.count === 0) return;

  await notifyUser({
    userId,
    type: NotificationType.SYSTEM,
    title: "Reward ready",
    message: `You hit the target on "${g.title}" — claim it before it ends.`,
    link: g.link,
  }).catch(() => {});
}
