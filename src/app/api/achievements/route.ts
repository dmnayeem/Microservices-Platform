import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  evaluateAchievements,
  measureAll,
  progressFor,
  resolveAchievementType,
} from "@/lib/achievements";

/**
 * GET /api/achievements — every achievement, with this user's progress.
 *
 * Reading the page also EVALUATES it. There is no background job, and the
 * money paths only fire `runAchievementCheck` on the events they know about
 * (task approval, referral, withdrawal); a threshold crossed some other way
 * would otherwise sit unnoticed until one of those happened to run. Evaluation
 * writes no money, so doing it on a read is safe.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Bring unlocks up to date before reading them back, so a user who crossed
    // a threshold sees it on this load rather than the next one.
    await evaluateAchievements(userId).catch(() => {});

    const [achievements, userAchievements] = await Promise.all([
      prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { threshold: "asc" }],
      }),
      prisma.userAchievement.findMany({
        where: { userId },
        select: {
          achievementId: true,
          completedAt: true,
          isCompleted: true,
          claimedAt: true,
          progress: true,
        },
      }),
    ]);

    const stateMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua]));

    // One measurement per distinct type, shared across every achievement that
    // uses it — `src/lib/achievements.ts` is the single definition of what each
    // type counts, so this can no longer disagree with the unlock engine.
    const measured = await measureAll(
      userId,
      achievements.map((a) => a.type)
    );

    const processedAchievements = achievements.map((achievement) => {
      const state = stateMap.get(achievement.id);
      const currentProgress = progressFor(measured, achievement.type);
      const progressPercentage =
        achievement.threshold > 0
          ? Math.min(
              100,
              Math.round((currentProgress / achievement.threshold) * 100)
            )
          : 0;
      const isUnlocked = state?.isCompleted ?? false;

      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        type: achievement.type,
        // What to actually do, so an unmet card is not a mystery.
        typeLabel: resolveAchievementType(achievement.type)?.label ?? achievement.type,
        threshold: achievement.threshold,
        pointsReward: achievement.pointsReward,
        xpReward: achievement.xpReward,
        progress: {
          current: currentProgress,
          target: achievement.threshold,
          percentage: progressPercentage,
        },
        isUnlocked,
        completedAt: state?.completedAt ?? null,
        isClaimed: state?.claimedAt != null,
        claimedAt: state?.claimedAt ?? null,
        canClaim:
          isUnlocked &&
          state?.claimedAt == null &&
          (achievement.pointsReward > 0 || achievement.xpReward > 0),
      };
    });

    // Group by type
    const groupedAchievements: Record<string, typeof processedAchievements> = {};
    processedAchievements.forEach((achievement) => {
      const type = achievement.type || "General";
      if (!groupedAchievements[type]) {
        groupedAchievements[type] = [];
      }
      groupedAchievements[type].push(achievement);
    });

    // Calculate summary stats
    const totalAchievements = achievements.length;
    const unlockedCount = processedAchievements.filter((a) => a.isUnlocked).length;
    // Points actually COLLECTED. This used to sum every `UserAchievement` row
    // regardless of `isCompleted`, so a user in progress towards an achievement
    // was shown its reward as though they already had it.
    const pointsEarned = processedAchievements
      .filter((a) => a.isClaimed)
      .reduce((sum, a) => sum + a.pointsReward, 0);
    const pointsClaimable = processedAchievements
      .filter((a) => a.canClaim)
      .reduce((sum, a) => sum + a.pointsReward, 0);

    return NextResponse.json({
      achievements: processedAchievements,
      grouped: groupedAchievements,
      types: Object.keys(groupedAchievements),
      summary: {
        total: totalAchievements,
        unlocked: unlockedCount,
        percentage:
          totalAchievements > 0
            ? Math.round((unlockedCount / totalAchievements) * 100)
            : 0,
        pointsEarned,
        pointsClaimable,
      },
      recentUnlocks: processedAchievements
        .filter((a) => a.isUnlocked && a.completedAt)
        .sort(
          (a, b) =>
            new Date(b.completedAt!).getTime() -
            new Date(a.completedAt!).getTime()
        )
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          name: a.name,
          icon: a.icon,
          completedAt: a.completedAt,
        })),
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 }
    );
  }
}
