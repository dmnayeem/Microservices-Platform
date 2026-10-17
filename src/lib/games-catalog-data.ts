import { prisma } from "@/lib/prisma";

/**
 * Platform-wide numbers for the member Games page. Each is ONE groupBy, kept
 * in this instance's memory for a short while: every member sees the same
 * value, so there is no reason for each page view to pay for it again.
 *
 * Per instance on purpose (no shared cache): a minute-old "playing now" on one
 * server and a fresher one on another is fine for a number like this.
 */

type Cached<T> = { at: number; value: T } | null;

function memo<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cached: Cached<T> = null;
  let inflight: Promise<T> | null = null;
  return () => {
    if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    // Concurrent page views share one query instead of each starting their own.
    if (!inflight) {
      inflight = load()
        .then((value) => {
          cached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

export const POPULAR_DAYS = 7;
export const POPULAR_TAKE = 20;
/** A session whose last heartbeat is newer than this counts as "playing now". */
export const PLAYING_NOW_SECONDS = 120;

/**
 * Sessions started in the last 7 days, per game, most first (top 20).
 * Served by the `[gameId, startedAt]` index.
 */
export const getPopularGamesThisWeek = memo(5 * 60_000, async () => {
  const since = new Date(Date.now() - POPULAR_DAYS * 86_400_000);
  const rows = (await prisma.gameSession.groupBy({
    by: ["gameId"],
    where: { startedAt: { gte: since } },
    _count: { gameId: true },
    orderBy: { _count: { gameId: "desc" } },
    take: POPULAR_TAKE,
  })) as unknown as Array<{ gameId: string; _count: { gameId: number } }>;
  return rows.map((r) => ({ gameId: r.gameId, plays: r._count.gameId }));
});

/**
 * Distinct members with an open session that beat in the last 2 minutes.
 *
 * GameSession has no index on `lastBeatAt`, so the filter is anchored on the
 * `[gameId, startedAt]` index: the live games, sessions started in the last
 * 24 hours. A session open longer than a day is not "playing now" anyway —
 * the cron closes anything silent for 5 minutes.
 */
export const getPlayingNowCount = memo(60_000, async () => {
  const now = Date.now();
  const games = await prisma.game.findMany({ where: { isActive: true }, select: { id: true } });
  if (games.length === 0) return 0;
  const rows = (await prisma.gameSession.groupBy({
    by: ["userId"],
    where: {
      gameId: { in: games.map((g) => g.id) },
      startedAt: { gte: new Date(now - 86_400_000) },
      endedAt: null,
      lastBeatAt: { gte: new Date(now - PLAYING_NOW_SECONDS * 1000) },
    },
  })) as unknown as Array<{ userId: string }>;
  return rows.length;
});
