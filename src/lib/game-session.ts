import "server-only";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext } from "@/lib/user-day";
import { TransactionType, type Game } from "@/generated/prisma";
import {
  getGamesGlobalConfig,
  resolveGameReward,
  type ResolvedGameReward,
} from "@/lib/game-settings";
import { notifyGameSessionsClosed, type ClosedGameSession } from "@/lib/game-notify";

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
// 30 s (was 15 s): with the score riding on the beat this is the only
// request a playing member makes — half the beats is half the load at scale.
export const BEAT_INTERVAL_SECONDS = 30;
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
  /** Score earning for connected games (RevType Games SDK). */
  score: {
    enabled: boolean;
    /** RevType points per 1,000 in-game points. */
    pointsPer1000: number;
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

  const { session, forceEnded } = await prisma.$transaction(async (tx) => {
    // One open session per user, globally. RETURNING exactly the rows this
    // statement closed, so a session the player's own Quit closed in the
    // meantime is not notified twice.
    const forceEnded: ClosedGameSession[] = await tx.gameSession.updateManyAndReturn({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
      select: { id: true, userId: true, gameId: true, pointsAwarded: true },
    });
    const session = await tx.gameSession.create({
      data: { userId, gameId },
      select: { id: true },
    });
    return { session, forceEnded };
  });
  // A session left open (the game's website has no "quit", a tab that was
  // killed) still gets its one "you earned N points" notice.
  await notifyGameSessionsClosed(forceEnded);

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
    score: {
      enabled: scoreEarningOn(game, globals),
      pointsPer1000: game.scorePointsPer1000,
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

/** Whether a game's reported scores may pay at all. */
function scoreEarningOn(
  game: { scoreRewardEnabled: boolean; scoreTrusted: boolean; scorePointsPer1000: number },
  globals: { enabled: boolean; scoreMaxPerMinute: number }
): boolean {
  return (
    globals.enabled &&
    globals.scoreMaxPerMinute > 0 &&
    game.scoreTrusted &&
    game.scoreRewardEnabled &&
    game.scorePointsPer1000 > 0
  );
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
  /** Points credited by THIS beat (time + score). */
  awarded: number;
  sessionPoints: number;
  /** -1 = unlimited, or not worked out on this beat (nothing was due). */
  remainingToday: number;
  /** True when a cap stopped the payout — the client shows "daily limit hit". */
  capped: boolean;
  /** True when `rewardRequiresAd` is throttling payout until the next ad. */
  awaitingAd: boolean;
}

export type HeartbeatOutcome =
  | { ok: true; result: HeartbeatResult }
  | { ok: false; reason: "no_session" | "ended" };

export interface BeatOptions {
  loaded: boolean;
  /**
   * Connected games: the session's running in-game score, carried on the beat
   * instead of a separate request (half the traffic at scale).
   */
  scoreTotal?: number;
  /** Last beat of a play (page closing): pay any score due now, not at the next minute. */
  final?: boolean;
}

type GameRow = Game;

/**
 * Game rows change rarely and every beat needs one, so each server instance
 * keeps them for a few seconds. An admin switching a game off or changing its
 * reward takes effect within GAME_CACHE_MS.
 */
const GAME_CACHE_MS = 30_000;
const gameCache = new Map<string, { at: number; game: GameRow | null }>();
async function getGameCached(gameId: string): Promise<GameRow | null> {
  const hit = gameCache.get(gameId);
  if (hit && Date.now() - hit.at < GAME_CACHE_MS) return hit.game;
  const game = (await prisma.game.findUnique({ where: { id: gameId } })) as GameRow | null;
  if (gameCache.size > 5_000) gameCache.clear();
  gameCache.set(gameId, { at: Date.now(), game });
  return game;
}

type SessionRow = {
  id: string;
  lastBeatAt: Date | null;
  playedSeconds: number;
  creditedSeconds: number;
  pointsAwarded: number;
  scorePaid: number;
  adsShown: number;
  score: number | null;
};
const SESSION_SELECT = {
  id: true,
  lastBeatAt: true,
  playedSeconds: true,
  creditedSeconds: true,
  pointsAwarded: true,
  scorePaid: true,
  adsShown: true,
  score: true,
} as const;

/** What one beat would do to a session — pure arithmetic, no queries. */
function planBeat(
  s: SessionRow,
  now: number,
  game: GameRow,
  reward: ResolvedGameReward,
  scoreOn: boolean,
  scoreMaxPerMinute: number,
  opts: BeatOptions
) {
  // The FIRST beat credits 0 — it only anchors the clock. Otherwise the idle
  // gap between opening the game and actually playing would be paid.
  const step =
    s.lastBeatAt === null
      ? 0
      : Math.max(0, Math.min(Math.floor((now - s.lastBeatAt.getTime()) / 1000), BEAT_MAX_STEP));
  // Time only accrues once the game has actually loaded.
  const played = s.playedSeconds + (opts.loaded ? step : 0);

  let ticks = 0;
  let awaitingAd = false;
  if (reward.enabled) {
    ticks = Math.floor((played - s.creditedSeconds) / reward.tickSeconds);
    if (reward.requiresAd) {
      // Payout is bounded by ads the SERVER served this session.
      const allowed = s.adsShown * TICKS_PER_AD;
      const alreadyPaidTicks = Math.floor(s.creditedSeconds / reward.tickSeconds);
      const budget = Math.max(0, allowed - alreadyPaidTicks);
      if (ticks > budget) {
        ticks = budget;
        awaitingAd = true;
      }
    }
  }

  // Score: a running total that never goes down.
  const reported = Number(opts.scoreTotal);
  const score =
    scoreOn && Number.isFinite(reported) && reported > (s.score ?? 0)
      ? Math.min(Math.floor(reported), 2_000_000_000)
      : s.score;
  let scoreDue = 0;
  if (scoreOn && score) {
    const worth = Math.floor((score * game.scorePointsPer1000) / 1000);
    // A score comes from the player's browser and can be faked, so what it
    // pays is bounded by the play time the SERVER measured.
    const byTime = Math.floor((played / 60) * scoreMaxPerMinute);
    scoreDue = Math.max(0, Math.min(worth, byTime) - s.scorePaid);
    // Paid at most once per minute of play (or on the last beat), so an
    // active scorer does not turn every beat into a locked transaction.
    if (scoreDue > 0 && !opts.final && Math.floor(played / 60) === Math.floor(s.playedSeconds / 60)) {
      scoreDue = 0;
    }
  }
  return { played, ticks, awaitingAd, score, scoreDue };
}

/**
 * Credit one beat.
 *
 * Most beats have nothing to pay: they move the play clock (and the score) on
 * with ONE conditional update — compare-and-set on `lastBeatAt`, so two beats
 * racing each other cannot both count the same seconds. Only when a time tick
 * or score is actually due does the beat take the locked transaction: the
 * member row is locked, the account status checked (a banned member is never
 * paid), the daily caps summed, the session re-read and updated with the same
 * compare-and-set, and the points credited — all or nothing.
 */
export async function heartbeat(
  userId: string,
  gameId: string,
  sessionId: string,
  opts: BeatOptions
): Promise<HeartbeatOutcome> {
  const game = await getGameCached(gameId);
  // A game the admin switched off stops paying open sessions too.
  if (!game || !game.isActive) return { ok: false, reason: "no_session" };

  const globals = await getGamesGlobalConfig();
  const reward = resolveGameReward(game, globals);
  const scoreOn = scoreEarningOn(game, globals);

  // Ownership is part of the lookup: a session id belonging to someone else
  // must not be a way to accrue time on their behalf.
  const s = (await prisma.gameSession.findFirst({
    where: { id: sessionId, userId, gameId, endedAt: null },
    select: SESSION_SELECT,
  })) as SessionRow | null;
  if (!s) return { ok: false, reason: "ended" };

  const now = Date.now();
  const plan = planBeat(s, now, game, reward, scoreOn, globals.scoreMaxPerMinute, opts);

  // ── Fast path: nothing to pay ──────────────────────────────────────────
  if (plan.ticks <= 0 && plan.scoreDue <= 0) {
    await prisma.gameSession.updateMany({
      where: { id: s.id, endedAt: null, lastBeatAt: s.lastBeatAt },
      data: {
        playedSeconds: plan.played,
        lastBeatAt: new Date(now),
        ...(plan.score !== s.score ? { score: plan.score } : {}),
      },
    });
    return {
      ok: true,
      result: {
        playedSeconds: plan.played,
        awarded: 0,
        sessionPoints: s.pointsAwarded,
        remainingToday: -1,
        capped: false,
        awaitingAd: plan.awaitingAd,
      },
    };
  }

  // ── Slow path: something is due ────────────────────────────────────────
  const { startOfDayUtc } = await getUserDayContext(userId);
  const pointsPerUsd = await getPointsPerUsd();

  return prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const status = lock[0]?.status;
    const mayEarn = !!status && status !== "BANNED" && status !== "SUSPENDED";

    // Re-read under the lock: the fast read may be stale.
    const cur = (await tx.gameSession.findFirst({
      where: { id: sessionId, userId, gameId, endedAt: null },
      select: SESSION_SELECT,
    })) as SessionRow | null;
    if (!cur) return { ok: false as const, reason: "ended" as const };
    const p = planBeat(cur, now, game, reward, scoreOn, globals.scoreMaxPerMinute, opts);

    let timeAwarded = 0;
    let scoreAwarded = 0;
    let capped = false;
    let remaining = Number.MAX_SAFE_INTEGER;
    const creditedSeconds = cur.creditedSeconds + Math.max(0, p.ticks) * reward.tickSeconds;

    if (mayEarn && (p.ticks > 0 || p.scoreDue > 0)) {
      const [todayAll, todayGame, todayGameScore] = await Promise.all([
        tx.gameEarnLog
          .aggregate({ where: { userId, createdAt: { gte: startOfDayUtc } }, _sum: { points: true } })
          .then((a) => a._sum.points ?? 0),
        tx.gameEarnLog
          .aggregate({ where: { userId, gameId, createdAt: { gte: startOfDayUtc } }, _sum: { points: true } })
          .then((a) => a._sum.points ?? 0),
        p.scoreDue > 0
          ? tx.gameEarnLog
              .aggregate({
                where: { userId, gameId, kind: "SCORE", createdAt: { gte: startOfDayUtc } },
                _sum: { points: true },
              })
              .then((a) => a._sum.points ?? 0)
          : Promise.resolve(0),
      ]);
      remaining = remainingFor(reward, todayAll, todayGame);
      const sessionRoom = () =>
        reward.maxPerSession > 0
          ? Math.max(0, reward.maxPerSession - cur.pointsAwarded - timeAwarded)
          : Number.MAX_SAFE_INTEGER;

      if (p.ticks > 0) {
        const wanted = p.ticks * reward.pointsPerTick;
        // CLAMPED, not rejected — the last partial tick still pays what is left.
        timeAwarded = Math.max(0, Math.min(wanted, remaining, sessionRoom()));
        capped = timeAwarded < wanted;
        if (remaining !== Number.MAX_SAFE_INTEGER) remaining -= timeAwarded;
      }
      if (p.scoreDue > 0) {
        // A score is bound by the session cap, the game's SCORE daily cap and
        // the all-games daily cap — not by the time reward's per-game cap.
        const limits = [p.scoreDue, sessionRoom()];
        if (game.scoreDailyCapPoints > 0) limits.push(game.scoreDailyCapPoints - todayGameScore);
        if (reward.globalDailyCap > 0) limits.push(reward.globalDailyCap - todayAll - timeAwarded);
        scoreAwarded = Math.max(0, Math.min(...limits));
        if (scoreAwarded < p.scoreDue) capped = true;
        if (remaining !== Number.MAX_SAFE_INTEGER) remaining -= scoreAwarded;
      }
    }

    const won = await tx.gameSession.updateMany({
      where: { id: cur.id, endedAt: null, lastBeatAt: cur.lastBeatAt },
      data: {
        playedSeconds: p.played,
        // Ticks are consumed even when a cap or a ban paid nothing for them,
        // exactly as before — a capped tick never pays later.
        creditedSeconds,
        lastBeatAt: new Date(now),
        score: p.score,
        pointsAwarded: { increment: timeAwarded + scoreAwarded },
        scorePaid: { increment: scoreAwarded },
      },
    });
    // Another beat got there first: it did this beat's work.
    if (won.count === 0) {
      return {
        ok: true as const,
        result: {
          playedSeconds: cur.playedSeconds,
          awarded: 0,
          sessionPoints: cur.pointsAwarded,
          remainingToday: -1,
          capped: false,
          awaitingAd: p.awaitingAd,
        },
      };
    }

    if (timeAwarded > 0) {
      await creditPoints(tx, {
        userId,
        points: timeAwarded,
        type: TransactionType.BONUS,
        description: `Game reward: ${game.title}`,
        // Deterministic: a replay collides on Transaction @@unique([userId, reference]).
        reference: `game_${sessionId}_${creditedSeconds}`,
        metadata: { gameId, sessionId },
        pointsPerUsd,
      });
      await tx.gameEarnLog.create({ data: { userId, gameId, sessionId, points: timeAwarded, kind: "TIME" } });
    }
    if (scoreAwarded > 0) {
      await creditPoints(tx, {
        userId,
        points: scoreAwarded,
        type: TransactionType.BONUS,
        description: `Game score reward: ${game.title}`,
        reference: `game_score_${sessionId}_${cur.scorePaid + scoreAwarded}`,
        metadata: { gameId, sessionId, score: p.score, kind: "SCORE" },
        pointsPerUsd,
      });
      await tx.gameEarnLog.create({ data: { userId, gameId, sessionId, points: scoreAwarded, kind: "SCORE" } });
    }

    return {
      ok: true as const,
      result: {
        playedSeconds: p.played,
        awarded: timeAwarded + scoreAwarded,
        sessionPoints: cur.pointsAwarded + timeAwarded + scoreAwarded,
        remainingToday: remaining === Number.MAX_SAFE_INTEGER ? -1 : Math.max(0, remaining),
        capped,
        awaitingAd: p.awaitingAd,
      },
    };
  });
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

  const claimed = await prisma.$transaction(async (tx) => {
    // CAS on `endedAt` so a `sendBeacon` racing an explicit quit folds the
    // totals in exactly once.
    const claim = await tx.gameSession.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await tx.game.update({
      where: { id: gameId },
      data: {
        totalPlaySeconds: { increment: s.playedSeconds },
        adsShownCount: { increment: s.adsShown },
        pointsAwardedTotal: { increment: s.pointsAwarded },
      },
    });
    return true;
  });

  // Exactly one "you earned N points" notice: only the call that won the CAS
  // sends it, after the commit. Re-read the total — no beat can add to a
  // closed session, so this is final. Never fails the session end.
  if (claimed) {
    try {
      const fin = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        select: { pointsAwarded: true },
      });
      await notifyGameSessionsClosed([
        { id: sessionId, userId, gameId, pointsAwarded: fin?.pointsAwarded ?? s.pointsAwarded },
      ]);
    } catch (err) {
      console.error(`[game-session] end notification failed for ${sessionId}:`, err);
    }
  }

  return { playedSeconds: s.playedSeconds, pointsAwarded: s.pointsAwarded };
}

export interface ScoreResult {
  /** RevType points credited by THIS report. */
  awarded: number;
  /** All points this session has paid (time + score). */
  sessionPoints: number;
}

export type ScoreOutcome =
  | { ok: true; result: ScoreResult }
  | { ok: false; reason: "no_session" | "ended" | "off" };

/**
 * A connected game's running score sent on its own (SDK v1 and the old
 * player). It is just a beat carrying the score — the same rules, the same
 * once-a-minute payout; new clients put the score on the regular heartbeat.
 */
export async function reportScore(
  userId: string,
  gameId: string,
  sessionId: string,
  total: number
): Promise<ScoreOutcome> {
  const game = await getGameCached(gameId);
  if (!game || !game.isActive) return { ok: false, reason: "no_session" };
  if (!scoreEarningOn(game, await getGamesGlobalConfig())) return { ok: false, reason: "off" };
  const out = await heartbeat(userId, gameId, sessionId, { loaded: true, scoreTotal: total });
  if (!out.ok) return out;
  return { ok: true, result: { awarded: out.result.awarded, sessionPoints: out.result.sessionPoints } };
}
