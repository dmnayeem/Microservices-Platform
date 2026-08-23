import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Activity,
  Eye,
} from "lucide-react";
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

  const [criticalCount, highCount, mediumCount, lowCount, events] =
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
    ]);

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

      {/* Detection rules — read-only summary */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Detection Rules
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Edit thresholds in <code className="text-slate-300">/admin/settings → Security</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {[
            "Duplicate IP detection (≥ 3 accounts)",
            "VPN / Proxy auto-block",
            "Rapid task completion (< 15s)",
            "High withdrawal frequency (> 3/day)",
            "Same device multi-accounts (≥ 2)",
            "Bot-like behavior pattern (AI)",
          ].map((rule) => (
            <div
              key={rule}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-300">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged events */}
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
              cell: (e) => (
                <p className="font-mono text-xs text-white">{e.eventType}</p>
              ),
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
              cell: () => (
                <button
                  className="p-1.5 rounded hover:bg-slate-700 text-blue-400"
                  title="View details"
                >
                  <Eye className="w-4 h-4" />
                </button>
              ),
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
