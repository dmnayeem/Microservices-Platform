import "server-only";
import { prisma } from "@/lib/prisma";
import { SESSION_STALE_SECONDS } from "@/lib/game-session";

/**
 * Close play sessions that stopped beating.
 *
 * A session is only closed properly when the player quits or the tab fires
 * `pagehide` — a killed browser, a lost connection or a crashed phone leaves it
 * open forever. That matters beyond tidiness: **one open session per user is a
 * global rule**, so an abandoned session would keep occupying that user's slot
 * and every later game would immediately force-end itself in a loop.
 *
 * Nothing here pays anything. Points were already credited beat by beat; this
 * only stamps `endedAt` and folds the totals into the game's counters, which is
 * why it is safe to run repeatedly.
 */

/** Sessions closed per run. Small, because the sweep runs every 15 minutes. */
const SWEEP_BATCH = 200;

export async function sweepStaleGameSessions(): Promise<{
  closed: number;
  seconds: number;
  points: number;
}> {
  const cutoff = new Date(Date.now() - SESSION_STALE_SECONDS * 1000);

  const stale = await prisma.gameSession.findMany({
    where: {
      endedAt: null,
      // A session that never beat at all is judged on when it started, so an
      // opened-and-abandoned game doesn't sit open forever either.
      OR: [{ lastBeatAt: { lt: cutoff } }, { lastBeatAt: null, startedAt: { lt: cutoff } }],
    },
    select: {
      id: true,
      gameId: true,
      playedSeconds: true,
      pointsAwarded: true,
      adsShown: true,
    },
    take: SWEEP_BATCH,
  });
  if (stale.length === 0) return { closed: 0, seconds: 0, points: 0 };

  // Aggregate per game so a popular game gets one update, not N.
  const byGame = new Map<string, { seconds: number; points: number; ads: number }>();
  for (const s of stale) {
    const cur = byGame.get(s.gameId) ?? { seconds: 0, points: 0, ads: 0 };
    cur.seconds += s.playedSeconds;
    cur.points += s.pointsAwarded;
    cur.ads += s.adsShown;
    byGame.set(s.gameId, cur);
  }

  const now = new Date();
  const closed = await prisma.$transaction(async (tx) => {
    // `endedAt: null` in the filter is the CAS: a session the player closed in
    // the meantime is skipped rather than double-counted into the totals.
    const res = await tx.gameSession.updateMany({
      where: { id: { in: stale.map((s) => s.id) }, endedAt: null },
      data: { endedAt: now },
    });
    if (res.count === 0) return 0;
    for (const [gameId, t] of byGame) {
      await tx.game.update({
        where: { id: gameId },
        data: {
          totalPlaySeconds: { increment: t.seconds },
          adsShownCount: { increment: t.ads },
          pointsAwardedTotal: { increment: t.points },
        },
      });
    }
    return res.count;
  });

  return {
    closed,
    seconds: stale.reduce((s, x) => s + x.playedSeconds, 0),
    points: stale.reduce((s, x) => s + x.pointsAwarded, 0),
  };
}
