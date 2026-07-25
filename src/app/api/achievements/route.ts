import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

// GET /api/achievements - Get all achievements and user's progress
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all available achievements
    const achievements = await prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { threshold: "asc" }],
    });

    // Get user's unlocked achievements
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: session.user.id },
      select: {
        achievementId: true,
        completedAt: true,
        isCompleted: true,
        progress: true,
      },
    });

    const unlockedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId, { completedAt: ua.completedAt, isCompleted: ua.isCompleted, progress: ua.progress }])
    );

    // Get user stats for progress calculation
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        level: true,
        xp: true,
        totalEarnings: true,
        _count: {
          select: {
            taskSubmissions: true,
            referrals: true,
            transactions: true,
          },
        },
      },
    });

    // Calculate progress for each achievement
    const pointsPerUsd = await getPointsPerUsd();
    const processedAchievements = achievements.map((achievement) => {
      const userProgress = unlockedMap.get(achievement.id);

      // Calculate current progress based on achievement type
      let currentProgress = 0;
      if (user) {
        switch (achievement.type) {
          case "tasks_completed":
            currentProgress = user._count.taskSubmissions;
            break;
          case "level_reached":
            currentProgress = user.level;
            break;
          case "xp_earned":
            currentProgress = user.xp;
            break;
          case "points_earned":
            currentProgress = Math.round(toNum(user.totalEarnings) * pointsPerUsd);
            break;
          case "referrals_made":
            currentProgress = user._count.referrals;
            break;
          default:
            currentProgress = 0;
        }
      }

      const progressPercentage = Math.min(
        100,
        Math.round((currentProgress / achievement.threshold) * 100)
      );

      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        type: achievement.type,
        threshold: achievement.threshold,
        pointsReward: achievement.pointsReward,
        xpReward: achievement.xpReward,
        progress: {
          current: currentProgress,
          target: achievement.threshold,
          percentage: progressPercentage,
        },
        isUnlocked: userProgress?.isCompleted || false,
        completedAt: userProgress?.completedAt || null,
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
    const unlockedCount = userAchievements.filter((ua) => ua.isCompleted).length;
    const totalPoints = userAchievements.reduce((sum, ua) => {
      const achievement = achievements.find((a) => a.id === ua.achievementId);
      return sum + (achievement?.pointsReward || 0);
    }, 0);

    return NextResponse.json({
      achievements: processedAchievements,
      grouped: groupedAchievements,
      types: Object.keys(groupedAchievements),
      summary: {
        total: totalAchievements,
        unlocked: unlockedCount,
        percentage: totalAchievements > 0
          ? Math.round((unlockedCount / totalAchievements) * 100)
          : 0,
        pointsEarned: totalPoints,
      },
      recentUnlocks: userAchievements
        .filter((ua) => ua.isCompleted && ua.completedAt)
        .sort(
          (a, b) =>
            new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
        )
        .slice(0, 5)
        .map((ua) => {
          const achievement = achievements.find((a) => a.id === ua.achievementId);
          return {
            id: ua.achievementId,
            name: achievement?.name,
            icon: achievement?.icon,
            completedAt: ua.completedAt,
          };
        }),
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 }
    );
  }
}
