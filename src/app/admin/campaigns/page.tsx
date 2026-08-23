import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { Megaphone, Calendar, Target, DollarSign } from "lucide-react";
import { CampaignsClient } from "@/components/admin/campaigns/campaigns-client";

export default async function CampaignsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "campaigns.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "campaigns.manage");
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === "ACTIVE").length,
    scheduled: campaigns.filter((c) => c.status === "SCHEDULED").length,
    ended: campaigns.filter((c) => c.status === "ENDED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-pink-400" />
            Campaigns
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Bonus events, multipliers, and seasonal promotions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Megaphone className="w-5 h-5" />} tone="pink" value={stats.total} label="Total" />
        <Stat icon={<Target className="w-5 h-5" />} tone="emerald" value={stats.active} label="Active" />
        <Stat icon={<Calendar className="w-5 h-5" />} tone="amber" value={stats.scheduled} label="Scheduled" />
        <Stat icon={<DollarSign className="w-5 h-5" />} tone="slate" value={stats.ended} label="Ended" />
      </div>

      <CampaignsClient
        initial={
          campaigns.map((c) => ({
            ...c,
            budget: toNumOrNull(c.budget),
            rewardsDistributed: toNum(c.rewardsDistributed),
          })) as never
        }
        canManage={canManage}
      />

      {campaigns.length === 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <Megaphone className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No campaigns yet</h3>
          <p className="text-sm text-slate-400">Schedule your first promotional campaign.</p>
        </div>
      )}
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
  tone: "pink" | "emerald" | "amber" | "slate";
  value: number;
  label: string;
}) {
  const cls = {
    pink: "bg-pink-500/10 text-pink-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    slate: "bg-slate-700/40 text-slate-300",
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
