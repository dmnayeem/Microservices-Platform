import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { accessLevelToTier } from "@/lib/package-tiers";
import { toNum } from "@/lib/money";
import type { MissionTaskType } from "@/lib/mission-labels";
import { DailyMissionsClient } from "@/components/admin/daily-missions/daily-missions-client";

export default async function DailyMissionsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "missions.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "missions.manage");

  const raw = await prisma.dailyMissionTemplate.findMany({
    orderBy: [{ requiredAccessLevel: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    include: {
      items: { orderBy: { order: "asc" } },
      _count: { select: { claims: true } },
    },
  });
  type ItemRow = {
    id: string;
    taskType: string;
    description: string | null;
    targetCount: number;
    xpPerComplete: number;
    pointsPerComplete: number;
    duration: number | null;
    requiredLevel: number | null;
    order: number;
  };
  type WithRels = (typeof raw)[number] & {
    items: ItemRow[];
    _count: { claims: number };
  };
  const missions = raw as WithRels[];

  type ClientMission = Parameters<typeof DailyMissionsClient>[0]["initial"][number];
  return (
    <DailyMissionsClient
      initial={missions.map((m): ClientMission => ({
        id: m.id,
        name: m.name,
        description: m.description,
        packageTier: accessLevelToTier(m.requiredAccessLevel),
        requiredLevel: m.requiredLevel,
        completionXpReward: m.completionXpReward,
        completionPointsReward: m.completionPointsReward,
        isActive: m.isActive,
        autoRefresh: m.autoRefresh,
        linkReferralBonus: m.linkReferralBonus,
        order: m.order,
        claimsCount: m._count.claims,
        completionCashReward: toNum(m.completionCashReward),
        streakBonusEvery: m.streakBonusEvery,
        streakBonusPoints: m.streakBonusPoints,
        startAt: m.startAt ? m.startAt.toISOString() : null,
        endAt: m.endAt ? m.endAt.toISOString() : null,
        countries: m.countries,
        genders: m.genders,
        regions: m.regions,
        divisions: m.divisions,
        districts: m.districts,
        subDistricts: m.subDistricts,
        postalCodes: m.postalCodes,
        minAge: m.minAge,
        maxAge: m.maxAge,
        items: m.items.map((it) => ({
          id: it.id,
          // Was a hand-written union that had already lost all five SOCIAL_*
          // values. MissionTaskType is the one definition.
          taskType: it.taskType as MissionTaskType,
          description: it.description,
          targetCount: it.targetCount,
          xpPerComplete: it.xpPerComplete,
          pointsPerComplete: it.pointsPerComplete,
          duration: it.duration,
          requiredLevel: it.requiredLevel,
          order: it.order,
        })),
      }))}
      canManage={canManage}
    />
  );
}
