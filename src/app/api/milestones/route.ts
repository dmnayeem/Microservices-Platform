import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// Static milestone definitions — progress computed live from user data
interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  category: "ACTIVITY" | "EARNINGS" | "SOCIAL" | "ENGAGEMENT" | "REFERRAL" | "PROFILE";
  target: number;
  unit?: string;
  pointsReward: number;
  badgeName?: string;
}

const MILESTONES: MilestoneDef[] = [
  // Activity
  { id: "tasks_5", title: "First Steps", description: "Complete 5 tasks", category: "ACTIVITY", target: 5, pointsReward: 100 },
  { id: "tasks_25", title: "Getting Started", description: "Complete 25 tasks", category: "ACTIVITY", target: 25, pointsReward: 500, badgeName: "Active Earner" },
  { id: "tasks_100", title: "Centurion", description: "Complete 100 tasks", category: "ACTIVITY", target: 100, pointsReward: 2000, badgeName: "Centurion" },
  { id: "checkins_7", title: "Week Warrior", description: "Check in 7 days in a row", category: "ACTIVITY", target: 7, unit: " days", pointsReward: 250 },
  { id: "checkins_30", title: "Monthly Master", description: "Check in 30 days in a row", category: "ACTIVITY", target: 30, unit: " days", pointsReward: 1500, badgeName: "Streak Master" },
  // Earnings
  { id: "earn_5", title: "First Dollar", description: "Earn $5 total", category: "EARNINGS", target: 5, unit: "$", pointsReward: 250 },
  { id: "earn_50", title: "Small Wins", description: "Earn $50 total", category: "EARNINGS", target: 50, unit: "$", pointsReward: 1000, badgeName: "Earner" },
  { id: "earn_500", title: "Half Grand", description: "Earn $500 total", category: "EARNINGS", target: 500, unit: "$", pointsReward: 5000, badgeName: "Pro Earner" },
  // Social
  { id: "posts_5", title: "Conversation Starter", description: "Create 5 posts", category: "SOCIAL", target: 5, pointsReward: 200 },
  { id: "likes_50", title: "Liked", description: "Receive 50 likes on your posts", category: "SOCIAL", target: 50, pointsReward: 500, badgeName: "Popular" },
  // Engagement
  { id: "level_10", title: "Level 10", description: "Reach level 10", category: "ENGAGEMENT", target: 10, unit: " level", pointsReward: 1000, badgeName: "Apprentice" },
  { id: "level_25", title: "Level 25", description: "Reach level 25", category: "ENGAGEMENT", target: 25, unit: " level", pointsReward: 5000, badgeName: "Earner" },
  // Referral
  { id: "refer_1", title: "First Referral", description: "Refer your first friend", category: "REFERRAL", target: 1, pointsReward: 500 },
  { id: "refer_10", title: "Influencer", description: "Refer 10 friends", category: "REFERRAL", target: 10, pointsReward: 2500, badgeName: "Influencer" },
  { id: "refer_50", title: "Network King", description: "Refer 50 friends", category: "REFERRAL", target: 50, pointsReward: 10000, badgeName: "Network King" },
  // Profile
  { id: "profile_complete", title: "Identity Verified", description: "Complete KYC verification", category: "PROFILE", target: 1, pointsReward: 500, badgeName: "Verified" },
  { id: "profile_socials", title: "Social Butterfly", description: "Connect 3 social accounts", category: "PROFILE", target: 3, pointsReward: 300 },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, taskSubmissionCount, postCount, likeCount, referralCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          totalEarnings: true,
          streak: true,
          level: true,
          kycStatus: true,
        },
      }),
      prisma.taskSubmission.count({
        where: {
          userId,
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
      }),
      prisma.post.count({ where: { userId } }),
      prisma.like.count({
        where: { post: { userId } },
      }),
      prisma.user.count({ where: { referredById: userId } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Track claimed milestones via auditLog (action = MILESTONE_CLAIMED, entity = Milestone, entityId = milestoneId)
  const claimedRows = await prisma.auditLog.findMany({
    where: {
      userId,
      action: "MILESTONE_CLAIMED",
      entity: "Milestone",
    },
    select: { entityId: true },
  });
  const claimedIds = new Set(
    claimedRows.map((r) => r.entityId).filter((id): id is string => !!id)
  );

  const computeCurrent = (m: MilestoneDef): number => {
    switch (m.id) {
      case "tasks_5":
      case "tasks_25":
      case "tasks_100":
        return taskSubmissionCount;
      case "checkins_7":
      case "checkins_30":
        return user.streak;
      case "earn_5":
      case "earn_50":
      case "earn_500":
        return toNum(user.totalEarnings);
      case "posts_5":
        return postCount;
      case "likes_50":
        return likeCount;
      case "level_10":
      case "level_25":
        return user.level;
      case "refer_1":
      case "refer_10":
      case "refer_50":
        return referralCount;
      case "profile_complete":
        return user.kycStatus === "APPROVED" ? 1 : 0;
      case "profile_socials":
        return 0; // no social-account model yet
      default:
        return 0;
    }
  };

  const milestones = MILESTONES.map((m) => {
    const current = computeCurrent(m);
    const completed = current >= m.target;
    const claimed = claimedIds.has(m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      current,
      target: m.target,
      unit: m.unit,
      pointsReward: m.pointsReward,
      badgeName: m.badgeName,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      claimed,
    };
  });

  return NextResponse.json({ milestones });
}
