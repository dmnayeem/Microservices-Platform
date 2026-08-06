import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { Target } from "lucide-react";
import { MissionsClient } from "@/components/admin/missions/missions-client";

export default async function MissionsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "missions.view")) redirect("/admin");

  const canManage = hasPermission(adminRole, "missions.manage");
  const missions = await prisma.mission.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Target className="w-6 h-6 text-emerald-400" />
          Daily Missions
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Daily/weekly objectives that reward users with points and XP.
        </p>
      </div>
      <MissionsClient
        initial={
          missions.map((m) => ({ ...m, cashReward: toNum(m.cashReward) })) as never
        }
        canManage={canManage}
      />
    </div>
  );
}
