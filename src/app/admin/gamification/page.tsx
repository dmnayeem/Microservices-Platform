import { redirect } from "next/navigation";
import { Trophy, TrendingUp, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getLevelCurve } from "@/lib/level-curve-server";
import { GamificationEditor } from "@/components/admin/gamification/gamification-editor";
import { XP_SOURCES } from "@/lib/xp-sources";

/**
 * Levels and achievements, in one place.
 *
 * The owner asked to set up levels himself — how much XP each one costs, what
 * achievements unlock at what threshold, and what actually raises a level.
 * That last question is the one nobody could answer before: XP was awarded
 * from thirteen places and none of them was written down anywhere a person
 * could read.
 */
export default async function AdminGamificationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");
  const canEdit = await can(session.user.id, "settings.edit");

  const [curve, achievements, levelSpread] = await Promise.all([
    getLevelCurve(),
    prisma.achievement.findMany({
      orderBy: [{ type: "asc" }, { threshold: "asc" }],
    }),
    /* How many accounts sit at each level. An admin editing a curve should be
       able to see who it moves — a threshold change is not abstract when four
       hundred people are standing on the step you are about to raise.

       Counted in memory from a two-column read rather than with `groupBy`:
       Accelerate collapses that call's return type to `{}` here, and a cast to
       get around it would be a lie about what came back. */
    prisma.user.findMany({ select: { level: true } }),
  ]);

  const spread = new Map<number, number>();
  for (const u of levelSpread) spread.set(u.level, (spread.get(u.level) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" />
          Levels &amp; Achievements
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          What a level costs, what unlocks, and where the XP comes from.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Levels defined
          </p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">
            {curve.thresholds.length + 1}
          </p>
          <p className="text-[11px] text-slate-600">
            then +{curve.step.toLocaleString()} XP each
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Achievements
          </p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">
            {achievements.filter((a) => a.isActive).length}
          </p>
          <p className="text-[11px] text-slate-600">
            {achievements.length - achievements.filter((a) => a.isActive).length}{" "}
            switched off
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Ways to earn XP
          </p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">
            {XP_SOURCES.length}
          </p>
          <p className="text-[11px] text-slate-600">listed below</p>
        </div>
      </div>

      <GamificationEditor
        curve={curve}
        achievements={achievements.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          type: a.type,
          threshold: a.threshold,
          pointsReward: a.pointsReward,
          xpReward: a.xpReward,
          isActive: a.isActive,
        }))}
        levelSpread={[...spread.entries()]
          .map(([level, users]) => ({ level, users }))
          .sort((a, b) => a.level - b.level)}
        canEdit={canEdit}
      />
    </div>
  );
}
