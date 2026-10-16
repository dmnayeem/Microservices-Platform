import { prisma } from "@/lib/prisma";

/**
 * What one member earned from HTML5 games, read from `GameEarnLog` (one row
 * per game payout: TIME, SCORE or SERVER). Not the ledger — the ledger mixes
 * every source, and game rows are already split out here.
 *
 * Totals cover every game; the per-game list is the top `limit` by all-time
 * points. One groupBy per window plus one game lookup — no per-game queries.
 */

export interface GameEarningRow {
  gameId: string;
  title: string;
  iconUrl: string | null;
  today: number;
  month: number;
  allTime: number;
}

export interface GameEarningsSummary {
  totals: { today: number; month: number; allTime: number };
  games: GameEarningRow[];
}

type GameSumRow = { gameId: string; _sum: { points: number | null } };

function sumByGame(userId: string, since?: Date) {
  // groupBy's result type does not survive inference here (same cast as elsewhere).
  return prisma.gameEarnLog.groupBy({
    by: ["gameId"],
    where: { userId, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { points: true },
  }) as unknown as Promise<GameSumRow[]>;
}

function toMap(rows: GameSumRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.gameId, r._sum.points ?? 0);
  return m;
}

/**
 * Returns null when the member has no game payouts at all, so callers can
 * leave the section out entirely. `dayStart` is optional (the admin view has
 * no "today" column); without it every `today` is 0.
 */
export async function getUserGameEarnings(
  userId: string,
  opts: { monthStart: Date; dayStart?: Date; limit?: number }
): Promise<GameEarningsSummary | null> {
  const limit = opts.limit ?? 20;
  const [allRows, monthRows, dayRows] = await Promise.all([
    sumByGame(userId),
    sumByGame(userId, opts.monthStart),
    opts.dayStart ? sumByGame(userId, opts.dayStart) : Promise.resolve([] as GameSumRow[]),
  ]);
  if (allRows.length === 0) return null;

  const all = toMap(allRows);
  const month = toMap(monthRows);
  const day = toMap(dayRows);

  const sum = (m: Map<string, number>) => {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  };

  const topIds = [...all.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  // GameEarnLog has no FK on purpose, so a deleted game simply has no row here.
  const gameRows = await prisma.game.findMany({
    where: { id: { in: topIds } },
    select: { id: true, title: true, iconUrl: true },
  });
  const byId = new Map(gameRows.map((g) => [g.id, g]));

  return {
    totals: { today: sum(day), month: sum(month), allTime: sum(all) },
    games: topIds.map((id) => {
      const g = byId.get(id);
      return {
        gameId: id,
        title: g?.title ?? "Removed game",
        iconUrl: g?.iconUrl || null,
        today: day.get(id) ?? 0,
        month: month.get(id) ?? 0,
        allTime: all.get(id) ?? 0,
      };
    }),
  };
}

/** Admin view only: all-time points by payout kind. */
export async function getUserGameEarningsByKind(
  userId: string
): Promise<Array<{ kind: string; points: number; count: number }>> {
  const rows = (await prisma.gameEarnLog.groupBy({
    by: ["kind"],
    where: { userId },
    _sum: { points: true },
    _count: { _all: true },
  })) as unknown as Array<{ kind: string; _sum: { points: number | null }; _count: { _all: number } }>;
  return rows
    .map((r) => ({ kind: r.kind, points: r._sum.points ?? 0, count: r._count._all }))
    .sort((a, b) => b.points - a.points);
}

/** Human label for a GameEarnLog.kind. */
export function gameEarnKindLabel(kind: string): string {
  switch (kind) {
    case "TIME":
      return "Time played";
    case "SCORE":
      return "Score";
    case "SERVER":
      return "Game server";
    default:
      return kind.charAt(0) + kind.slice(1).toLowerCase();
  }
}
