import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Smartphone, Users, Percent, CalendarDays, Gift, Globe, Search, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parsePage } from "@/lib/paginate";
import { getPwaRewardConfig } from "@/lib/pwa-install";
import { PWA_PLATFORMS, PWA_PLATFORM_LABEL, type PwaPlatform } from "@/lib/pwa-shared";
import {
  LEGACY_PWA_HOST,
  PWA_ROW_SELECT,
  parsePwaInstallFilters,
  pwaInstallStats,
  pwaInstallWhere,
} from "@/lib/pwa-admin";
import { PwaRewardSettings } from "@/components/admin/users/pwa-reward-settings";

/**
 * Who installed the app (PWA) and who didn't. "Installed" = the app was opened
 * from the home screen at least once, or the browser reported the install
 * (lib/pwa-install.ts). Staff are not counted.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

export default async function AppInstallsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "users.view"))) redirect("/admin");

  const p = await searchParams;
  const f = parsePwaInstallFilters(p);
  const page = parsePage(p.page);
  const where = pwaInstallWhere(f);

  const [stats, cfg, canEdit, total, rows] = await Promise.all([
    pwaInstallStats(),
    getPwaRewardConfig(),
    can(session.user.id, "settings.edit"),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: PWA_ROW_SELECT,
      orderBy: f.status === "not" ? { createdAt: "desc" } : { pwaFirstSeenAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string | number | undefined>) => {
    const next: Record<string, string | number | undefined> = {
      status: f.status,
      platform: f.platform || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      q: f.q || undefined,
      ...over,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "") sp.set(k, String(v));
    return sp.toString();
  };
  const href = (over: Record<string, string | number | undefined>) => `/admin/users/app-installs?${qs(over)}`;

  const cards = [
    { label: "Installed users", value: stats.total.toLocaleString(), icon: Smartphone, tone: "text-emerald-400" },
    {
      label: "Of active users",
      value: `${stats.activePct.toFixed(1)}%`,
      sub: `${stats.activeInstalled.toLocaleString()} of ${stats.activeUsers.toLocaleString()} active in 30 days`,
      icon: Percent,
      tone: "text-sky-400",
    },
    {
      label: "New installs, 7 days",
      value: stats.last7.toLocaleString(),
      sub: `${stats.last30.toLocaleString()} in 30 days`,
      icon: CalendarDays,
      tone: "text-indigo-400",
    },
    {
      label: "Install reward paid",
      value: stats.rewarded.toLocaleString(),
      sub: `${stats.pointsPaid.toLocaleString()} points in total`,
      icon: Gift,
      tone: "text-amber-400",
    },
    {
      label: `Opened on ${LEGACY_PWA_HOST}`,
      value: stats.legacyWww.toLocaleString(),
      sub: "legacy www installs (last host seen)",
      icon: Globe,
      tone: "text-violet-400",
    },
  ];

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-indigo-500/60 bg-indigo-500/15 text-white" : "border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white"
    }`;
  const fmt = (d: Date | null) => (d ? format(d, "MMM d, yyyy") : "—");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Smartphone className="h-6 w-6 text-emerald-400" /> App Installs
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Users who installed the app (opened it from the home screen, or the browser reported the install) and who
          haven&apos;t. Days are counted in UTC. Staff are not counted.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <c.icon className={`h-4 w-4 shrink-0 ${c.tone}`} />
              <span className="truncate">{c.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{c.value}</p>
            {c.sub && <p className="text-xs text-gray-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs text-gray-400">
          <Users className="h-4 w-4 text-gray-500" /> Installed users by platform
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PWA_PLATFORMS.map((pl) => {
            const n = stats.platforms[pl];
            const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
            return (
              <Link key={pl} href={href({ status: "installed", platform: pl, page: undefined })} className="block">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-gray-300">{PWA_PLATFORM_LABEL[pl]}</span>
                  <span className="tabular-nums text-white">{n.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <PwaRewardSettings initial={cfg} canEdit={canEdit} />

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["installed", "Installed"],
              ["not", "Not installed"],
              ["all", "Everyone"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={href({ status: k, page: undefined })} className={chip(f.status === k)}>
              {label}
            </Link>
          ))}
          <a
            href={`/api/admin/users/app-installs/export?${qs({ page: undefined })}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
          >
            <Download className="h-4 w-4" /> CSV
          </a>
        </div>
        <form action="/admin/users/app-installs" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="status" value={f.status} />
          {f.status !== "not" && (
            <label className="space-y-1 text-xs text-gray-500">
              Platform
              <select
                name="platform"
                defaultValue={f.platform}
                className="block rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                {PWA_PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>
                    {PWA_PLATFORM_LABEL[pl as PwaPlatform]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs text-gray-500">
            {f.status === "installed" ? "Installed from" : "Joined from"}
            <input
              type="date"
              name="from"
              defaultValue={f.from}
              className="block rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-500">
            to
            <input
              type="date"
              name="to"
              defaultValue={f.to}
              className="block rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Name, email or username"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 py-1.5 pl-8 pr-3 text-sm text-white"
            />
          </div>
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
            Apply
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3 text-sm text-white">
          <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>{" "}
          {f.status === "installed" ? "installed users" : f.status === "not" ? "users without the app" : "users"}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-gray-500">
            {f.q ? "No user matches that search." : "Nobody here yet — installs are recorded as users open the app."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-3 py-3">Platform</th>
                  <th className="px-3 py-3">First seen</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-3 py-3">Days</th>
                  <th className="px-3 py-3">Rewarded</th>
                  <th className="px-3 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="group block min-w-0">
                        <span className="font-medium text-white group-hover:underline">{u.name || u.username || "—"}</span>
                        <span className="block max-w-[14rem] truncate text-xs text-gray-500">{u.email}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-300">
                      {u.pwaPlatform ? PWA_PLATFORM_LABEL[u.pwaPlatform as PwaPlatform] ?? u.pwaPlatform : "—"}
                      {u.pwaHost === LEGACY_PWA_HOST && (
                        <span className="ml-1.5 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">www</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-300">{fmt(u.pwaFirstSeenAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-300">{fmt(u.pwaLastSeenAt)}</td>
                    <td className="px-3 py-3 tabular-nums text-white">{u.pwaDays}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {u.pwaRewardedAt ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                          {fmt(u.pwaRewardedAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-400">{fmt(u.createdAt)}</td>
                  </tr>
                ))}
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
