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
} from "lucide-react";
import { describeUserAgent } from "@/lib/user-agent";
import { getRiskConfig, FRAUD_SIGNALS, type FraudSignal } from "@/lib/fraud-risk";
import { AppealDecision, ResetRisk, ResolveEvents } from "@/components/admin/fraud/fraud-actions";
import Link from "next/link";
import { format } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";

const SEVERITY_CONFIG = {
  CRITICAL: { color: "text-red-400 bg-red-500/15", border: "border-red-500/50" },
  HIGH: { color: "text-orange-400 bg-orange-500/15", border: "border-orange-500/40" },
  MEDIUM: { color: "text-amber-400 bg-amber-500/15", border: "border-amber-500/30" },
  LOW: { color: "text-slate-300 bg-slate-700/40", border: "border-slate-700" },
};

export default async function FraudMonitorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "fraud.view"))) redirect("/admin");
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

  // Resolve user info for each event
  const userIds = Array.from(
    new Set(events.map((e) => e.userId).filter((v): v is string => !!v))
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

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
          <Link href="/admin/settings" className="text-blue-400 hover:underline">Settings → Limits → Fraud risk</Link>.
        </p>
      </div>

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
                const u = e.userId ? userMap.get(e.userId) : null;
                return u ? (
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-blue-400 hover:underline text-sm"
                  >
                    {u.name ?? u.email}
                  </Link>
                ) : (
                  <span className="text-slate-500">—</span>
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
              cell: (e) => <ResolveEvents eventIds={[e.id]} canManage={canManage} />,
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
