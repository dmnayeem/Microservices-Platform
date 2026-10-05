/**
 * Demo plans: Standard ($9.99) and Premium ($19.99), next to the existing
 * default Free plan. Creates a plan only when its slug does not exist yet —
 * never overwrites an admin's edits, never touches Free. Every value is a
 * starting point the owner edits at /admin/packages.
 *
 * Run: npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/seed-demo-plans.ts
 */
import { prisma } from "./_q";

const common = {
  isDefault: false,
  isActive: true,
  tasksEnabled: true,
  socialFeedEnabled: true,
  referralsEnabled: true,
  withdrawalsEnabled: true,
  marketplaceEnabled: true,
  dailyMissionEnabled: true,
  lotteryEnabled: true,
  coursesEnabled: true,
  advertiserEnabled: true,
  gamesEnabled: true,
  socialTasksEnabled: true,
  articleTasksEnabled: true,
  videoTasksEnabled: true,
  quizTasksEnabled: true,
  surveyTasksEnabled: true,
  offerwallTasksEnabled: true,
  appInstallEnabled: true,
  socialEarningEnabled: true,
  minWithdrawal: 50,
  agencyModeEnabled: false,
};

const PLANS = [
  {
    ...common,
    slug: "standard",
    name: "Standard",
    description: "For members who earn every day and want to cash out.",
    accessLevel: 1,
    order: 1,
    priceMonthly: 9.99,
    isPopular: true,
    icon: "zap",
    badgeColor: "#10b981",
    dailyTaskLimit: 25,
    dailyPostLimit: 5,
    withdrawalFeeDiscount: 1,
    taskRewardMultiplier: 1.1,
    xpMultiplier: 1,
    socialEarningMultiplier: 0.5,
    dailyReferralPoints: 3,
    referralCommissionLevels: 2,
    proxyTasksEnabled: false,
    boostEnabled: true,
    createTasksEnabled: true,
    sellMarketplaceEnabled: true,
    shareLinksEnabled: true,
    sellCoursesEnabled: false,
    shareYoutubeEnabled: false,
    targetTasksEnabled: false,
    donationsEnabled: false,
    adFree: false,
    features: [
      "25 tasks a day",
      "Withdraw your earnings",
      "Create your own tasks",
      "Sell on the marketplace",
      "Boost your posts",
    ],
  },
  {
    ...common,
    slug: "premium",
    name: "Premium",
    description: "Everything, with the best rewards and no limits.",
    accessLevel: 2,
    order: 2,
    priceMonthly: 19.99,
    isPopular: false,
    icon: "crown",
    badgeColor: "#f59e0b",
    dailyTaskLimit: -1,
    dailyPostLimit: -1,
    withdrawalFeeDiscount: 2.5,
    taskRewardMultiplier: 1.25,
    xpMultiplier: 1.5,
    socialEarningMultiplier: 1,
    dailyReferralPoints: 5,
    referralCommissionLevels: 3,
    proxyTasksEnabled: true,
    boostEnabled: true,
    createTasksEnabled: true,
    sellMarketplaceEnabled: true,
    shareLinksEnabled: true,
    sellCoursesEnabled: true,
    shareYoutubeEnabled: true,
    targetTasksEnabled: true,
    donationsEnabled: true,
    adFree: true,
    features: [
      "Unlimited tasks every day",
      "Lowest withdrawal fee",
      "Sell courses and products",
      "Target who sees your tasks",
      "No ads anywhere",
    ],
  },
];

(async () => {
  for (const p of PLANS) {
    const exists = await prisma.package.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (exists) {
      console.log(`skip ${p.slug} (already exists)`);
      continue;
    }
    const created = await prisma.package.create({ data: p });
    console.log(`created ${created.slug} ${created.name} $${p.priceMonthly}`);
  }
  // One "Most popular" plan.
  await prisma.package.updateMany({ where: { isPopular: true, slug: { not: "standard" } }, data: { isPopular: false } });
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
