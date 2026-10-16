import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { getEffectivePackage } from "@/lib/packages";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";
import { PackagesView } from "@/components/user/packages/packages-view";
import { getPlansForDisplay } from "@/lib/plans-display";
import { ServerAdSlot } from "@/components/user/primitives/server-ad-slot";

export default async function PackagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [packages, user, effectivePkg, adPointsPerUsd, display] = await Promise.all([
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        package: { select: { slug: true } },
        adFundBalance: true,
        adPointsBalance: true,
      },
    }),
    // The plan the user is really on right now — resolves null/expired → free
    // default — so the "Current" badge is correct even for implicit-free users.
    getEffectivePackage(session.user.id),
    getAdPointsPerUsd(),
    getPlansForDisplay(),
  ]);

  return (
    <>
      <ServerAdSlot placement="PACKAGES_TOP" className="mb-4" />
      <PackagesView
      packages={packages.map((p) => ({
        id: p.id,
        tier: p.slug,
        name: p.name,
        description: p.description ?? undefined,
        priceMonthly: toNum(p.priceMonthly),
        priceYearly: toNumOrNull(p.priceYearly) ?? undefined,
        dailyTaskLimit: p.dailyTaskLimit,
        withdrawalFee: p.withdrawalFeeDiscount,
      }))}
      currentTier={effectivePkg?.slug ?? user?.package?.slug ?? "default"}
      currentPackageId={effectivePkg?.id ?? null}
      // Plans are paid from Ad Fund or Ad Points (owner, 2026-10-16).
      adFundBalance={Number(user?.adFundBalance ?? 0)}
      adPointsBalance={user?.adPointsBalance ?? 0}
      adPointsPerUsd={adPointsPerUsd}
      cards={display.plans}
      />
    </>
  );
}
