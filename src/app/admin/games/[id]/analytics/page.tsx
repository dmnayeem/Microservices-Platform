import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/admin/stat-card";
import {
  AdminTable,
  type AdminColumn,
} from "@/components/admin/ui/admin-table";
import {
  ArrowLeft,
  Gamepad2,
  Users,
  Clock,
  Coins,
  Megaphone,
  Play,
} from "lucide-react";

/** Days of history shown. */
const WINDOW_DAYS = 14;

function hms(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface TopPlayer {
  userId: string;
  name: string;
  sessions: number;
  seconds: number;
  points: number;
}

export default async function GameAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "games.view"))) redirect("/admin");

  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) notFound();

  const since = new Date();
  since.setDate(since.getDate() - (WINDOW_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [sessions, earnRows, uniqueRows] = await Promise.all([
    prisma.gameSession.findMany({
      where: { gameId: id, startedAt: { gte: since } },
      select: {
        userId: true,
        startedAt: true,
        playedSeconds: true,
        pointsAwarded: true,
        adsShown: true,
      },
      // Bounded: a popular game could otherwise pull an unbounded row set into
      // memory just to draw a 14-day chart.
      take: 5000,
      orderBy: { startedAt: "desc" },
    }),
    prisma.gameEarnLog.aggregate({
      where: { gameId: id, createdAt: { gte: since } },
      _sum: { points: true },
    }),
    prisma.gameSession.findMany({
      where: { gameId: id },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  // Day buckets, pre-seeded so empty days still render a column.
  const buckets = new Map<string, { plays: number; players: Set<string>; seconds: number }>();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), {
      plays: 0,
      players: new Set(),
      seconds: 0,
    });
  }
  const byPlayer = new Map<string, { sessions: number; seconds: number; points: number }>();
  let windowSeconds = 0;
  let windowAds = 0;

  for (const s of sessions) {
    const key = s.startedAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.plays += 1;
      b.players.add(s.userId);
      b.seconds += s.playedSeconds;
    }
    windowSeconds += s.playedSeconds;
    windowAds += s.adsShown;
    const p = byPlayer.get(s.userId) ?? { sessions: 0, seconds: 0, points: 0 };
    p.sessions += 1;
    p.seconds += s.playedSeconds;
    p.points += s.pointsAwarded;
    byPlayer.set(s.userId, p);
  }

  const series = [...buckets.entries()].map(([date, b]) => ({
    date,
    plays: b.plays,
    players: b.players.size,
    seconds: b.seconds,
  }));
  const maxPlays = Math.max(1, ...series.map((s) => s.plays));

  const topIds = [...byPlayer.entries()]
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 10)
    .map(([userId]) => userId);
  const users = topIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const topPlayers: TopPlayer[] = topIds.map((uid) => {
    const p = byPlayer.get(uid)!;
    const u = userById.get(uid);
    return {
      userId: uid,
      name: u?.name || u?.email || "Unknown",
      sessions: p.sessions,
      seconds: p.seconds,
      points: p.points,
    };
  });

  const avgSession =
    sessions.length > 0 ? Math.round(windowSeconds / sessions.length) : 0;

  const columns: AdminColumn<TopPlayer>[] = [
    {
      key: "player",
      header: "Player",
      primary: true,
      cell: (p) => (
        <Link
          href={`/admin/users/${p.userId}`}
          className="text-white hover:text-blue-400"
        >
          {p.name}
        </Link>
      ),
    },
    { key: "sessions", header: "Sessions", className: "tabular-nums", cell: (p) => p.sessions },
    { key: "time", header: "Time", className: "tabular-nums", cell: (p) => hms(p.seconds) },
    {
      key: "points",
      header: "Points earned",
      className: "tabular-nums text-amber-400",
      cell: (p) => p.points.toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/games"
          className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800">
            <Gamepad2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{game.title}</h1>
            <p className="text-slate-400 text-sm">
              Play and earning analytics · last {WINDOW_DAYS} days
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Sessions"
          value={sessions.length}
          subtext={`last ${WINDOW_DAYS} days`}
          icon={Play}
          tone="blue"
        />
        <StatCard
          title="Unique players"
          value={uniqueRows.length}
          subtext="all time"
          icon={Users}
          tone="purple"
        />
        <StatCard
          title="Time played"
          value={hms(windowSeconds)}
          subtext={`avg ${hms(avgSession)} / session`}
          icon={Clock}
          tone="indigo"
        />
        <StatCard
          title="Ads shown"
          value={windowAds}
          subtext="server-counted"
          icon={Megaphone}
          tone="orange"
        />
        <StatCard
          title="Points paid"
          value={earnRows._sum.points ?? 0}
          subtext={`${game.pointsAwardedTotal.toLocaleString()} all time`}
          icon={Coins}
          tone="amber"
        />
        <StatCard
          title="Legacy plays"
          value={game.playsCount}
          // The number changed meaning: it used to count client mounts from an
          // endpoint anyone could spam, and now counts real sessions.
          subtext="incl. pre-session counter"
          icon={Gamepad2}
          tone="slate"
        />
      </div>

      {/* Day series. Plain CSS bars, matching the other per-entity analytics
          pages — recharts is only worth loading on the platform-wide dashboard. */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-sm font-bold text-white mb-4">Sessions per day</h2>
        <div className="flex items-end gap-1 h-40">
          {series.map((d) => (
            <div key={d.date} className="flex-1 group relative flex flex-col justify-end h-full">
              <div
                className="w-full rounded-t bg-emerald-500/70 group-hover:bg-emerald-400 transition-colors"
                style={{ height: `${Math.max(2, (d.plays / maxPlays) * 100)}%` }}
              />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded bg-slate-800 border border-slate-700 px-2 py-1 text-[11px] text-white z-10">
                {d.date}: {d.plays} play{d.plays === 1 ? "" : "s"} · {d.players} player
                {d.players === 1 ? "" : "s"} · {hms(d.seconds)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-600">
          <span>{series[0]?.date}</span>
          <span>{series[series.length - 1]?.date}</span>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-white mb-3">Top players</h2>
        <AdminTable<TopPlayer>
          columns={columns}
          rows={topPlayers}
          getRowKey={(p) => p.userId}
          empty={
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-10 text-center text-slate-500 text-sm">
              Nobody has played this game in the last {WINDOW_DAYS} days.
            </div>
          }
        />
      </div>

      {sessions.length >= 5000 && (
        <p className="text-[11px] text-amber-400">
          Showing the 5,000 most recent sessions in this window — older ones are
          excluded from the chart and the player table.
        </p>
      )}
    </div>
  );
}
