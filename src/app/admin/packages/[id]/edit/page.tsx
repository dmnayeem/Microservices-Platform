import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { PackageForm, type PackageFormPkg } from "../../_components/PackageForm";
import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPackagePage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "packages.edit")) {
    redirect("/admin/packages");
  }

  const { id } = await params;

  const pkg = await prisma.package.findUnique({
    where: { id },
  });

  if (!pkg) {
    notFound();
  }

  // Re-shape into the form's view model so Tailwind/React control flow stays simple.
  const formPkg: PackageFormPkg = {
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    description: pkg.description,
    accessLevel: pkg.accessLevel,
    isDefault: pkg.isDefault,
    isActive: pkg.isActive,
    order: pkg.order,

    priceMonthly: toNum(pkg.priceMonthly),
    priceYearly: toNumOrNull(pkg.priceYearly),
    validityDays: pkg.validityDays,

    tasksEnabled: pkg.tasksEnabled,
    socialFeedEnabled: pkg.socialFeedEnabled,
    referralsEnabled: pkg.referralsEnabled,
    withdrawalsEnabled: pkg.withdrawalsEnabled,
    marketplaceEnabled: pkg.marketplaceEnabled,
    boostEnabled: pkg.boostEnabled,
    dailyMissionEnabled: pkg.dailyMissionEnabled,
    lotteryEnabled: pkg.lotteryEnabled,
    coursesEnabled: pkg.coursesEnabled,
    advertiserEnabled: pkg.advertiserEnabled,
    gamesEnabled: pkg.gamesEnabled,
    adFree: pkg.adFree,

    createTasksEnabled: pkg.createTasksEnabled,
    sellCoursesEnabled: pkg.sellCoursesEnabled,
    sellMarketplaceEnabled: pkg.sellMarketplaceEnabled,
    agencyModeEnabled: pkg.agencyModeEnabled,
    shareLinksEnabled: pkg.shareLinksEnabled,
    shareYoutubeEnabled: pkg.shareYoutubeEnabled,

    socialTasksEnabled: pkg.socialTasksEnabled,
    proxyTasksEnabled: pkg.proxyTasksEnabled,
    articleTasksEnabled: pkg.articleTasksEnabled,
    videoTasksEnabled: pkg.videoTasksEnabled,
    quizTasksEnabled: pkg.quizTasksEnabled,
    surveyTasksEnabled: pkg.surveyTasksEnabled,
    offerwallTasksEnabled: pkg.offerwallTasksEnabled,
    appInstallEnabled: pkg.appInstallEnabled,

    dailyTaskLimit: pkg.dailyTaskLimit,
    minWithdrawal: toNum(pkg.minWithdrawal),
    withdrawalFeeDiscount: pkg.withdrawalFeeDiscount,

    xpMultiplier: pkg.xpMultiplier,
    taskRewardMultiplier: pkg.taskRewardMultiplier,
    socialEarningMultiplier: pkg.socialEarningMultiplier,
    dailyReferralPoints: pkg.dailyReferralPoints,
    referralCommissionLevels: pkg.referralCommissionLevels,

    features: pkg.features,
    badgeColor: pkg.badgeColor,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/packages"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800">
            <Edit className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit {pkg.name}</h1>
            <p className="text-gray-400 text-sm">
              Slug: <code className="font-mono">{pkg.slug}</code> · Access level{" "}
              <code className="font-mono">{pkg.accessLevel}</code>
            </p>
          </div>
        </div>
      </div>

      <PackageForm pkg={formPkg} mode="edit" />
    </div>
  );
}
