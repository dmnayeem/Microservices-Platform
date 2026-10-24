import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Activity,
  Gauge,
  Scale,
  Download,
  Smartphone,
  MessageSquareWarning,
} from "lucide-react";
import { MemberActions } from "@/components/admin/fraud/member-actions";
import { REASK_MINUTES } from "@/lib/user-warnings";
import { describeUserAgent } from "@/lib/user-agent";
import { getRiskConfig, FRAUD_SIGNALS, type FraudSignal } from "@/lib/fraud-risk";
import { AppealDecision, ResetRisk, ResolveEvents } from "@/components/admin/fraud/fraud-actions";
import Link from "next/link";
import { format } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { FraudSettingsPanel } from "@/components/admin/fraud/fraud-settings-panel";
import { loadSettingValues } from "@/lib/admin-setting-values";
import { FRAUD_HOME, keysHomedAt } from "@/lib/admin-settings-catalog";

/**
 * The monitor, plus every `antifraud.*` setting on its own tab. The settings
 * used to sit on System Settings → Limits; the keys are unchanged.
 */
const TABS = [
  { id: "monitor", label: "Monitor" },
  { id: "vpn", label: "VPN users" },
  { id: "settings", label: "Settings" },
];

const SEVERITY_CONFIG = {
  CRITICAL: { color: "text-red-400 bg-red-500/15", border: "border-red-500/50" },
  HIGH: { color: "text-orange-400 bg-orange-500/15", border: "border-orange-500/40" },
  MEDIUM: { color: "text-amber-400 bg-amber-500/15", border: "border-amber-500/30" },
  LOW: { color: "text-slate-300 bg-slate-700/40", border: "border-slate-700" },
};

export default async function FraudMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "fraud.view"))) redirect("/admin");
  const tab = pickTab(TABS, (await searchParams).tab);
  const tabs = <AdminTabs tabs={TABS} active={tab} basePath="/admin/fraud" />;

  if (tab === "vpn") {
    // Members seen on a VPN / proxy (lib/vpn.ts) — recorded whether or not
    // anything is blocked, newest first.
    const rows = await prisma.user.findMany({
      where: { vpnLastSeenAt: { not: null } },
      orderBy: { vpnLastSeenAt: "desc" },
      take: 300,
      select: { id: true, name: true, email: true, status: true, vpnLastSeenAt: true, vpnLastIp: true, vpnSeenCount: true, level: true },
    });
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            Fraud Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Members seen on a VPN or proxy — recorded even with VPN blocking off. Detection uses the IP prefix list
            and, when switched on in Settings, proxycheck.io.
          </p>
        </div>
        {tabs}
        {rows.length === 0 ? (
          <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">
            Nobody seen on a VPN yet. (Turn on a detection service under Settings → VPN / proxy for real detection.)
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">Member</th>
                  <th className="px-3 py-2">Last VPN IP</th>
                  <th className="px-3 py-2">Times seen</th>
                  <th className="px-3 py-2">Last seen</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td className="px-3 py-2">
                      <Link href={`/admin/users/${u.id}`} className="text-white hover:underline">
                        {u.name ?? u.email}
                      </Link>
                      <p className="text-xs text-slate-500">{u.email} · L{u.level}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{u.vpnLastIp ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-300">{u.vpnSeenCount}</td>
                    <td className="px-3 py-2 text-slate-300">{u.vpnLastSeenAt ? format(u.vpnLastSeenAt, "MMM d, HH:mm") : "—"}</td>
                    <td className="px-3 py-2 text-slate-300">{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (tab === "settings") {
    const [initial, canEditSettings] = await Promise.all([
      loadSettingValues(keysHomedAt(FRAUD_HOME.href)),
      // The save goes through POST /api/admin/settings, which is gated on
      // settings.edit — the same permission these controls needed before.
      can(session.user.id, "settings.edit"),
    ]);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            Fraud Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Anti-fraud rules, fraud risk points and auto-suspension.
          </p>
        </div>
        {tabs}
        <FraudSettingsPanel initial={initial} canEdit={canEditSettings} />
      </div>
    );
  }

  const canManage = await can(session.user.id, "fraud.manage");

  const [criticalCount, highCount, mediumCount, lowCount, events, riskCfg, atRisk, appealRows] =
    await Promise.all([
      prisma.fraudEvent.count({ where: { severity: "CRITICAL", status: "OPEN" } }),
      prisma.fraudEvent.count({ where: { severity: "HIGH", status: "OPEN" } }),
      prisma.fraudEvent.count({ where: { severity: "MEDIUM", status: "OPEN" } }),
      prisma.fraudEvent.count({ where: { severity: "LOW", status: "OPEN" } }),
      prisma.fraudEvent.findMany({
        where: { status: "OPEN" },
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
      getRiskConfig(),
      prisma.user.findMany({
        where: { fraudRisk: { gt: 0 } },
        orderBy: [{ fraudRisk: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: { id: true, name: true, email: true, status: true, fraudRisk: true, role: true },
      }),
      prisma.suspensionAppeal.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          message: true,
          riskAtAppeal: true,
          reasonAtAppeal: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

  // Devices several accounts have used — the strongest multi-account signal.
  const sharedGroups = (await prisma.userDevice.groupBy({
    by: ["deviceId"],
    _count: { userId: true },
    having: { userId: { _count: { gt: 1 } } },
    orderBy: { _count: { userId: "desc" } },
    take: 20,
  })) as unknown as Array<{ deviceId: string; _count: { userId: number } }>;
  const sharedRows = sharedGroups.length
    ? await prisma.userDevice.findMany({
        where: { deviceId: { in: sharedGroups.map((g) => g.deviceId) } },
        select: {
          deviceId: true,
          userAgent: true,
          lastIp: true,
          country: true,
          lastSeenAt: true,
          user: { select: { id: true, name: true, email: true, status: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      })
    : [];
  const sharedDevices = sharedGroups.map((g) => {
    const rows = (sharedRows as unknown as Array<{
      deviceId: string;
      userAgent: string | null;
      lastIp: string | null;
      country: string | null;
      lastSeenAt: Date;
      user: { id: string; name: string | null; email: string; status: string };
    }>).filter((r) => r.deviceId === g.deviceId);
    return { deviceId: g.deviceId, count: g._count.userId, ua: rows[0]?.userAgent ?? null, rows };
  });

  // The nested `user` select is lost in the Promise.all tuple's inference.
  const appeals = appealRows as unknown as Array<{
    id: string;
    message: string;
    riskAtAppeal: number;
    reasonAtAppeal: string | null;
    createdAt: Date;
    user: { id: string; name: string | null; email: string };
  }>;

  // Who each event is about. Sign-up checks run BEFORE the account exists, so
  // those events carry no userId — only the email tried and the device. The
  // column used to show "—" for all of them. Now: the account by userId, else
  // the account that email became (a flagged sign-up still goes through),
  // and in every case the accounts already on that device — when a sign-up
  // was blocked, those are the people to warn.
  type EvUser = { id: string; name: string | null; email: string; status: string };
  const evDetails = (e: (typeof events)[number]) =>
    (e.details ?? {}) as { email?: string; deviceId?: string; label?: string; riskAfter?: number };
  const userIds = new Set(events.map((e) => e.userId).filter((v): v is string => !!v));
  const emails = new Set(
    events.filter((e) => !e.userId).map((e) => evDetails(e).email?.toLowerCase()).filter((v): v is string => !!v)
  );
  const deviceIds = new Set(events.map((e) => evDetails(e).deviceId).filter((v): v is string => !!v));
  const userSelect = { id: true, name: true, email: true, status: true } as const;
  const [byId, byEmail, onDevices] = await Promise.all([
    userIds.size ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: userSelect }) : [],
    emails.size ? prisma.user.findMany({ where: { email: { in: [...emails] } }, select: userSelect }) : [],
    deviceIds.size
      ? prisma.userDevice.findMany({
          where: { deviceId: { in: [...deviceIds] } },
          select: { deviceId: true, user: { select: userSelect } },
        })
      : [],
  ]);
  const userMap = new Map<string, EvUser>((byId as EvUser[]).map((u) => [u.id, u]));
  const emailMap = new Map<string, EvUser>((byEmail as EvUser[]).map((u) => [u.email.toLowerCase(), u]));
  const deviceMap = new Map<string, EvUser[]>();
  for (const r of onDevices as unknown as Array<{ deviceId: string; user: EvUser }>) {
    const list = deviceMap.get(r.deviceId) ?? [];
    if (!list.some((u) => u.id === r.user.id)) list.push(r.user);
    deviceMap.set(r.deviceId, list);
  }
  const eventPeople = (e: (typeof events)[number]) => {
    const d = evDetails(e);
    const account =
      (e.userId ? userMap.get(e.userId) : undefined) ??
      (d.email ? emailMap.get(d.email.toLowerCase()) : undefined) ??
      null;
    const onDevice = (d.deviceId ? deviceMap.get(d.deviceId) ?? [] : []).filter((u) => u.id !== account?.id);
    return { account, onDevice, email: d.email ?? null };
  };

  // Warnings: how many each member has had, and the latest ones with replies.
  const peopleIds = new Set<string>([
    ...userMap.keys(),
    ...[...emailMap.values()].map((u) => u.id),
    ...[...deviceMap.values()].flat().map((u) => u.id),
  ]);
  const [warnCounts, recentWarnings, canBan] = await Promise.all([
    peopleIds.size
      ? prisma.userWarning.groupBy({ by: ["userId"], where: { userId: { in: [...peopleIds] } }, _count: { _all: true } })
      : [],
    prisma.userWarning.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        issue: true,
        consequence: true,
        createdAt: true,
        reply: true,
        repliedAt: true,
        shownCount: true,
        dismissCount: true,
      },
    }),
    can(session.user.id, "users.ban"),
  ]);
  const warnCount = new Map(
    (warnCounts as unknown as Array<{ userId: string; _count: { _all: number } }>).map((g) => [g.userId, g._count._all])
  );
  // One card per warned member, newest warning first.
  const warnedIds = [...new Set(recentWarnings.map((w) => w.userId))];
  const warnedUsers = warnedIds.length
    ? await prisma.user.findMany({ where: { id: { in: warnedIds } }, select: userSelect })
    : [];
  const warnedTotals = warnedIds.length
    ? ((await prisma.userWarning.groupBy({
        by: ["userId"],
        where: { userId: { in: warnedIds } },
        _count: { _all: true },
      })) as unknown as Array<{ userId: string; _count: { _all: number } }>)
    : [];
  for (const g of warnedTotals) warnCount.set(g.userId, g._count._all);
  const warnedMap = new Map((warnedUsers as EvUser[]).map((u) => [u.id, u]));
  const warnedGroups = warnedIds
    .map((id) => ({ user: warnedMap.get(id), warnings: recentWarnings.filter((w) => w.userId === id) }))
    .filter((g): g is { user: EvUser; warnings: typeof recentWarnings } => !!g.user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-400" />
          Fraud Monitor
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Detected fraud events across the platform.
        </p>
        <a
          href="/api/admin/fraud/devices"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          Export users&apos; IPs, devices &amp; countries (CSV)
        </a>
      </div>

      {/* Severity stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SevStat
          icon={<AlertOctagon className="w-5 h-5" />}
          tone="critical"
          value={criticalCount}
          label="Critical"
        />
        <SevStat
          icon={<AlertTriangle className="w-5 h-5" />}
          tone="high"
          value={highCount}
          label="High"
        />
        <SevStat
          icon={<Activity className="w-5 h-5" />}
          tone="medium"
          value={mediumCount}
          label="Medium"
        />
        <SevStat
          icon={<Activity className="w-5 h-5" />}
          tone="low"
          value={lowCount}
          label="Low"
        />
      </div>

      {/* Appeals from suspended users */}
      {appeals.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-amber-500/30 p-5">
          <h2 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            Suspension appeals waiting ({appeals.length})
          </h2>
          <div className="space-y-3">
            {appeals.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/users/${a.user.id}`} className="text-sm font-semibold text-blue-400 hover:underline">
                    {a.user.name ?? a.user.email}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {format(a.createdAt, "MMM d, HH:mm")} · risk {a.riskAtAppeal}%
                  </span>
                </div>
                {a.reasonAtAppeal && <p className="mt-1 text-xs text-slate-500">{a.reasonAtAppeal}</p>}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{a.message}</p>
                <AppealDecision appealId={a.id} canManage={canManage} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings sent from here, with the members' replies */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-1 inline-flex items-center gap-2">
          <MessageSquareWarning className="w-4 h-4 text-amber-400" />
          Warnings sent ({recentWarnings.length})
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          A warning pops up the next time the member opens the platform and comes back every {REASK_MINUTES} minutes
          until they reply. Their reply shows here.
        </p>
        {warnedGroups.length === 0 ? (
          <p className="text-sm text-slate-500">
            No warnings yet. Use <b className="text-slate-300">Warn</b> on an open event below.
          </p>
        ) : (
          <div className="space-y-3">
            {warnedGroups.map(({ user: u, warnings }) => (
              <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/users/${u.id}`} className="text-sm font-semibold text-blue-400 hover:underline">
                      {u.name ?? u.email}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">
                      Warned {warnCount.get(u.id) ?? warnings.length}×
                    </span>
                  </div>
                  <MemberActions
                    userId={u.id}
                    name={u.name ?? u.email}
                    status={u.status}
                    warnCount={warnCount.get(u.id) ?? warnings.length}
                    canManage={canManage}
                    canBan={canBan}
                  />
                </div>
                <ul className="mt-2 space-y-2">
                  {warnings.slice(0, 3).map((w) => (
                    <li key={w.id} className="rounded-md border border-slate-800 p-2.5 text-sm">
                      <p className="text-xs text-slate-500">{format(w.createdAt, "MMM d, HH:mm")}</p>
                      <p className="mt-0.5 text-slate-200 wrap-break-word">{w.issue}</p>
                      {w.repliedAt ? (
                        <div className="mt-2 rounded-md border-l-2 border-emerald-500/60 bg-emerald-500/5 px-2.5 py-1.5">
                          <p className="text-[11px] font-semibold text-emerald-300">
                            Replied {format(w.repliedAt, "MMM d, HH:mm")}
                          </p>
                          <p className="whitespace-pre-wrap wrap-break-word text-slate-200">{w.reply}</p>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-amber-300">
                          No reply yet
                          {w.shownCount > 0 ? ` · shown ${w.shownCount}×` : " · not seen yet"}
                          {w.dismissCount > 0 && ` · closed without replying ${w.dismissCount}×`}
                        </p>
                      )}
                    </li>
                  ))}
                  {warnings.length > 3 && (
                    <li className="text-xs text-slate-500">+ {warnings.length - 3} earlier warning(s)</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Devices shared by several accounts */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-1 inline-flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-orange-400" />
          Devices used by more than one account
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          The same browser/device signing in to several accounts — unlike a shared IP, this is rarely innocent. Family
          members sharing one phone are the usual honest case.
        </p>
        {sharedDevices.length === 0 ? (
          <p className="text-sm text-slate-500">
            None so far. Devices are recorded as people use the site, so this fills in over the coming days.
          </p>
        ) : (
          <div className="space-y-2">
            {sharedDevices.map((d) => (
              <div key={d.deviceId} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{d.count} accounts on one device</span>
                  <span className="text-xs text-slate-500">
                    {describeUserAgent(d.ua)} · <span className="font-mono">{d.deviceId.slice(0, 10)}…</span>
                  </span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {d.rows.map((r) => (
                    <li key={r.user.id}>
                      <Link
                        href={`/admin/users/${r.user.id}`}
                        className={`inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700 ${
                          r.user.status === "ACTIVE" ? "text-slate-200" : "text-red-300"
                        }`}
                        title={`${r.user.email} · last IP ${r.lastIp ?? "—"}${r.country ? ` · ${r.country}` : ""}`}
                      >
                        {r.user.name || r.user.email}
                        {r.country && <span className="text-slate-500">{r.country}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users by fraud risk */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Gauge className="w-4 h-4 text-red-400" />
            Users by fraud risk
          </h2>
          <p className="text-xs text-slate-500">
            {!riskCfg.enabled
              ? "Risk scoring is OFF — offences are recorded but add nothing."
              : riskCfg.autoSuspend
                ? `Warned at 50% and 80% · suspended automatically at ${riskCfg.suspendAt}%`
                : "Warned at 50% and 80% · auto-suspension is OFF"}
          </p>
        </div>
        {atRisk.length === 0 ? (
          <p className="text-sm text-slate-500">No user has any fraud risk.</p>
        ) : (
          <div className="space-y-1.5">
            {atRisk.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg bg-slate-950/50 border border-slate-800 px-3 py-2">
                <Link href={`/admin/users/${u.id}`} className="w-28 shrink-0 truncate text-sm text-blue-400 hover:underline sm:w-56">
                  {u.name ?? u.email}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${u.fraudRisk >= riskCfg.suspendAt ? "bg-red-500" : u.fraudRisk >= 80 ? "bg-red-400" : u.fraudRisk >= 50 ? "bg-orange-400" : "bg-amber-400"}`}
                      style={{ width: `${u.fraudRisk}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-white">{u.fraudRisk}%</span>
                <span className={`hidden w-24 shrink-0 text-xs sm:block ${u.status === "ACTIVE" ? "text-slate-500" : "text-red-400 font-semibold"}`}>
                  {u.status === "ACTIVE" ? (u.role === "USER" ? "Active" : "Staff") : u.status.toLowerCase()}
                </span>
                <ResetRisk userId={u.id} canManage={canManage} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
          {(Object.keys(FRAUD_SIGNALS) as FraudSignal[]).map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800">
              <span className="text-slate-400">{FRAUD_SIGNALS[k].label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-200">+{riskCfg.enabled ? riskCfg.points[k] : 0}%</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Change the points and the bar in{" "}
          <Link href="/admin/fraud?tab=settings" className="text-blue-400 hover:underline">Fraud Monitor → Settings</Link>.
        </p>
      </div>

      {tabs}

      {/* Flagged events */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Open events</h2>
          <ResolveEvents
            eventIds={events.map((e) => e.id)}
            label={`Mark all ${events.length} shown reviewed`}
            canManage={canManage}
          />
        </div>
      )}
      {events.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No fraud events</h3>
          <p className="text-sm text-slate-400">
            Open events appear here when detection rules trigger.
          </p>
        </div>
      ) : (
        <AdminTable
          rows={events}
          getRowKey={(e) => e.id}
          columns={[
            {
              key: "event",
              header: "Event",
              primary: true,
              cell: (e) => {
                const d = (e.details ?? {}) as { label?: string; riskAfter?: number };
                return (
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-white">{e.eventType}</p>
                    {d.label && <p className="text-xs text-slate-500 truncate">{d.label}</p>}
                    {e.riskPoints > 0 && (
                      <p className="text-xs text-red-300">
                        +{e.riskPoints}% risk{typeof d.riskAfter === "number" ? ` → ${d.riskAfter}%` : ""}
                      </p>
                    )}
                  </div>
                );
              },
            },
            {
              key: "user",
              header: "User",
              cell: (e) => {
                const p = eventPeople(e);
                return (
                  <div className="min-w-0 space-y-1">
                    {p.account ? (
                      <Link href={`/admin/users/${p.account.id}`} className="text-blue-400 hover:underline text-sm">
                        {p.account.name ?? p.account.email}
                      </Link>
                    ) : p.email ? (
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-300">{p.email}</p>
                        <p className="text-xs text-slate-500">No account — sign-up blocked or not finished</p>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                    {p.onDevice.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Already on this device:{" "}
                        {p.onDevice.map((u, i) => (
                          <span key={u.id}>
                            {i > 0 && ", "}
                            <Link href={`/admin/users/${u.id}`} className="text-blue-400 hover:underline">
                              {u.name ?? u.email}
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                );
              },
            },
            {
              key: "severity",
              header: "Severity",
              cell: (e) => (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${SEVERITY_CONFIG[e.severity].color}`}
                >
                  {e.severity}
                </span>
              ),
            },
            {
              key: "ip",
              header: "IP",
              mobileHidden: true,
              cell: (e) => (
                <span className="text-xs font-mono text-slate-400">
                  {e.ipAddress ?? "—"}
                </span>
              ),
            },
            {
              key: "detected",
              header: "Detected",
              mobileHidden: true,
              cell: (e) => (
                <span className="text-sm text-slate-400">
                  {format(e.createdAt, "MMM d, HH:mm")}
                </span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              cell: (e) => {
                // The event's own account; for a blocked sign-up, whoever
                // already holds that device.
                const p = eventPeople(e);
                const targets = p.account ? [p.account] : p.onDevice;
                return (
                  <div className="space-y-2">
                    {targets.map((u) => (
                      <div key={u.id} className="space-y-1">
                        {targets.length > 1 && <p className="text-[11px] text-slate-500">{u.name ?? u.email}</p>}
                        <MemberActions
                          userId={u.id}
                          name={u.name ?? u.email}
                          status={u.status}
                          eventType={e.eventType}
                          fraudEventId={e.id}
                          warnCount={warnCount.get(u.id) ?? 0}
                          canManage={canManage}
                          canBan={canBan}
                        />
                      </div>
                    ))}
                    <ResolveEvents eventIds={[e.id]} canManage={canManage} />
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function SevStat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "critical" | "high" | "medium" | "low";
  value: number;
  label: string;
}) {
  const cls = {
    critical: "border-red-500/40 bg-red-500/5",
    high: "border-orange-500/40 bg-orange-500/5",
    medium: "border-amber-500/30 bg-amber-500/5",
    low: "border-slate-700 bg-slate-900",
  }[tone];
  const iconCls = {
    critical: "bg-red-500/15 text-red-400",
    high: "bg-orange-500/15 text-orange-400",
    medium: "bg-amber-500/15 text-amber-400",
    low: "bg-slate-700/40 text-slate-300",
  }[tone];
  return (
    <div className={`rounded-xl border ${cls} p-4`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconCls}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
