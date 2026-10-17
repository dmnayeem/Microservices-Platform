import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import {
  GamesCatalog,
  type CatalogGame,
  type CatalogStats,
} from "@/components/user/games/games-catalog";
import { getGameConnectOrigins, normalizeOrigin } from "@/lib/game-connect";
import { getPlayingNowCount, getPopularGamesThisWeek } from "@/lib/games-catalog-data";
import { resolveUserTimezone, localStartOfDayUtc } from "@/lib/user-day";

const DAY_MS = 86_400_000;
/** "NEW" badge on a tile. */
const BADGE_NEW_DAYS = 14;
/** The "New" row. */
const NEW_ROW_DAYS = 30;
/** "HOT" badge: the top N of Popular this week. */
const HOT_TOP = 10;

type SumByGame = { gameId: string; _sum: { points: number | null } };
type LastPlayed = { gameId: string; _max: { startedAt: Date | null } };

/**
 * `/games?play=<gameId>` opens that game straight away in the in-app player —
 * the link to use from banners, posts and notifications, so a game on its own
 * website never opens as an outside page (with a browser address bar) inside
 * the RevType app.
 *
 * One parallel round: the catalog, categories, the connect-site list, the
 * member's own sessions/earnings, and two platform numbers held in memory
 * (popular 5 min, playing now 60 s). Every read except the catalog itself
 * degrades to empty, so a failed stat never takes the page down.
 */
export default async function GamesPage({ searchParams }: { searchParams: Promise<{ play?: string }> }) {
  const { play } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const { enabled } = await getEffectiveFeatures(userId);
  if (!enabled.has("games")) return <FeatureLock title="HTML5 Games" />;

  const now = new Date();

  // The member's "today" is their own calendar day, the same boundary the
  // wallet's game-earnings card uses — so the two numbers always agree.
  const todayPointsP = prisma.user
    .findUnique({ where: { id: userId }, select: { country: true, timezone: true } })
    .then((u) => {
      const tz = resolveUserTimezone({ country: u?.country, timezone: u?.timezone });
      return prisma.gameEarnLog.aggregate({
        where: { userId, createdAt: { gte: localStartOfDayUtc(tz, now) } },
        _sum: { points: true },
      });
    })
    .then((r) => r._sum.points ?? 0);

  const [games, categories, origins, popular, playingNow, lastPlayed, earnedByGame, todayPoints] =
    await Promise.all([
      prisma.game.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          category: true,
          categoryId: true,
          description: true,
          iconUrl: true,
          coverUrl: true,
          isFeatured: true,
          order: true,
          embedUrl: true,
          createdAt: true,
          playsCount: true,
          pointsAwardedTotal: true,
          adPlacement: true,
          rewardEnabled: true,
          rewardPointsPerTick: true,
          rewardTickSeconds: true,
          scoreRewardEnabled: true,
          scoreTrusted: true,
        },
      }),
      // Category names come from a flat query rather than a nested relation
      // select: the Accelerate client extension loses the inferred shape of
      // nested selects. The whole (small) table, for names and row order.
      safeRead(
        prisma.gameCategory.findMany({
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: { id: true, name: true, order: true, isActive: true },
        }),
        [],
        "games categories"
      ),
      safeRead(getGameConnectOrigins(), [] as string[], "games connect origins"),
      safeRead(getPopularGamesThisWeek(), [], "games popular"),
      safeRead(getPlayingNowCount(), 0, "games playing now"),
      // Distinct games this member has opened, latest first — feeds both
      // "Continue playing" and "Games you've played". [userId, startedAt] index.
      safeRead(
        prisma.gameSession.groupBy({
          by: ["gameId"],
          where: { userId },
          _max: { startedAt: true },
          orderBy: { _max: { startedAt: "desc" } },
        }) as unknown as Promise<LastPlayed[]>,
        [],
        "games last played"
      ),
      // All-time points per game: the total and the member's best game.
      safeRead(
        prisma.gameEarnLog.groupBy({
          by: ["gameId"],
          where: { userId },
          _sum: { points: true },
        }) as unknown as Promise<SumByGame[]>,
        [],
        "games earned by game"
      ),
      safeRead(todayPointsP, 0, "games today points"),
    ]);

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const originSet = new Set(origins);
  const popularRank = new Map(popular.map((p, i) => [p.gameId, i]));
  const weekPlays = new Map(popular.map((p) => [p.gameId, p.plays]));

  const rows: CatalogGame[] = games.map((g) => {
    const ageDays = (now.getTime() - g.createdAt.getTime()) / DAY_MS;
    const rank = popularRank.get(g.id);
    const o = normalizeOrigin(g.embedUrl);
    const earnsViaServer = !!o && originSet.has(o);
    return {
      id: g.id,
      title: g.title,
      embedUrl: g.embedUrl,
      category: g.category,
      // The taxonomy name when the game has been categorised, falling back to
      // the legacy free-text column for rows the backfill didn't match.
      categoryName: g.categoryId ? nameById.get(g.categoryId) ?? null : null,
      categoryId: g.categoryId,
      description: g.description,
      iconUrl: g.iconUrl,
      coverUrl: g.coverUrl,
      isFeatured: g.isFeatured,
      playsCount: g.playsCount,
      pointsAwardedTotal: g.pointsAwardedTotal,
      adPlacement: g.adPlacement,
      rewardEnabled: g.rewardEnabled,
      rewardPointsPerTick: g.rewardPointsPerTick,
      rewardTickSeconds: g.rewardTickSeconds,
      // Badges are decided here, against the server clock, so the browser
      // never computes "new" from its own (possibly wrong) date.
      earns:
        (g.rewardEnabled && g.rewardPointsPerTick > 0) ||
        (g.scoreTrusted && g.scoreRewardEnabled) ||
        earnsViaServer,
      isNew: ageDays <= BADGE_NEW_DAYS,
      inNewRow: ageDays <= NEW_ROW_DAYS,
      createdAtMs: g.createdAt.getTime(),
      isHot: rank !== undefined && rank < HOT_TOP,
      popularRank: rank ?? null,
      weekPlays: weekPlays.get(g.id) ?? 0,
    };
  });

  const liveIds = new Set(rows.map((g) => g.id));
  const titleById = new Map(rows.map((g) => [g.id, g.title]));

  let allTimePoints = 0;
  let best: { gameId: string; points: number } | null = null;
  for (const r of earnedByGame) {
    const p = r._sum.points ?? 0;
    allTimePoints += p;
    // Best game must still be playable to be worth pointing at.
    if (p > 0 && liveIds.has(r.gameId) && (!best || p > best.points)) best = { gameId: r.gameId, points: p };
  }

  const stats: CatalogStats = {
    gamesAvailable: rows.length,
    todayPoints,
    allTimePoints,
    gamesPlayed: lastPlayed.length,
    playingNow,
    bestGame: best ? { id: best.gameId, title: titleById.get(best.gameId) ?? "", points: best.points } : null,
  };

  return (
    <GamesCatalog
      initialPlayId={play ?? null}
      games={rows}
      stats={stats}
      recentIds={lastPlayed.map((r) => r.gameId).filter((id) => liveIds.has(id)).slice(0, 10)}
      categoryOrder={categories.filter((c) => c.isActive).map((c) => c.name)}
    />
  );
}
