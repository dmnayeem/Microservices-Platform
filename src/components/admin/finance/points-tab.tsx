import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Coins, Hand, ListChecks, Users } from "lucide-react";
import { usd, pts } from "@/lib/utils";
import { POINT_SOURCE_META } from "@/lib/finance/points-source";
import type { PointsBreakdown } from "@/lib/finance/points-breakdown";

const TASK_TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video",
  ARTICLE: "Article",
  SOCIAL: "Social",
  QUIZ: "Quiz tasks",
  SURVEY: "Survey",
  APP_INSTALL: "App install",
  PROXY: "Proxy",
  CUSTOM: "Custom",
  MANUAL: "Manual",
  UNKNOWN: "Task since deleted",
};

/**
 * Where the points came from, and who got them. Server-rendered from
 * `getPointsBreakdown` — the same row rule as the Overview card, so the total
 * at the top is always the card's number for the same period.
 */
export function PointsTab({ data, rangeLabel }: { data: PointsBreakdown; rangeLabel: string }) {
  const { totalPoints, pointsPerUsd } = data;
  const share = (p: number) => (totalPoints > 0 ? Math.round((p / totalPoints) * 1000) / 10 : 0);
  const top = data.bySource[0];

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-400" /> Points given to users
          </p>
          <p className="text-[11px] text-slate-500">{rangeLabel} · UTC</p>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-1">
          <p className="text-3xl font-bold tabular-nums text-white">{pts(totalPoints)}</p>
          <p className="text-sm text-slate-400">
            = {usd(totalPoints / pointsPerUsd)} · {data.totalRows} payments · {data.byUser.length} people
          </p>
        </div>
        {top && totalPoints > 0 && (
          <p className="mt-2 text-sm text-slate-300">
            Biggest source: <b className="text-white">{POINT_SOURCE_META[top.source].label}</b> —{" "}
            {pts(top.points)} ({share(top.points)}%)
            {top.users === 1 ? ", all to one person" : `, to ${top.users} people`}.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          {data.staffPoints > 0 && <span>Of which to staff accounts: {pts(data.staffPoints)}</span>}
          {data.deductedPoints > 0 && <span>Taken back (penalties / admin debits): {pts(data.deductedPoints)}</span>}
        </div>
      </div>

      {/* A note on history — the old prize rule is why the leaderboard line is so large. */}
      {data.bySource.some((s) => s.source === "leaderboard") && (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            <b>Leaderboard prizes up to 26 Sep 2026 were ranked on all-time totals</b>, so the same all-time leader won
            the daily prize every day. From 26 Sep each daily / weekly / monthly prize goes to whoever did the most{" "}
            <i>in that day / week / month</i>, and a period with no activity pays nothing. Prize amounts are set on
            the Leaderboard settings page.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* By source */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-3">
          <p className="mb-3 text-sm font-semibold text-white">Where the points came from</p>
          {data.bySource.length === 0 ? (
            <p className="text-sm text-slate-500">No points were given in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {data.bySource.map((s) => {
                const meta = POINT_SOURCE_META[s.source];
                return (
                  <div key={s.source}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-200" title={meta.hint}>
                        {meta.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-white font-semibold">
                        {pts(s.points)} <span className="text-xs font-normal text-slate-500">{share(s.points)}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full ${meta.swatch}`} style={{ width: `${Math.max(1, share(s.points))}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {usd(s.points / pointsPerUsd)} · {s.rows} payment{s.rows === 1 ? "" : "s"} · {s.users}{" "}
                      {s.users === 1 ? "person" : "people"} · {meta.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tasks by type */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-white inline-flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-indigo-400" /> Task points by task type
          </p>
          {data.taskByType.length === 0 ? (
            <p className="text-sm text-slate-500">No task was paid in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.taskByType.map((t) => (
                  <tr key={t.type} className="border-t border-slate-800 first:border-0">
                    <td className="py-1.5 text-slate-300">{TASK_TYPE_LABEL[t.type] ?? t.type}</td>
                    <td className="py-1.5 text-right tabular-nums text-white">{pts(t.points)}</td>
                    <td className="py-1.5 pl-3 text-right text-xs tabular-nums text-slate-500">{t.rows} paid</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* By user */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-sm font-semibold text-white inline-flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-400" /> Who got them
          <span className="text-xs font-normal text-slate-500">
            {data.byUser.length > 50 ? `top 50 of ${data.byUser.length}` : `${data.byUser.length} people`}
          </span>
        </p>
        {data.byUser.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody.</p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 text-left">User</th>
                  <th className="pb-2 text-right">Points</th>
                  <th className="pb-2 text-right">Value</th>
                  <th className="pb-2 pl-4 text-left">From</th>
                </tr>
              </thead>
              <tbody>
                {data.byUser.slice(0, 50).map((u) => (
                  <tr key={u.userId} className="border-t border-slate-800 align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/users/${u.userId}`} className="text-blue-400 hover:underline">
                        {u.name || u.email}
                      </Link>
                      {u.staff && (
                        <span className="ml-1.5 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">STAFF</span>
                      )}
                      {u.name && <span className="block text-[11px] text-slate-500">{u.email}</span>}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-white">{pts(u.points)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{usd(u.points / pointsPerUsd)}</td>
                    <td className="py-2 pl-4">
                      <div className="flex flex-wrap gap-1">
                        {u.sources.map((s) => (
                          <span
                            key={s.source}
                            className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${POINT_SOURCE_META[s.source].swatch}`} />
                            {POINT_SOURCE_META[s.source].label} {pts(s.points)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin hand grants */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-1 text-sm font-semibold text-white inline-flex items-center gap-2">
          <Hand className="h-4 w-4 text-red-400" /> Points added by hand
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Balance an admin added from the user editor. Each one is shown with who did it, where that was recorded.
        </p>
        {data.adminGrants.length === 0 ? (
          <p className="text-sm text-slate-500">None in this period.</p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 text-left">When</th>
                  <th className="pb-2 text-left">To</th>
                  <th className="pb-2 text-right">Points</th>
                  <th className="pb-2 pl-4 text-left">Note</th>
                  <th className="pb-2 pl-4 text-left">By</th>
                </tr>
              </thead>
              <tbody>
                {data.adminGrants.map((g) => (
                  <tr key={g.id} className="border-t border-slate-800">
                    <td className="py-2 whitespace-nowrap text-slate-400">{format(g.createdAt, "d MMM yyyy, HH:mm")}</td>
                    <td className="py-2">
                      <Link href={`/admin/users/${g.userId}`} className="text-blue-400 hover:underline">
                        {g.userName || g.userEmail}
                      </Link>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-white">{pts(g.points)}</td>
                    <td className="py-2 pl-4 text-slate-300">{g.description || "—"}</td>
                    <td className="py-2 pl-4 text-slate-400">{g.grantedBy ?? "not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
