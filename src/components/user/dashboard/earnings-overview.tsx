import Link from "next/link";
import { Clock, CheckCircle2, XCircle, Wallet, Users } from "lucide-react";
import { usd } from "@/lib/utils";
import type { EarningsSummary } from "@/lib/dashboard-earnings";

/**
 * Dashboard: what the user earned (today / 7 days / 30 days, a 7-day chart,
 * where it came from) and where their work stands (in review, approved,
 * rejected, withdrawals on the way). Server component — no client JS.
 */
export function EarningsOverview({
  e,
  pointsPerUsd,
  tasks,
  pendingWithdrawal,
}: {
  e: EarningsSummary;
  pointsPerUsd: number;
  tasks: { approved: number; pending: number; rejected: number };
  pendingWithdrawal: { count: number; amount: number };
}) {
  const max = Math.max(1, ...e.days.map((d) => d.points));
  const srcTotal = e.sources.reduce((a, s) => a + s.points, 0) || 1;
  const $ = (p: number) => usd(p / (pointsPerUsd || 1));

  const periods = [
    { label: "Today", pts: e.today },
    { label: "7 days", pts: e.week },
    { label: "30 days", pts: e.month },
  ];

  const status = [
    { label: "In review", value: tasks.pending, icon: Clock, tone: "text-amber-400", href: "/tasks" },
    { label: "Approved", value: tasks.approved, icon: CheckCircle2, tone: "text-emerald-400", href: "/tasks" },
    { label: "Rejected", value: tasks.rejected, icon: XCircle, tone: "text-red-400", href: "/tasks" },
    {
      label: "Withdrawals on the way",
      value: pendingWithdrawal.count,
      sub: pendingWithdrawal.count ? usd(pendingWithdrawal.amount) : undefined,
      icon: Wallet,
      tone: "text-sky-400",
      href: "/wallet",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Earnings */}
      <section className="app-card lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="t-section text-white">My Earnings</h2>
          <Link
            href="/wallet"
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
          >
            Wallet
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {periods.map((p) => (
            <div key={p.label} className="app-tile min-w-0">
              <p className="t-meta text-(--app-ink-3)">{p.label}</p>
              <p className="t-figure-sm mt-1 truncate text-white">
                {p.pts.toLocaleString()} <span className="text-xs font-semibold text-(--app-ink-3)">pts</span>
              </p>
              <p className="t-meta text-(--app-ink-3)">≈ {$(p.pts)}</p>
            </div>
          ))}
        </div>

        {/* 7-day bars — plain CSS, no chart library on the dashboard. */}
        <div className="mt-4">
          <p className="t-meta mb-2 text-(--app-ink-3)">Points earned per day</p>
          <div className="flex h-28 items-end gap-1.5 sm:gap-2" role="img" aria-label="Points earned in the last 7 days">
            {e.days.map((d) => (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.points.toLocaleString()} pts`}>
                <span className="text-[10px] font-bold tabular-nums text-(--app-ink-2)">
                  {d.points ? (d.points >= 1000 ? `${(d.points / 1000).toFixed(1)}k` : d.points) : ""}
                </span>
                <div
                  className={`w-full rounded-t-md ${d.points ? "bg-(image:--app-grad)" : "bg-(--app-surface-2)"}`}
                  style={{ height: `${d.points ? Math.max(6, (d.points / max) * 100) : 4}%` }}
                />
                <span className={`text-[10px] ${d.label === "Today" ? "font-bold text-white" : "text-(--app-ink-3)"}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Where it came from */}
        {e.sources.length > 0 && (
          <div className="mt-4">
            <p className="t-meta mb-2 text-(--app-ink-3)">Where your points came from · last 30 days</p>
            <div className="flex h-2 overflow-hidden rounded-full bg-(--app-surface-2)">
              {e.sources.map((s) => (
                <div key={s.source} className={s.swatch} style={{ width: `${(s.points / srcTotal) * 100}%` }} title={s.label} />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {e.sources.slice(0, 6).map((s) => (
                <li key={s.source} className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.swatch}`} />
                  <span className="truncate text-(--app-ink-2)">{s.label}</span>
                  <span className="ml-auto shrink-0 tabular-nums font-semibold text-white">{s.points.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Activity */}
      <section className="app-card">
        <h2 className="t-section mb-3 text-white">My Activity</h2>
        <ul className="space-y-1">
          {status.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="app-press app-tap-row flex items-center gap-3 rounded-(--app-r-control) px-2 py-2 hover:bg-(--app-surface-2)">
                <s.icon className={`h-4.5 w-4.5 shrink-0 ${s.tone}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-(--app-ink-2)">{s.label}</span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-white">{s.value.toLocaleString()}</span>
                  {s.sub && <span className="block text-[11px] text-(--app-ink-3)">{s.sub}</span>}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/referrals" className="app-press app-tap-row flex items-center gap-3 rounded-(--app-r-control) px-2 py-2 hover:bg-(--app-surface-2)">
              <Users className="h-4.5 w-4.5 shrink-0 text-pink-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-(--app-ink-2)">From my team · 30 days</span>
              <span className="text-sm font-bold tabular-nums text-white">{e.teamPoints.toLocaleString()} pts</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
