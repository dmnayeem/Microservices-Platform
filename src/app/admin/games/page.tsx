import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Gamepad2 } from "lucide-react";
import {
  GamesClient,
  type AdminGame,
} from "@/components/admin/games/games-client";
import type { AdminGameCategory } from "@/components/admin/games/game-categories-modal";

export default async function GamesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "games.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "games.manage");
  const [games, categoryRows, counts] = await Promise.all([
    prisma.game.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }] }),
    prisma.gameCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.game.groupBy({ by: ["categoryId"], _count: { _all: true } }) as unknown as Promise<
      { categoryId: string | null; _count: { _all: number } }[]
    >,
  ]);

  const countByCategory = new Map<string, number>();
  for (const c of counts) {
    if (c.categoryId) countByCategory.set(c.categoryId, c._count._all);
  }

  const categories: AdminGameCategory[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    order: c.order,
    isActive: c.isActive,
    gameCount: countByCategory.get(c.id) ?? 0,
  }));

  const rows: AdminGame[] = games.map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    categoryId: g.categoryId,
    description: g.description,
    iconUrl: g.iconUrl,
    coverUrl: g.coverUrl,
    embedUrl: g.embedUrl,
    orientation: g.orientation,
    isFeatured: g.isFeatured,
    order: g.order,
    isActive: g.isActive,
    playsCount: g.playsCount,
    adsEnabled: g.adsEnabled,
    adOnOpen: g.adOnOpen,
    adOnResume: g.adOnResume,
    adOnQuit: g.adOnQuit,
    adIntervalSeconds: g.adIntervalSeconds,
    adThrottleSeconds: g.adThrottleSeconds,
    adPlacement: g.adPlacement,
    rewardEnabled: g.rewardEnabled,
    rewardPointsPerTick: g.rewardPointsPerTick,
    rewardTickSeconds: g.rewardTickSeconds,
    rewardMaxPerSession: g.rewardMaxPerSession,
    rewardDailyCapPoints: g.rewardDailyCapPoints,
    rewardRequiresAd: g.rewardRequiresAd,
    scoreRewardEnabled: g.scoreRewardEnabled,
    scoreTrusted: g.scoreTrusted,
    scorePointsPer1000: g.scorePointsPer1000,
    scoreDailyCapPoints: g.scoreDailyCapPoints,
    uniquePlayersCount: g.uniquePlayersCount,
    totalPlaySeconds: g.totalPlaySeconds,
    pointsAwardedTotal: g.pointsAwardedTotal,
    embedProbe: (g.embedProbe ?? null) as AdminGame["embedProbe"],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-emerald-400" />
          HTML5 Games
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Add embeddable games, control their ads, and optionally pay points for
          play time. Rewards are off unless you switch them on per game.
        </p>
      </div>
      <GamesClient initial={rows} categories={categories} canManage={canManage} />
    </div>
  );
}
