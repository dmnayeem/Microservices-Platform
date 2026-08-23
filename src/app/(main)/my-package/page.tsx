/* eslint-disable react-hooks/purity -- This is an async Server Component: it
   runs once per request on the server and is never hydrated, so `Date.now()`
   here is not an impure render. The React Compiler lint rule cannot tell a
   Server Component from a Client one, so it flags every call. Do not "fix" this
   by passing the time in as a prop — the value is needed to build the database
   query, before any rendering happens. */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import {
  MyPackageView,
  type PackageData,
  type SubscriptionHistoryItem,
} from "@/components/user/packages/my-package-view";

export default async function MyPackagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [user, subscriptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        packageId: true,
        packageExpiresAt: true,
        package: true,
      },
    }),
    prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { package: { select: { id: true, slug: true, name: true } } },
    }),
  ]);

  if (!user) redirect("/login");

  const pkg = user.package;

  const currentPackage: PackageData | null = pkg
    ? {
        tier: pkg.slug,
        name: pkg.name,
        description: pkg.description,
        priceMonthly: toNum(pkg.priceMonthly),
        priceYearly: toNumOrNull(pkg.priceYearly),
        dailyTaskLimit: pkg.dailyTaskLimit,
        withdrawalFee: pkg.withdrawalFeeDiscount,
        minWithdrawal: toNum(pkg.minWithdrawal),
        features: pkg.features,
        referralBonus: pkg.dailyReferralPoints,
        xpMultiplier: pkg.xpMultiplier,
      }
    : null;

  type SubWithPackage = (typeof subscriptions)[number] & {
    package: { id: string; slug: string; name: string } | null;
  };
  const subs = subscriptions as SubWithPackage[];
  const history: SubscriptionHistoryItem[] = subs.map((s) => ({
    id: s.id,
    packageTier: s.package?.name ?? "—",
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    amount: Number(s.amount),
    paymentMethod: s.paymentMethod,
    isActive: s.isActive,
    autoRenew: s.autoRenew,
    createdAt: s.createdAt.toISOString(),
  }));

  const nowMs = Date.now();
  const hasActivePaidSubscription = subs.some(
    (s) =>
      s.isActive &&
      (s.package?.slug ?? "default") !== "default" &&
      new Date(s.endDate).getTime() > nowMs
  );

  return (
    <MyPackageView
      packageTier={pkg?.slug ?? "default"}
      packageExpiresAt={user.packageExpiresAt?.toISOString() ?? null}
      currentPackage={currentPackage}
      subscriptions={history}
      hasActivePaidSubscription={hasActivePaidSubscription}
    />
  );
}
