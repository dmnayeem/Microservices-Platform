import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BellRing, BellOff, Bell, Users, Mail, MailX, Smartphone, Search, Download, HelpCircle } from "lucide-react";
import { can } from "@/lib/permissions";
import { parsePage } from "@/lib/paginate";
import { PWA_PLATFORMS, PWA_PLATFORM_LABEL, type PwaPlatform } from "@/lib/pwa-shared";
import { parseReachFilters, reachPage, reachStats, PUSH_REMINDER_COOLDOWN_DAYS } from "@/lib/notification-reach";
import { NotificationReachTable } from "@/components/admin/users/notification-reach-table";

/**
 * Who can be reached by push / email and who can't, so the owner can nudge the
 * ones who are off. Definitions live in lib/notification-reach.ts. Staff are not
 * counted. Per load: the summary (1 aggregate query, cached 60 s), the page rows
 * (1 query incl. the total) and one batched lookup of device counts + last active.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

export default async function NotificationReachPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "users.view"))) redirect("/admin");

  const p = await searchParams;
  const f = parseReachFilters(p);
  const page = parsePage(p.page);

  const [stats, canRemind, { rows, total }] = await Promise.all([
    reachStats(),
    can(session.user.id, "notifications.send"),
    reachPage(f, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v && !(k === "status" && v === "all") && !(k === "accounts" && v === "active")) filterParams[k] = v;

  const qs = (over: Record<string, string | number | undefined>) => {
    const next: Record<string, string | number | undefined> = { ...filterParams, ...over };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "") sp.set(k, String(v));
    return sp.toString();
  };
  const href = (over: Record<string, string | number | undefined>) => `/admin/users/notification-reach?${qs(over)}`;

  const pct = (n: number) => (stats.users > 0 ? `${((n / stats.users) * 100).toFixed(1)}%` : "0%");
  const cards = [
    { label: "Active users", value: stats.users.toLocaleString(), sub: "ACTIVE accounts, staff excluded", icon: Users, tone: "text-gray-300" },
    { label: "Push on", value: stats.pushOn.toLocaleString(), sub: `${pct(stats.pushOn)} of active users`, icon: BellRing, tone: "text-emerald-400", to: "on" },
    { label: "Push off (setting)", value: stats.pushOff.toLocaleString(), sub: `${pct(stats.pushOff)} — switched off in settings`, icon: BellOff, tone: "text-rose-400", to: "off" },
    { label: "Push not set up", value: stats.notSet.toLocaleString(), sub: `${pct(stats.notSet)} — never allowed in a browser`, icon: HelpCircle, tone: "text-amber-400", to: "notset" },
    { label: "Email on", value: stats.emailOn.toLocaleString(), sub: pct(stats.emailOn), icon: Mail, tone: "text-sky-400" },
    { label: "Email off", value: stats.emailOff.toLocaleString(), sub: `${pct(stats.emailOff)} — unsubscribed or switched off`, icon: MailX, tone: "text-violet-400" },
    {
      label: "App installed, no push",
      value: stats.installedNoPush.toLocaleString(),
      sub: `of ${stats.installed.toLocaleString()} with the app`,
      icon: Smartphone,
      tone: "text-indigo-400",
      to: "app",
    },
  ];

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-indigo-500/60 bg-indigo-500/15 text-white" : "border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white"
    }`;

  const tableRows = rows.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    status: u.status,
    pushState: u.pushState,
    devices: u.devices,
    emailOn: u.emailOn,
    installed: !!u.pwaFirstSeenAt,
    platform: u.pwaPlatform,
    lastActive: u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 10) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <BellRing className="h-6 w-6 text-emerald-400" /> Notification Reach
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Who gets push and email notifications and who doesn&apos;t. <b className="text-gray-300">On</b> = allowed in at
          least one browser and not switched off. <b className="text-gray-300">Off</b> = switched off in their settings.{" "}
          <b className="text-gray-300">Not set up</b> = never allowed notifications in any browser (or blocked them later).
          Staff are not counted. Summary refreshes every minute.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((c) => {
          const body = (
            <>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <c.icon className={`h-4 w-4 shrink-0 ${c.tone}`} />
                <span className="truncate">{c.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white">{c.value}</p>
              {c.sub && <p className="text-xs text-gray-500">{c.sub}</p>}
            </>
          );
          const cls = "block rounded-xl border border-gray-800 bg-gray-900 p-4";
          if (!c.to) return <div key={c.label} className={cls}>{body}</div>;
          const target =
            c.to === "app"
              ? href({ status: undefined, installed: "yes", page: undefined })
              : href({ status: c.to, page: undefined });
          return (
            <Link key={c.label} href={target} className={`${cls} hover:border-gray-600`}>
              {body}
            </Link>
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "Everyone", Users],
              ["on", "Push on", Bell],
              ["off", "Push off", BellOff],
              ["notset", "Not set up", HelpCircle],
            ] as const
          ).map(([k, label, Icon]) => (
            <Link
              key={k}
              href={href({ status: k === "all" ? undefined : k, page: undefined })}
              className={`${chip(f.status === k)} inline-flex items-center gap-1.5`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
          <a
            href={`/api/admin/users/notification-reach/export?${qs({ page: undefined })}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
          >
            <Download className="h-4 w-4" /> CSV
          </a>
        </div>
        <form action="/admin/users/notification-reach" className="flex flex-wrap items-end gap-2">
          {f.status !== "all" && <input type="hidden" name="status" value={f.status} />}
          <label className="space-y-1 text-xs text-gray-500">
            App installed
            <select
              name="installed"
              defaultValue={f.installed}
              className="block rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            >
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
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
          <label className="space-y-1 text-xs text-gray-500">
            Active from
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
          <label className="space-y-1 text-xs text-gray-500">
            Accounts
            <select
              name="accounts"
              defaultValue={f.accounts}
              className="block rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            >
              <option value="active">Active only</option>
              <option value="all">All statuses</option>
            </select>
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

      <NotificationReachTable
        rows={tableRows}
        total={total}
        filters={filterParams}
        canRemind={canRemind}
        remindAllowedForFilter={f.status !== "on"}
        cooldownDays={PUSH_REMINDER_COOLDOWN_DAYS}
        emptyText={f.q ? "No user matches that search." : "Nobody matches these filters."}
      />

      {pages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
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
  );
}
