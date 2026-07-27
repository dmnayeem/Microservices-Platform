import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { PackageForm, type PackageFormPkg } from "../_components/PackageForm";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

export default async function NewPackagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "packages.edit")) redirect("/admin/packages");

  // Sane starter defaults — all features ON, accessLevel 1, $0 monthly.
  // Admin tweaks before saving.
  const blank: PackageFormPkg = {
    id: "",
    slug: "",
    name: "",
    description: "",
    accessLevel: 1,
    isDefault: false,
    isActive: true,
    order: 10,

    priceMonthly: 0,
    priceYearly: null,
    validityDays: null,

    tasksEnabled: true,
    socialFeedEnabled: true,
    referralsEnabled: true,
    withdrawalsEnabled: true,
    marketplaceEnabled: true,
    boostEnabled: false,
    dailyMissionEnabled: true,
    lotteryEnabled: true,
    coursesEnabled: true,
    advertiserEnabled: true,
    gamesEnabled: true,
    adFree: false,

    createTasksEnabled: false,
    sellCoursesEnabled: false,
    sellMarketplaceEnabled: false,
    agencyModeEnabled: false,
    shareLinksEnabled: false,
    shareYoutubeEnabled: false,

    socialTasksEnabled: true,
    proxyTasksEnabled: true,
    articleTasksEnabled: true,
    videoTasksEnabled: true,
    quizTasksEnabled: true,
    surveyTasksEnabled: true,
    offerwallTasksEnabled: true,
    appInstallEnabled: true,

    dailyTaskLimit: -1,
    minWithdrawal: 5,
    withdrawalFeeDiscount: 0,

    xpMultiplier: 1,
    taskRewardMultiplier: 1,
    socialEarningMultiplier: 1,
    dailyReferralPoints: 5,
    referralCommissionLevels: 1,

    features: [],
    badgeColor: "#6366f1",
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
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <Plus className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Create Plan</h1>
            <p className="text-gray-400 text-sm">
              All features default ON. Toggle off the ones you want gated for this plan.
            </p>
          </div>
        </div>
      </div>

      <PackageForm pkg={blank} mode="create" />
    </div>
  );
}
