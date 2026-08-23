import "server-only";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext } from "@/lib/user-day";
import { TransactionType } from "@/generated/prisma";
import {
  getGamesGlobalConfig,
  resolveGameReward,
  type ResolvedGameReward,
} from "@/lib/game-settings";

/**
 * Game play sessions and the points they earn.
 *
 * ## Why this exists
 *
 * `POST /api/games/[id]/play` incremented `Game.playsCount` from a client
 * `useEffect` with no rate limit, no dedupe and no per-user record. That is
 * harmless for a vanity counter and catastrophic the moment points hang off it
 * — a shell loop would print money. There was no session table at all.
 *
 * ## What makes the time real
 *
 * The client never sends a duration, because there would be nothing stopping it
 * sending a large one. It sends a heartbeat; the SERVER measures the wall-clock
 * gap since the previous beat and clamps it to one interval plus jitter. Beating
 * faster than real time therefore credits nothing, and a frozen tab, a slept
 * laptop or withheld beats credit at most one step. This is the same accrual the
 * video-task heartbeat uses (src/app/api/tasks/[id]/heartbeat/route.ts).
 *
 * `creditedSeconds` tracks what has already been converted into points, so a
 * replayed or out-of-order heartbeat pays nothing extra — the arithmetic is
 * "seconds since the last payout", not "seconds this request claims".
 *
 * ## What is still not guaranteed
 *
 * A headless script can emit heartbeats on a timer. The server bounds the RATE
 * (points per tick, tick length) and the daily total, but cannot prove a human
 * is present — the same accepted trade-off as Browse & Earn. `rewardRequiresAd`
 * is the real hardening: it ties payout to ad impressions the server itself
 * served, so a payout can never exceed the revenue funding it.
 */

/** Client beat cadence, and the most one beat may ever credit. */
export const BEAT_INTERVAL_SECONDS = 15;
const BEAT_MAX_STEP = BEAT_INTERVAL_SECONDS + 5;

/** A session with no beat for this long is treated as abandoned. */
export const SESSION_STALE_SECONDS = 5 * 60;

/** How many reward ticks one ad buys, when `rewardRequiresAd` is on. */
const TICKS_PER_AD = 4;

export interface StartSessionResult {
  sessionId: string;
  reward: {
    enabled: boolean;
    pointsPerTick: number;
    tickSeconds: number;
    remainingToday: number;
    maxPerSession: number;
    requiresAd: boolean;
  };
  ads: {
    enabled: boolean;
    onOpen: boolean;
    onResume: boolean;
    onQuit: boolean;
    intervalSeconds: number;
    throttleSeconds: number;
  };
  beatSeconds: number;
}

/** Points this user has already earned from games today (all games). */
async function earnedToday(userId: string, startOfDayUtc: Date, gameId?: string) {
  const agg = await prisma.gameEarnLog.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfDayUtc },
      ...(gameId ? { gameId } : {}),
    },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/**
 * Open a session.
 *
 * **Force-ends every other open session for this user, across all games.** That
 * one rule is what stops N tabs earning at N× the rate, and it did not exist in
 * any form before — there was nothing to end.
 */
export async function startSession(
  userId: string,
  gameId: string
): Promise<StartSessionResult | null> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || !game.isActive) return null;

  const globals = await getGamesGlobalConfig();
  const reward = resolveGameReward(game, globals);
  const { startOfDayUtc } = await getUserDayContext(userId);

  const [todayAll, todayGame, priorPlay] = await Promise.all([
    earnedToday(userId, startOfDayUtc),
    earnedToday(userId, startOfDayUtc, gameId),
    prisma.gameSession.findFirst({
      where: { userId, gameId },
      select: { id: true },
    }),
  ]);

  const session = await prisma.$transaction(async (tx) => {
    // One open session per user, globally.
    await tx.gameSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    return tx.gameSession.create({
      data: { userId, gameId },
      select: { id: true },
    });
  });

  // `playsCount` now counts authenticated, server-created sessions rather than
  // client mounts, so it legitimately grows more slowly than the old number.
  await prisma.game
    .update({
      where: { id: gameId },
      data: {
        playsCount: { increment: 1 },
        ...(priorPlay ? {} : { uniquePlayersCount: { increment: 1 } }),
      },
    })
    .catch(() => {});

  const remainingToday = remainingFor(reward, todayAll, todayGame);

  return {
    sessionId: session.id,
    reward: {
      enabled: reward.enabled,
      pointsPerTick: reward.pointsPerTick,
      tickSeconds: reward.tickSeconds,
      remainingToday,
      maxPerSession: reward.maxPerSession,
      requiresAd: reward.requiresAd,
    },
    ads: {
      enabled: game.adsEnabled,
      onOpen: game.adOnOpen,
      onResume: game.adOnResume,
      onQuit: game.adOnQuit,
      intervalSeconds: game.adIntervalSeconds,
      throttleSeconds: game.adThrottleSeconds,
    },
    beatSeconds: BEAT_INTERVAL_SECONDS,
  };
}

/** How much this user may still earn, honouring whichever cap binds first. */
function remainingFor(
  reward: ResolvedGameReward,
  todayAll: number,
  todayGame: number
): number {
  const limits: number[] = [];
  if (reward.globalDailyCap > 0) limits.push(reward.globalDailyCap - todayAll);
  if (reward.dailyCap > 0) limits.push(reward.dailyCap - todayGame);
  if (limits.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(...limits));
}

export interface HeartbeatResult {
  playedSeconds: number;
  /** Points credited by THIS beat. */
  awarded: number;
  sessionPoints: number;
  remainingToday: number;
  /** True when a cap stopped the payout — the client shows "daily limit hit". */
  capped: boolean;
  /** True when `rewardRequiresAd` is throttling payout until the next ad. */
  awaitingAd: boolean;
}

export type HeartbeatOutcome =
  | { ok: true; result: HeartbeatResult }
  | { ok: false; reason: "no_session" | "ended" };

/**
 * Credit one beat.
 *
 * Everything that decides money happens inside a transaction that opens by
 * locking the user row, so two tabs (or two replayed requests) cannot both read
 * "cap not reached" and both pay.
 */
export async function heartbeat(
  userId: string,
  gameId: string,
  sessionId: string,
  opts: { loaded: boolean }
): Promise<HeartbeatOutcome> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return { ok: false, reason: "no_session" };

  const globals = await getGamesGlobalConfig();
  const reward = resolveGameReward(game, globals);
  const { startOfDayUtc } = await getUserDayContext(userId);
  const pointsPerUsd = await getPointsPerUsd();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    // Ownership is part of the lookup: a session id belonging to someone else
    // must not be a way to accrue time on their behalf.
    const s = await tx.gameSession.findFirst({
      where: { id: sessionId, userId, gameId, endedAt: null },
    });
    if (!s) return { ok: false as const, reason: "ended" as const };

    const now = Date.now();
    // The FIRST beat credits 0 — it only anchors the clock. Otherwise the idle
    // gap between opening the game and actually playing would be paid.
    const step =
      s.lastBeatAt === null
        ? 0
        : Math.max(
            0,
            Math.min(
              Math.floor((now - s.lastBeatAt.getTime()) / 1000),
              BEAT_MAX_STEP
            )
          );

    // Time only accrues once the iframe has actually loaded. A game that never
    // loads (an embed that refuses framing) must not pay for staring at a black
    // rectangle.
    const played = s.playedSeconds + (opts.loaded ? step : 0);

    let awarded = 0;
    let capped = false;
    let awaitingAd = false;
    let creditedSeconds = s.creditedSeconds;

    if (reward.enabled) {
      let ticks = Math.floor((played - s.creditedSeconds) / reward.tickSeconds);

      if (reward.requiresAd) {
        // Payout is bounded by ads the SERVER served this session, so it can
        // never exceed the revenue funding it.
        const allowed = s.adsShown * TICKS_PER_AD;
        const alreadyPaidTicks = Math.floor(s.creditedSeconds / reward.tickSeconds);
        const budget = Math.max(0, allowed - alreadyPaidTicks);
        if (ticks > budget) {
          ticks = budget;
          awaitingAd = true;
        }
      }

      if (ticks > 0) {
        const [todayAll, todayGame] = await Promise.all([
          tx.gameEarnLog
            .aggregate({
              where: { userId, createdAt: { gte: startOfDayUtc } },
              _sum: { points: true },
            })
            .then((a) => a._sum.points ?? 0),
          tx.gameEarnLog
            .aggregate({
              where: { userId, gameId, createdAt: { gte: startOfDayUtc } },
              _sum: { points: true },
            })
            .then((a) => a._sum.points ?? 0),
        ]);

        const remaining = remainingFor(reward, todayAll, todayGame);
        const sessionRoom =
          reward.maxPerSession > 0
            ? Math.max(0, reward.maxPerSession - s.pointsAwarded)
            : Number.MAX_SAFE_INTEGER;

        const wanted = ticks * reward.pointsPerTick;
        // CLAMPED, not rejected — the last partial tick still pays what is left
        // of the allowance, which is what users expect and what browse-earn does.
        awarded = Math.max(0, Math.min(wanted, remaining, sessionRoom));
        capped = awarded < wanted;
        creditedSeconds = s.creditedSeconds + ticks * reward.tickSeconds;
      }
    }

    const updated = await tx.gameSession.update({
      where: { id: s.id },
      data: {
        playedSeconds: played,
        creditedSeconds,
        lastBeatAt: new Date(now),
        pointsAwarded: { increment: awarded },
      },
      select: { pointsAwarded: true, playedSeconds: true },
    });

    if (awarded > 0) {
      await creditPoints(tx, {
        userId,
        points: awarded,
        type: TransactionType.BONUS,
        description: `Game reward: ${game.title}`,
        // Deterministic: a replayed beat that somehow reached here again would
        // collide on Transaction @@unique([userId, reference]) instead of
        // paying twice.
        reference: `game_${sessionId}_${creditedSeconds}`,
        metadata: { gameId, sessionId },
        pointsPerUsd,
      });
      await tx.gameEarnLog.create({
        data: { userId, gameId, sessionId, points: awarded, kind: "TIME" },
      });
    }

    const [afterAll, afterGame] = await Promise.all([
      tx.gameEarnLog
        .aggregate({
          where: { userId, createdAt: { gte: startOfDayUtc } },
          _sum: { points: true },
        })
        .then((a) => a._sum.points ?? 0),
      tx.gameEarnLog
        .aggregate({
          where: { userId, gameId, createdAt: { gte: startOfDayUtc } },
          _sum: { points: true },
        })
        .then((a) => a._sum.points ?? 0),
    ]);
    const left = remainingFor(reward, afterAll, afterGame);

    return {
      ok: true as const,
      result: {
        playedSeconds: updated.playedSeconds,
        awarded,
        sessionPoints: updated.pointsAwarded,
        remainingToday: left === Number.MAX_SAFE_INTEGER ? -1 : left,
        capped,
        awaitingAd,
      },
    };
  });

  return outcome;
}

/** Close a session and fold its totals into the game's denormalised counters. */
export async function endSession(
  userId: string,
  gameId: string,
  sessionId: string
): Promise<{ playedSeconds: number; pointsAwarded: number } | null> {
  const s = await prisma.gameSession.findFirst({
    where: { id: sessionId, userId, gameId },
  });
  if (!s) return null;
  if (s.endedAt) {
    return { playedSeconds: s.playedSeconds, pointsAwarded: s.pointsAwarded };
  }

  await prisma.$transaction(async (tx) => {
    // CAS on `endedAt` so a `sendBeacon` racing an explicit quit folds the
    // totals in exactly once.
    const claim = await tx.gameSession.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (claim.count === 0) return;
    await tx.game.update({
      where: { id: gameId },
      data: {
        totalPlaySeconds: { increment: s.playedSeconds },
        adsShownCount: { increment: s.adsShown },
        pointsAwardedTotal: { increment: s.pointsAwarded },
      },
    });
  });

  return { playedSeconds: s.playedSeconds, pointsAwarded: s.pointsAwarded };
}
