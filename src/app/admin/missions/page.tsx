import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { Rocket } from "lucide-react";
import { parseEventTiers } from "@/lib/events-shared";
import {
  MissionsClient,
  type AdminMission,
} from "@/components/admin/missions/missions-client";

export default async function MissionsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "missions.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "missions.manage");
  const [missions, participantGroups] = await Promise.all([
    prisma.mission.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }] }),
    prisma.userMissionProgress.groupBy({
      by: ["missionId"],
      _count: { _all: true },
    }) as unknown as Promise<
      { missionId: string; _count: { _all: number } }[]
    >,
  ]);
  const playersByMission = new Map(
    participantGroups.map((g) => [g.missionId, g._count._all])
  );

  const rows: AdminMission[] = missions.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    iconEmoji: m.iconEmoji,
    actionType: m.actionType,
    targetValue: m.targetValue,
    tiers: parseEventTiers(m.tiers),
    pointsReward: m.pointsReward,
    cashReward: toNum(m.cashReward),
    xpReward: m.xpReward,
    dailyCap: m.dailyCap,
    startAt: m.startAt ? m.startAt.toISOString() : null,
    endAt: m.endAt ? m.endAt.toISOString() : null,
    order: m.order,
    unlockMissionId: m.unlockMissionId,
    requiredLevel: m.requiredLevel,
    requiredAccessLevel: m.requiredAccessLevel,
    isActive: m.isActive,
    countries: m.countries,
    genders: m.genders,
    regions: m.regions,
    divisions: m.divisions,
    districts: m.districts,
    subDistricts: m.subDistricts,
    postalCodes: m.postalCodes,
    minAge: m.minAge,
    maxAge: m.maxAge,
    participants: playersByMission.get(m.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Rocket className="w-6 h-6 text-emerald-400" />
          Missions
        </h1>
        {/* The page was titled "Daily Missions" and sat next to a *different*
            page also called Daily Missions. These are the long-run big-prize
            goals; the daily checklist lives at /admin/daily-missions. */}
        <p className="text-slate-400 text-sm mt-1">
          Long-run goals with the platform&apos;s biggest rewards — tiers, unlock
          chains and audience targeting. Users see them at{" "}
          <span className="text-slate-300">/missions</span>. For today&apos;s task
          checklist, use{" "}
          <span className="text-slate-300">Daily Task Missions</span>.
        </p>
      </div>
      <MissionsClient initial={rows} canManage={canManage} />
    </div>
  );
}
