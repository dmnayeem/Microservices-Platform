import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithdrawalView } from "@/components/user/wallet/withdrawal-view";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getPointsPerUsd } from "@/lib/economy";
import { TIER_KEYS, TIER_LIMITS } from "@/lib/tiers";

/**
 * Resolve a package to a withdrawal-tier key (FREE/STARTER/PRO/ELITE/VIP).
 * The stored `slug` is usually the tier name, but the seeded default package
 * uses "default" and admins may create custom slugs — so match the slug
 * case-insensitively first, then fall back to the package's `accessLevel`
 * ordinal. Without this, an unmatched slug fell through to FREE's {min:0,max:0}
 * and the form showed "Min $0 · Max $0".
 */
function resolveTier(
  pkg: { slug: string; accessLevel: number } | null | undefined
): string {
  if (!pkg) return "FREE";
  const up = pkg.slug.toUpperCase();
  if (TIER_LIMITS[up]) return up;
  return TIER_KEYS[pkg.accessLevel] ?? "FREE";
}

export default async function WithdrawalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, methods, toggles, pointsPerUsd] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        cashBalance: true,
        pointsBalance: true,
        kycStatus: true,
        package: { select: { slug: true, accessLevel: true } },
      },
    }),
    prisma.userPaymentMethod.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    getUiToggles(),
    getPointsPerUsd(),
  ]);

  return (
    <WithdrawalView
      cashBalance={Number(user?.cashBalance ?? 0)}
      pointsBalance={user?.pointsBalance ?? 0}
      packageTier={resolveTier(user?.package)}
      kycStatus={user?.kycStatus ?? "NOT_SUBMITTED"}
      requireKyc={toggles.requireKycForWithdrawal}
      pointsPerUsd={pointsPerUsd}
      methods={methods.map((m) => ({
        id: m.id,
        type: m.method,
        label: m.accountName ?? `${m.method} · ${m.accountNumber}`,
        isDefault: m.isDefault,
      }))}
    />
  );
}
