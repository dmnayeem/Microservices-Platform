import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  UserPlus,
  Users,
  Repeat,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Wallet,
  Share2,
  Network,
  DollarSign,
  ArrowDownToLine,
  BadgeCheck,
} from "lucide-react";
import { can } from "@/lib/permissions";
import { pts, usd } from "@/lib/utils";
import { POINT_SOURCE_META } from "@/lib/finance/points-source";
import { PERIODS, getProgressReport, resolvePeriod, type Pair } from "@/lib/progress-report";
import { SeriesChart } from "@/components/admin/charts";

/**
 * Progress Report — today / this week / this month / any range, each figure
 * next to the period before it, so "are we growing?" has one place to look.
 * Computation: lib/progress-report.ts.
 */

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string; ref?: string }>;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (s: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

function Change({ p, money = false }: { p: Pair; money?: boolean }) {
  if (p.prev === 0 && p.cur === 0) return <span className="text-xs text-gray-500">no change</span>;
  if (p.prev === 0) return <span className="text-xs font-semibold text-emerald-400">new</span>;
  const diff = p.cur - p.prev;
  const pctv = Math.round((diff / p.prev) * 100);
  const up = diff >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {pctv}%
      <span className="font-normal text-gray-500">
        (was {money ? usd(p.prev) : pts(p.prev)})
      </span>
    </span>
  );
}

function Kpi({
  label,
  p,
  icon: Icon,
  tone,
  hint,
  money = false,
  suffix,
}: {
  label: string;
  p: Pair;
  icon: typeof Users;
  tone: string;
  hint?: string;
  money?: boolean;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4" title={hint}>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Icon className={`h-4 w-4 ${tone}`} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-white">
        {money ? usd(p.cur) : pts(p.cur)}
        {suffix && <span className="ml-1 text-sm font-medium text-gray-500">{suffix}</span>}
      </p>
      <div className="mt-0.5">
        <Change p={p} money={money} />
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function ProgressReportPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "analytics.view"))) redirect("/admin");
  // Points are task income and every admin sees them; cash is finance only.
  const seesMoney = await can(session.user.id, "finance.view");

  const sp = await searchParams;
  const period = resolvePeriod(sp.period, sp.from, sp.to);
  const refAll = sp.ref === "all";
  const r = await getProgressReport(period, seesMoney, refAll);

  const lastDay = new Date(period.to.getTime() - 86_400_000);
  const prevLast = new Date(period.prevTo.getTime() - 86_400_000);
  const range = (a: Date, b: Date) =>
    ymd(a) === ymd(b) ? dayLabel(ymd(a), { weekday: "short", month: "short", day: "numeric" }) : `${dayLabel(ymd(a))} – ${dayLabel(ymd(b))}`;

  const qs = (over: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      period: period.key,
      from: period.key === "custom" ? ymd(period.from) : undefined,
      to: period.key === "custom" ? ymd(lastDay) : undefined,
      ref: refAll ? "all" : undefined,
      ...over,
    };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    return `/admin/progress?${u.toString()}`;
  };
  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-indigo-500/60 bg-indigo-500/15 text-white" : "border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white"
    }`;

  const sourceTotal = r.bySource.reduce((a, s) => a + s.points, 0) || 1;
  const referredShare = r.signups.cur ? Math.round((r.referredSignups.cur / r.signups.cur) * 100) : 0;
  const perActive = r.active.cur ? Math.round(r.pointsEarned.cur / r.active.cur) : 0;
  const chartData = r.daily.map((d) => ({ ...d, date: dayLabel(d.date) }));
  const inPeriod = (d: string) => d >= ymd(period.from) && d < ymd(period.to);

  return (
    <div className="space-y-8">
      {/* Header + period picker */}
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <TrendingUp className="h-6 w-6 text-indigo-400" /> Progress Report
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="font-semibold text-white">{range(period.from, lastDay)}</span> compared with{" "}
            {range(period.prevFrom, prevLast)}. Days run on UTC (6:00 AM to 5:59 AM Bangladesh time). Staff accounts are
            not counted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.filter((p) => p.key !== "custom").map((p) => (
            <Link key={p.key} href={qs({ period: p.key, from: undefined, to: undefined })} className={chip(period.key === p.key)}>
              {p.label}
            </Link>
          ))}
          <form action="/admin/progress" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="period" value="custom" />
            {refAll && <input type="hidden" name="ref" value="all" />}
            <input
              type="date"
              name="from"
              defaultValue={ymd(period.from)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white [color-scheme:dark]"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              name="to"
              defaultValue={ymd(lastDay)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white [color-scheme:dark]"
            />
            <button type="submit" className={chip(period.key === "custom")}>
              Show
            </button>
          </form>
        </div>
      </div>

      {/* Users */}
      <Section
        title="Users"
        sub="Who joined, who opened the app, and who came back. App visits before 26 Sep 2026 are rebuilt from what users did (tasks, missions, posts, logins); from then on every visit counts."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="New signups" p={r.signups} icon={UserPlus} tone="text-sky-400" />
          <Kpi label="Opened the app" p={r.active} icon={Users} tone="text-indigo-400" hint="Distinct users who opened the app in the period" />
          <Kpi label="Returning users" p={r.returning} icon={Repeat} tone="text-violet-400" hint="Came on a later day than they signed up" />
          {period.days > 1 ? (
            <Kpi
              label={`Came all ${period.days} days`}
              p={r.everyDay}
              icon={CalendarCheck}
              tone="text-orange-400"
              hint="Opened the app on every day of the period"
            />
          ) : (
            <Kpi label="Users who earned" p={r.earners} icon={BadgeCheck} tone="text-orange-400" />
          )}
          <Kpi label="Tasks completed" p={r.tasksCompleted} icon={CheckCircle2} tone="text-emerald-400" hint="Submissions approved in the period" />
          {period.days > 1 && <Kpi label="Users who earned" p={r.earners} icon={BadgeCheck} tone="text-teal-400" />}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/users/returning" className="text-indigo-400 hover:underline">
            See who is returning and who comes daily →
          </Link>
        </div>
      </Section>

      {/* Earnings */}
      <Section title="Earnings (points)" sub="Points users earned in the period, and where they came from.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Points earned by users" p={r.pointsEarned} icon={Coins} tone="text-amber-400" suffix="pts" />
          <Kpi label="Referral commission" p={r.commissionPoints} icon={Share2} tone="text-pink-400" suffix="pts" />
          <div className="col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-4 md:col-span-1">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Wallet className="h-4 w-4 text-cyan-400" /> Per active user
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">
              {pts(perActive)} <span className="text-sm font-medium text-gray-500">pts</span>
            </p>
            <p className="text-xs text-gray-500">
              points earned ÷ users who opened the app
              {seesMoney && ` · ≈ ${usd(r.pointsEarned.cur / r.pointsPerUsd)} total`}
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Where the points came from</h3>
            {r.bySource.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No points earned in this period.</p>
            ) : (
              <ul className="space-y-2.5">
                {r.bySource.map((s) => {
                  const m = POINT_SOURCE_META[s.source];
                  const share = Math.round((s.points / sourceTotal) * 100);
                  return (
                    <li key={s.source} title={m.hint}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-gray-200">{m.label}</span>
                        <span className="tabular-nums text-white">
                          {pts(s.points)} <span className="text-xs text-gray-500">{share}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-800">
                        <div className={`h-full rounded-full ${m.swatch}`} style={{ width: `${Math.max(share, 1)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Top earners in this period</h3>
            {r.topEarners.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">Nobody earned in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2">#</th>
                    <th className="pb-2">User</th>
                    <th className="pb-2 text-right">Tasks</th>
                    <th className="pb-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topEarners.map((u, i) => (
                    <tr key={u.userId} className="border-t border-gray-800/60">
                      <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
                      <td className="py-2">
                        <Link href={`/admin/users/${u.userId}`} className="block max-w-[14rem] truncate text-white hover:underline">
                          {u.name || u.email}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-400">{u.tasks}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-amber-300">{pts(u.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Section>

      {/* Referrals & teams */}
      <Section title="Referrals & teams" sub="Who is bringing people in, and whether their team is active.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Signups through a referral" p={r.referredSignups} icon={Share2} tone="text-pink-400" />
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Network className="h-4 w-4 text-fuchsia-400" /> Share of signups referred
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{referredShare}%</p>
            <p className="text-xs text-gray-500">
              {r.referredSignups.cur} of {r.signups.cur} new users
            </p>
          </div>
          <Kpi label="Commission paid" p={r.commissionPoints} icon={Coins} tone="text-amber-400" suffix="pts" />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Top referrers</h3>
            <div className="flex gap-1.5">
              <Link href={qs({ ref: undefined })} className={chip(!refAll)}>
                This period
              </Link>
              <Link href={qs({ ref: "all" })} className={chip(refAll)}>
                All time
              </Link>
            </div>
          </div>
          {r.topReferrers.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              Nobody referred anyone in this period.{" "}
              {!refAll && (
                <Link href={qs({ ref: "all" })} className="text-indigo-400 hover:underline">
                  See all time
                </Link>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-3 py-2.5">Referrer</th>
                    <th className="px-3 py-2.5 text-right">{refAll ? "Referred (all time)" : "New referrals"}</th>
                    <th className="px-3 py-2.5 text-right">Team size</th>
                    <th className="px-3 py-2.5 text-right" title="Team members who opened the app in the selected period">
                      Team active
                    </th>
                    <th className="px-3 py-2.5 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topReferrers.map((u, i) => (
                    <tr key={u.userId} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                      <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/users/${u.userId}`} className="block max-w-[16rem] truncate text-white hover:underline">
                          {u.name || u.email}
                        </Link>
                        <span className="block max-w-[16rem] truncate text-xs text-gray-500">{u.email}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-white">{u.newReferrals}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{u.teamSize}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={u.teamActive ? "text-emerald-400" : "text-gray-500"}>{u.teamActive}</span>
                        {u.teamSize > 0 && (
                          <span className="text-xs text-gray-500"> ({Math.round((u.teamActive / u.teamSize) * 100)}%)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{pts(u.commissionPoints)} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-gray-800 px-4 py-2.5 text-xs text-gray-500">
            Team = people they referred directly. Full trees are on{" "}
            <Link href="/admin/referrals" className="text-indigo-400 hover:underline">
              Referrals
            </Link>
            .
          </div>
        </div>
      </Section>

      {/* Money — finance only */}
      {r.money && (
        <Section title="Money" sub="Visible to finance only.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="Platform revenue" p={r.money.revenue} icon={DollarSign} tone="text-emerald-400" money />
            <Kpi
              label={`Withdrawals requested (${r.money.withdrawalsRequested.count})`}
              p={r.money.withdrawalsRequested}
              icon={ArrowDownToLine}
              tone="text-orange-400"
              money
            />
            <Kpi
              label={`Withdrawals paid (${r.money.withdrawalsPaid.count})`}
              p={r.money.withdrawalsPaid}
              icon={Wallet}
              tone="text-red-400"
              money
            />
          </div>
          {r.money.streams.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.money.streams.map((s) => (
                <span key={s.key} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300" title={s.from}>
                  {s.label}: <span className="font-semibold text-white">{usd(s.usd)}</span>
                </span>
              ))}
              <Link href="/admin/finance" className="self-center text-sm text-indigo-400 hover:underline">
                Full finance →
              </Link>
            </div>
          )}
        </Section>
      )}

      {/* Day by day */}
      <Section
        title="Day by day"
        sub={period.days < 14 ? "The last 14 days, so a single day has something to compare with." : undefined}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">Users</h3>
            <SeriesChart
              data={chartData}
              kind="line"
              height={240}
              series={[
                { key: "active", label: "Opened the app", color: "#818cf8" },
                { key: "returning", label: "Returning", color: "#a78bfa" },
                { key: "signups", label: "New signups", color: "#38bdf8" },
                { key: "referred", label: "Referred", color: "#f472b6" },
              ]}
            />
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">Points earned</h3>
            <SeriesChart
              data={chartData}
              kind="bar"
              height={240}
              series={[{ key: "points", label: "Points earned", color: "#fbbf24" }]}
              legend={false}
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Day</th>
                <th className="px-3 py-2.5 text-right">New signups</th>
                <th className="px-3 py-2.5 text-right">Opened app</th>
                <th className="px-3 py-2.5 text-right">Returning</th>
                <th className="px-3 py-2.5 text-right">Referred</th>
                <th className="px-3 py-2.5 text-right">Tasks done</th>
                <th className="px-3 py-2.5 text-right">Points earned</th>
              </tr>
            </thead>
            <tbody>
              {[...r.daily].reverse().map((d) => (
                <tr key={d.date} className={`border-t border-gray-800/60 ${inPeriod(d.date) ? "" : "opacity-50"}`}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-300">
                    {dayLabel(d.date, { weekday: "short", month: "short", day: "numeric" })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{d.signups}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{d.active}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{d.returning}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{d.referred}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{d.tasks}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-300">{pts(d.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
