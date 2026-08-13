import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { getEffectivePackage } from "@/lib/packages";
import { PackagesView } from "@/components/user/packages/packages-view";

export default async function PackagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [packages, user, effectivePkg] = await Promise.all([
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        package: { select: { slug: true } },
        cashBalance: true,
        pointsBalance: true,
      },
    }),
    // The plan the user is really on right now — resolves null/expired → free
    // default — so the "Current" badge is correct even for implicit-free users.
    getEffectivePackage(session.user.id),
  ]);

  return (
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
      cashBalance={Number(user?.cashBalance ?? 0)}
      pointsBalance={user?.pointsBalance ?? 0}
    />
  );
}
