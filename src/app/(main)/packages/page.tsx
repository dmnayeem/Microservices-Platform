import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { PackagesView } from "@/components/user/packages/packages-view";

export default async function PackagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [packages, user] = await Promise.all([
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
      currentTier={user?.package?.slug ?? "default"}
      cashBalance={Number(user?.cashBalance ?? 0)}
      pointsBalance={user?.pointsBalance ?? 0}
    />
  );
}
