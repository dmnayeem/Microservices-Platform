import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Globe, CheckCircle, XCircle } from "lucide-react";
import { ProxyClient } from "@/components/admin/proxy/proxy-client";
import { ProxyMonitor } from "@/components/admin/proxy/proxy-monitor";

export default async function ProxyAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "proxy.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "proxy.manage");
  const servers = await prisma.proxyServer.findMany({
    orderBy: [{ status: "asc" }, { country: "asc" }],
  });

  const onlineCount = servers.filter((s) => s.status === "ACTIVE").length;
  const offlineCount = servers.filter((s) => s.status !== "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Globe className="w-6 h-6 text-cyan-400" />
          Proxy Server Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage proxy/VPN servers used for proxy tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          icon={<Globe className="w-5 h-5" />}
          tone="blue"
          value={servers.length}
          label="Total Servers"
        />
        <Stat
          icon={<CheckCircle className="w-5 h-5" />}
          tone="emerald"
          value={onlineCount}
          label="Online"
        />
        <Stat
          icon={<XCircle className="w-5 h-5" />}
          tone="red"
          value={offlineCount}
          label="Offline / Error"
        />
      </div>

      <ProxyClient initial={servers} canManage={canManage} />

      <ProxyMonitor canManage={canManage} />
    </div>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "blue" | "emerald" | "red";
  value: number;
  label: string;
}) {
  const cls = {
    blue: "bg-blue-500/10 text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    red: "bg-red-500/10 text-red-400",
  }[tone];
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
