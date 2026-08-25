import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Connect with the matching option for the DATABASE_URL scheme: Accelerate proxy
// (prisma://) vs a direct postgres:// connection via the pg driver adapter.
const seedUrl = process.env.DATABASE_URL!;
const prisma =
  seedUrl.startsWith("prisma://") || seedUrl.startsWith("prisma+postgres://")
    ? new PrismaClient({ accelerateUrl: seedUrl })
    : new PrismaClient({ adapter: new PrismaPg({ connectionString: seedUrl }) });

async function main() {
  // SAFETY: this seed wipes ALL users. Never allow it to run against production.
  // Requires an explicit opt-in env var and refuses when NODE_ENV=production.
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "Refusing to run destructive seed: set ALLOW_SEED=true (and not NODE_ENV=production) to proceed."
    );
  }

  console.log("Starting seed...");

  // Delete all existing users first
  console.log("Deleting all existing users...");
  await prisma.user.deleteMany({});
  console.log("All users deleted!");

  // Common password for all test users
  const password = await bcrypt.hash("Test@123", 12);

  // Users to create with their roles
  const users = [
    {
      email: "superadmin@earngpt.com",
      name: "Super Admin",
      username: "superadmin",
      referralCode: "SUPER001",
      role: "SUPER_ADMIN" as const,
      pointsBalance: 1000000,
      cashBalance: 50000,
      xp: 100000,
      level: 100,
    },
    {
      email: "finance@earngpt.com",
      name: "Finance Admin",
      username: "financeadmin",
      referralCode: "FINANCE01",
      role: "FINANCE_ADMIN" as const,
      pointsBalance: 500000,
      cashBalance: 25000,
      xp: 50000,
      level: 50,
    },
    {
      email: "content@earngpt.com",
      name: "Content Admin",
      username: "contentadmin",
      referralCode: "CONTENT01",
      role: "CONTENT_ADMIN" as const,
      pointsBalance: 500000,
      cashBalance: 25000,
      xp: 50000,
      level: 50,
    },
    {
      email: "support@earngpt.com",
      name: "Support Admin",
      username: "supportadmin",
      referralCode: "SUPPORT01",
      role: "SUPPORT_ADMIN" as const,
      pointsBalance: 500000,
      cashBalance: 25000,
      xp: 50000,
      level: 50,
    },
    {
      email: "marketing@earngpt.com",
      name: "Marketing Admin",
      username: "marketingadmin",
      referralCode: "MARKET01",
      role: "MARKETING_ADMIN" as const,
      pointsBalance: 500000,
      cashBalance: 25000,
      xp: 50000,
      level: 50,
    },
    {
      email: "moderator@earngpt.com",
      name: "Moderator",
      username: "moderator",
      referralCode: "MOD00001",
      role: "MODERATOR" as const,
      pointsBalance: 250000,
      cashBalance: 10000,
      xp: 25000,
      level: 25,
    },
    {
      email: "user@earngpt.com",
      name: "Demo User",
      username: "demouser",
      referralCode: "USER0001",
      role: "USER" as const,
      pointsBalance: 5000,
      cashBalance: 100,
      xp: 250,
      level: 2,
    },
  ];

  // Create users - try to find existing first, then update or create
  for (const userData of users) {
    try {
      // Check if user exists
      const existing = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existing) {
        // Update existing user
        const user = await prisma.user.update({
          where: { email: userData.email },
          data: {
            password,
            name: userData.name,
            role: userData.role,
            pointsBalance: userData.pointsBalance,
            cashBalance: userData.cashBalance,
            xp: userData.xp,
            level: userData.level,
            status: "ACTIVE",
          },
        });
        console.log(`Updated ${userData.role}: ${user.email}`);
      } else {
        // Create new user
        const user = await prisma.user.create({
          data: {
            email: userData.email,
            password,
            name: userData.name,
            username: userData.username,
            referralCode: userData.referralCode,
            status: "ACTIVE",
            emailVerified: new Date(),
            role: userData.role,
            pointsBalance: userData.pointsBalance,
            cashBalance: userData.cashBalance,
            xp: userData.xp,
            level: userData.level,
            country: "BD",
          },
        });
        console.log(`Created ${userData.role}: ${user.email}`);
      }
    } catch (error) {
      console.log(`Failed to create ${userData.role}: ${userData.email}`, error);
    }
  }

  // Create some sample tasks
  const tasks = await prisma.task.createMany({
    skipDuplicates: true,
    data: [
      {
        title: "Watch Introduction Video",
        description: "Watch our welcome video to learn how EarnGPT works and start earning points!",
        type: "VIDEO",
        status: "ACTIVE",
        pointsReward: 50,
        xpReward: 10,
        dailyLimit: 1,
        autoApprove: true,
        contentUrl: "https://youtube.com/watch?v=example",
        duration: 120,
      },
      {
        title: "Complete Daily Survey",
        description: "Answer a few questions about your preferences and earn points!",
        type: "SURVEY",
        status: "ACTIVE",
        pointsReward: 100,
        xpReward: 20,
        dailyLimit: 3,
        autoApprove: true,
      },
      {
        title: "Follow us on Twitter",
        description: "Follow our official Twitter account and earn bonus points!",
        type: "SOCIAL",
        status: "ACTIVE",
        pointsReward: 200,
        xpReward: 30,
        totalLimit: 1,
        socialPlatform: "Twitter",
        socialAction: "follow",
        socialUrl: "https://twitter.com/earngpt",
      },
      {
        title: "Read Article: Crypto Basics",
        description: "Learn about cryptocurrency basics and earn while you learn!",
        type: "ARTICLE",
        status: "ACTIVE",
        pointsReward: 75,
        xpReward: 15,
        dailyLimit: 5,
        autoApprove: true,
        duration: 300,
      },
      {
        title: "Complete Quiz: Web3 Knowledge",
        description: "Test your Web3 knowledge and earn bonus points for correct answers!",
        type: "QUIZ",
        status: "ACTIVE",
        pointsReward: 150,
        xpReward: 25,
        dailyLimit: 2,
        questions: JSON.stringify([
          { question: "What is blockchain?", options: ["A", "B", "C", "D"], correct: 0 },
          { question: "What is a smart contract?", options: ["A", "B", "C", "D"], correct: 1 },
        ]),
      },
    ],
  });
  console.log(`Created ${tasks.count} sample tasks`);

  // Seed the default plan only — admin creates the rest from /admin/packages.
  // Every new user is auto-attached to this row via isDefault=true.
  await prisma.package.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      slug: "default",
      name: "Default",
      description: "Default plan — every new user starts here. Admin can rename this row or create new plans from /admin/packages.",
      accessLevel: 0,
      isDefault: true,
      priceMonthly: 0,
      priceYearly: null,
      dailyTaskLimit: -1,
      minWithdrawal: 5,
      withdrawalFeeDiscount: 0,
      xpMultiplier: 1,
      taskRewardMultiplier: 1,
      socialEarningMultiplier: 1,
      dailyReferralPoints: 5,
      referralCommissionLevels: 0,
      features: ["All features enabled", "Customize from /admin/packages"],
      order: 0,
    },
  });
  console.log("Seeded default plan");

  // Seed one active FREE daily mission so users see a working Daily Mission out
  // of the box. Idempotent: only create if a template with this name is absent.
  const DAILY_MISSION_NAME = "Daily Mission";
  const existingMission = await prisma.dailyMissionTemplate.findFirst({
    where: { name: DAILY_MISSION_NAME },
    select: { id: true },
  });
  if (!existingMission) {
    await prisma.dailyMissionTemplate.create({
      data: {
        name: DAILY_MISSION_NAME,
        description:
          "Complete every task below to collect today's bonus and unlock your referral bonus claim.",
        requiredAccessLevel: 0, // FREE — visible to everyone
        requiredLevel: 1,
        completionPointsReward: 1000,
        completionXpReward: 200,
        isActive: true,
        autoRefresh: true,
        linkReferralBonus: true,
        order: 0,
        // One item per distinct task-category bucket. MANUAL is omitted because
        // it shares the CUSTOM bucket in buildDailyProgress (would double-count).
        items: {
          create: [
            { taskType: "ARTICLE", description: "Read 5 articles", targetCount: 5, pointsPerComplete: 50, xpPerComplete: 10, order: 0 },
            { taskType: "VIDEO", description: "Watch 5 videos", targetCount: 5, pointsPerComplete: 50, xpPerComplete: 10, order: 1 },
            { taskType: "QUIZ", description: "Complete 3 quizzes", targetCount: 3, pointsPerComplete: 100, xpPerComplete: 20, order: 2 },
            { taskType: "SURVEY", description: "Complete 2 surveys", targetCount: 2, pointsPerComplete: 150, xpPerComplete: 25, order: 3 },
            { taskType: "SOCIAL", description: "Do 2 social tasks", targetCount: 2, pointsPerComplete: 40, xpPerComplete: 8, order: 4 },
            { taskType: "OFFERWALL", description: "Complete 1 offer", targetCount: 1, pointsPerComplete: 200, xpPerComplete: 30, order: 5 },
            { taskType: "PROXY", description: "Run 1 proxy session", targetCount: 1, pointsPerComplete: 60, xpPerComplete: 12, order: 6 },
            { taskType: "BOARD", description: "Do 1 board task", targetCount: 1, pointsPerComplete: 80, xpPerComplete: 15, order: 7 },
            { taskType: "CUSTOM", description: "Do 1 custom/manual task", targetCount: 1, pointsPerComplete: 80, xpPerComplete: 15, order: 8 },
          ],
        },
      },
    });
    console.log("Seeded default daily mission");
  } else {
    console.log("Daily mission already exists — skipping");
  }

  // Seed a few default Social banners (auto-sliding carousel at the top of /social).
  // Idempotent: each is created only if a banner with that title is absent.
  const defaultBanners = [
    { title: "Community · Share & Win", subtitle: "Post, engage, and climb the leaderboard.", bgGradient: "from-indigo-600 to-purple-600", linkUrl: "/social", order: 0 },
    { title: "Invite friends, earn 10% forever", subtitle: "Grow your team and earn passive referral income.", bgGradient: "from-emerald-500 to-teal-600", linkUrl: "/referrals", order: 1 },
    { title: "Finish your Daily Mission", subtitle: "Complete today's tasks to collect a bonus.", bgGradient: "from-amber-500 to-red-500", linkUrl: "/daily-mission", order: 2 },
    { title: "Climb the leaderboard", subtitle: "Top earners win rewards every week.", bgGradient: "from-cyan-500 to-blue-600", linkUrl: "/leaderboard", order: 3 },
    { title: "Find Your Tribe", subtitle: "Join groups that match your vibe.", bgGradient: "from-pink-500 to-orange-500", linkUrl: "/social", order: 4 },
  ];
  for (const b of defaultBanners) {
    const exists = await prisma.banner.findFirst({ where: { title: b.title }, select: { id: true } });
    if (!exists) {
      await prisma.banner.create({
        data: { ...b, location: "HOME", isActive: true },
      });
    }
  }
  console.log("Seeded default social banners");

  // Create referral levels
  const referralLevels = await prisma.referralLevel.createMany({
    skipDuplicates: true,
    data: [
      { level: 1, commissionRate: 10, description: "Direct referrals - 10% commission" },
      { level: 2, commissionRate: 5, description: "Second level - 5% commission" },
      { level: 3, commissionRate: 2, description: "Third level - 2% commission" },
    ],
  });
  console.log(`Created ${referralLevels.count} referral levels`);

  // Create some badges
  const badges = await prisma.badge.createMany({
    skipDuplicates: true,
    data: [
      { name: "Early Bird", description: "Joined during beta", icon: "bird", color: "#3B82F6", requirement: "beta_user", xpReward: 100 },
      { name: "Task Master", description: "Completed 100 tasks", icon: "star", color: "#F59E0B", requirement: "tasks_100", xpReward: 500 },
      { name: "Referral King", description: "Referred 10 users", icon: "crown", color: "#8B5CF6", requirement: "referrals_10", xpReward: 1000 },
      { name: "Streak Champion", description: "7 day login streak", icon: "fire", color: "#EF4444", requirement: "streak_7", xpReward: 200 },
      { name: "Big Spender", description: "Subscribed to a premium tier", icon: "diamond", color: "#06B6D4", requirement: "premium_user", xpReward: 500 },
    ],
  });
  console.log(`Created ${badges.count} badges`);

  // Create achievements
  const achievements = await prisma.achievement.createMany({
    skipDuplicates: true,
    data: [
      { name: "First Task", description: "Complete your first task", icon: "target", type: "tasks_completed", threshold: 1, pointsReward: 50, xpReward: 10 },
      { name: "Task Beginner", description: "Complete 10 tasks", icon: "clipboard", type: "tasks_completed", threshold: 10, pointsReward: 200, xpReward: 50 },
      { name: "Task Pro", description: "Complete 50 tasks", icon: "trophy", type: "tasks_completed", threshold: 50, pointsReward: 500, xpReward: 150 },
      { name: "First Referral", description: "Refer your first friend", icon: "users", type: "referrals_made", threshold: 1, pointsReward: 100, xpReward: 25 },
      { name: "Referral Star", description: "Refer 5 friends", icon: "star", type: "referrals_made", threshold: 5, pointsReward: 500, xpReward: 100 },
      { name: "First Withdrawal", description: "Make your first withdrawal", icon: "wallet", type: "withdrawals_made", threshold: 1, pointsReward: 100, xpReward: 25 },
    ],
  });
  console.log(`Created ${achievements.count} achievements`);

  console.log("\n========================================");
  console.log("  Seed completed successfully!");
  console.log("========================================");
  console.log("\n All accounts use the same password: Test@123");
  console.log("\n Test Accounts:");
  console.log("----------------------------------------");
  console.log(" SUPER_ADMIN:");
  console.log("   Email: superadmin@earngpt.com");
  console.log("");
  console.log(" FINANCE_ADMIN:");
  console.log("   Email: finance@earngpt.com");
  console.log("");
  console.log(" CONTENT_ADMIN:");
  console.log("   Email: content@earngpt.com");
  console.log("");
  console.log(" SUPPORT_ADMIN:");
  console.log("   Email: support@earngpt.com");
  console.log("");
  console.log(" MARKETING_ADMIN:");
  console.log("   Email: marketing@earngpt.com");
  console.log("");
  console.log(" MODERATOR:");
  console.log("   Email: moderator@earngpt.com");
  console.log("");
  console.log(" USER:");
  console.log("   Email: user@earngpt.com");
  console.log("----------------------------------------");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
