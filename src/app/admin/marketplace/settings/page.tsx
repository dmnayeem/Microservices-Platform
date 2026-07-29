import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Settings as SettingsIcon } from "lucide-react";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { getCommissionConfig } from "@/lib/marketplace-commission";
import { getPromotionPricing } from "@/lib/promotion";
import { CATEGORIES } from "@/lib/marketplace-categories";
import { CommissionSettingsForm } from "./_components/CommissionSettingsForm";
import { PromotionPricingForm } from "./_components/PromotionPricingForm";

export default async function MarketplaceSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "marketplace.view")) redirect("/admin");

  const canManage = hasPermission(role, "marketplace.manage");
  const [config, promoPackages] = await Promise.all([
    getCommissionConfig(),
    getPromotionPricing(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/marketplace"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to marketplace
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-indigo-400" />
          Marketplace Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Platform commission applied when a sale settles. Per-listing overrides
          (set during create) take precedence; otherwise the asset-type rate
          wins; otherwise the default applies.
        </p>
      </div>

      <CommissionSettingsForm
        initial={config}
        assetTypes={CATEGORIES.map((c) => ({
          slug: c.assetType,
          label: c.label,
        }))}
        canEdit={canManage}
      />

      <PromotionPricingForm initial={promoPackages} canEdit={canManage} />
    </div>
  );
}
