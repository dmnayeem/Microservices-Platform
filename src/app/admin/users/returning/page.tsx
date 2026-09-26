import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarCheck, Flame, Repeat, UserCheck, Users, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parsePage } from "@/lib/paginate";
import { activeDaysOf, returningStats, returningUsers, utcDay } from "@/lib/active-days";
import { CountryFlag } from "@/components/admin/ui/country-flag";

/**
 * Who comes back, and who comes every day. Read from `UserActiveDay` — one row
 * per account per UTC day it opened the app (lib/active-days.ts).
 */

interface PageProps {
  searchParams: Promise<{ view?: string; days?: string; streak?: string; sort?: string; q?: string; page?: string }>;
}

const WINDOWS = [7, 14, 30] as const;
const STREAKS = [3, 7, 14, 30] as const;
const STRIP_DAYS = 14;
const PAGE_SIZE = 50;

export default async function ReturningUsersPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "users.view"))) redirect("/admin");

  const p = await searchParams;
  const view = p.view === "daily" ? "daily" : "returning";
  const days = (WINDOWS as readonly number[]).includes(Number(p.days)) ? Number(p.days) : 30;
  const minStreak =
    view === "daily" ? ((STREAKS as readonly number[]).includes(Number(p.streak)) ? Number(p.streak) : 7) : 0;
  const sort = p.sort === "streak" || p.sort === "recent" || p.sort === "days" ? p.sort : view === "daily" ? "streak" : "days";
  const q = (p.q ?? "").trim();
  const page = parsePage(p.page);

  const [stats, { rows, total }] = await Promise.all([
    returningStats(),
    returningUsers({ windowDays: days, minStreak, search: q, sort, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
  ]);
  const ids = rows.map((r) => r.userId);
  const [users, dayMap] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, username: true, createdAt: true, lastCountry: true, signupCountry: true },
    }),
    activeDaysOf(ids, utcDay(STRIP_DAYS - 1)),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  // Oldest → newest, so the strip reads left to right like a calendar.
  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => utcDay(STRIP_DAYS - 1 - i).toISOString().slice(0, 10));
  const today = strip[strip.length - 1];
  // A YYYY-MM-DD as a local date for display (new Date("2026-09-27") is UTC
  // midnight, which prints as the previous day west of UTC).
  const dayLabel = (d: string, f: string) => format(new Date(`${d}T12:00:00`), f);

  const href = (over: Record<string, string | number | undefined>) => {
    const next = { view, days, streak: view === "daily" ? minStreak : undefined, sort, q: q || undefined, ...over };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "") sp.set(k, String(v));
    return `/admin/users/returning?${sp.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cards = [
    { label: "Opened the app today", value: stats.activeToday, icon: Users, tone: "text-sky-400" },
    { label: "Returning today", value: stats.returningToday, sub: "joined on an earlier day", icon: Repeat, tone: "text-indigo-400" },
    { label: "Returning, last 7 days", value: stats.returning7, sub: `${stats.returning30} in 30 days`, icon: UserCheck, tone: "text-violet-400" },
    { label: "Came every day", value: stats.daily7, sub: "7+ day streak", icon: Flame, tone: "text-orange-400" },
    { label: "Regulars", value: stats.regular7, sub: "4+ of the last 7 days", icon: CalendarCheck, tone: "text-emerald-400" },
  ];

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-indigo-500/60 bg-indigo-500/15 text-white" : "border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <CalendarCheck className="h-6 w-6 text-indigo-400" /> Returning Users
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Users who came back on a later day than they signed up, and who comes every day. A day counts when the user
          opens the app (UTC days). Staff are not counted.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <c.icon className={`h-4 w-4 ${c.tone}`} />
              {c.label}
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{c.value.toLocaleString()}</p>
            {c.sub && <p className="text-xs text-gray-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ view: "returning", streak: undefined, sort: "days", page: undefined })} className={chip(view === "returning")}>
            Returning users
          </Link>
          <Link href={href({ view: "daily", streak: 7, sort: "streak", page: undefined })} className={chip(view === "daily")}>
            Comes daily
          </Link>
          <form action="/admin/users/returning" className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="days" value={days} />
            {view === "daily" && <input type="hidden" name="streak" value={minStreak} />}
            <input type="hidden" name="sort" value={sort} />
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, email or username"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 py-1.5 pl-8 pr-3 text-sm text-white"
              />
            </div>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
          <span className="flex flex-wrap items-center gap-1.5">
            Window:
            {WINDOWS.map((w) => (
              <Link key={w} href={href({ days: w, page: undefined })} className={chip(days === w)}>
                {w} days
              </Link>
            ))}
          </span>
          {view === "daily" && (
            <span className="flex flex-wrap items-center gap-1.5">
              Came every day for at least:
              {STREAKS.map((s) => (
                <Link key={s} href={href({ streak: s, page: undefined })} className={chip(minStreak === s)}>
                  {s} days
                </Link>
              ))}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5">
            Sort:
            {(
              [
                ["days", "Most days"],
                ["streak", "Longest streak"],
                ["recent", "Last seen"],
              ] as const
            ).map(([k, label]) => (
              <Link key={k} href={href({ sort: k, page: undefined })} className={chip(sort === k)}>
                {label}
              </Link>
            ))}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 text-sm">
          <span className="text-white">
            <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>{" "}
            {view === "daily" ? `users came every day for ${minStreak}+ days` : `returning users in the last ${days} days`}
          </span>
          <span className="hidden text-xs text-gray-500 sm:inline">
            Last {STRIP_DAYS} days, oldest → today: <span className="text-emerald-400">■</span> came{" "}
            <span className="text-gray-600">■</span> did not
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-gray-500">
            {q ? "No user matches that search." : "Nobody yet — days are recorded as users open the app."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-3 py-3">Days active</th>
                  <th className="px-3 py-3">Streak</th>
                  <th className="px-3 py-3">Last {STRIP_DAYS} days</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-3 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = byId.get(r.userId);
                  const seen = dayMap.get(r.userId) ?? new Set<string>();
                  const lastDay = new Date(r.lastDay).toISOString().slice(0, 10);
                  return (
                    <tr key={r.userId} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${r.userId}`} className="group block min-w-0">
                          <span className="flex items-center gap-1.5 font-medium text-white group-hover:underline">
                            {u?.name || u?.username || "—"}
                            <CountryFlag code={u?.lastCountry ?? u?.signupCountry ?? null} />
                          </span>
                          <span className="block max-w-[14rem] truncate text-xs text-gray-500">{u?.email}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-white">
                        {r.days}
                        <span className="text-gray-500">/{days}</span>
                      </td>
                      <td className="px-3 py-3">
                        {r.streak > 0 ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-semibold text-orange-400">
                            <Flame className="h-3 w-3" /> {r.streak} day{r.streak === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-0.5">
                          {strip.map((d) => (
                            <span
                              key={d}
                              title={`${dayLabel(d, "EEE, MMM d")}: ${seen.has(d) ? "came" : "did not come"}`}
                              className={`h-4 w-2.5 rounded-sm ${seen.has(d) ? "bg-emerald-500" : "bg-gray-800"} ${
                                d === today ? "ring-1 ring-gray-500" : ""
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-300">
                        {lastDay === today ? "Today" : dayLabel(lastDay, "MMM d")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-400">
                        {u ? `${formatDistanceToNowStrict(u.createdAt)} ago` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 px-4 py-3 text-sm text-gray-400">
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} className={chip(false)}>
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link href={href({ page: page + 1 })} className={chip(false)}>
                  Next
                </Link>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
