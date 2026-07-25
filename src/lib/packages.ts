import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  FEATURE_TO_COLUMN,
  FEATURE_KEYS,
  FEATURES,
  parseFeatureOverrides,
  type PackageFeatureKey,
  type FeatureOverrides,
} from "@/lib/features";

// Re-export the client-safe catalog so existing `@/lib/packages` imports keep working.
export { FEATURE_KEYS, FEATURES, parseFeatureOverrides };
export type { PackageFeatureKey, FeatureOverrides };

/** Effective feature value: a per-user override wins, else the package flag. */
export function resolveUserFeature(
  pkg: PackageRow | null | undefined,
  overrides: FeatureOverrides | null | undefined,
  key: PackageFeatureKey
): boolean {
  if (overrides && typeof overrides[key] === "boolean") return overrides[key]!;
  return packageHasFeature(pkg, key);
}

// Concrete PackageRow type — Prisma Accelerate's `Awaited<ReturnType<...>>`
// inference returns `{}` for findFirst/findUnique results, so we declare
// the row shape explicitly. Keep in sync with `model Package` in schema.prisma.
export interface PackageRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accessLevel: number;
  isDefault: boolean;
  priceMonthly: number;
  priceYearly: number | null;
  validityDays: number | null;
  tasksEnabled: boolean;
  socialFeedEnabled: boolean;
  referralsEnabled: boolean;
  withdrawalsEnabled: boolean;
  marketplaceEnabled: boolean;
  boostEnabled: boolean;
  dailyMissionEnabled: boolean;
  lotteryEnabled: boolean;
  coursesEnabled: boolean;
  advertiserEnabled: boolean;
  gamesEnabled: boolean;
  adFree: boolean;
  createTasksEnabled: boolean;
  sellCoursesEnabled: boolean;
  sellMarketplaceEnabled: boolean;
  agencyModeEnabled: boolean;
  socialTasksEnabled: boolean;
  proxyTasksEnabled: boolean;
  articleTasksEnabled: boolean;
  videoTasksEnabled: boolean;
  quizTasksEnabled: boolean;
  surveyTasksEnabled: boolean;
  offerwallTasksEnabled: boolean;
  appInstallEnabled: boolean;
  dailyTaskLimit: number;
  dailyPostLimit: number;
  minWithdrawal: number;
  withdrawalFeeDiscount: number;
  socialEarningEnabled: boolean;
  socialEarningConfig: Record<string, number> | null;
  xpMultiplier: number;
  taskRewardMultiplier: number;
  socialEarningMultiplier: number;
  dailyReferralPoints: number;
  referralCommissionLevels: number;
  features: string[];
  badgeColor: string | null;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resolve the package the user currently has access to.
 *
 *   - If `packageId` resolves to an active Package and `packageExpiresAt > now()`
 *     → return that Package.
 *   - Otherwise → return the system default (`isDefault=true`) Package.
 *
 * Returns `null` only if there is no default plan seeded — that is a
 * misconfiguration and callers should error or fall back to FREE-equivalent
 * behavior.
 */
export async function getEffectivePackage(
  userId: string
): Promise<PackageRow | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      packageId: true,
      packageExpiresAt: true,
      package: true,
    },
  });

  if (!user) return defaultPackage();

  // Expired premium subs fall back to default.
  const subActive =
    user.package &&
    user.package.isActive &&
    (user.packageExpiresAt == null ||
      user.packageExpiresAt.getTime() > Date.now());

  if (subActive) return user.package as unknown as PackageRow;

  return defaultPackage();
}

/**
 * The platform's default plan. Every new user is implicitly on this when
 * their `packageId` is null or their subscription has expired.
 */
// The default package changes rarely — a short module TTL avoids a `findFirst`
// on every free/expired user (the majority) on every navigation.
let _defaultPkg: { row: PackageRow | null; at: number } | null = null;
const DEFAULT_PKG_TTL_MS = 60_000;
export async function defaultPackage(): Promise<PackageRow | null> {
  if (_defaultPkg && Date.now() - _defaultPkg.at < DEFAULT_PKG_TTL_MS) {
    return _defaultPkg.row;
  }
  const row = await prisma.package.findFirst({
    where: { isDefault: true, isActive: true },
  });
  const value = (row as unknown as PackageRow | null) ?? null;
  _defaultPkg = { row: value, at: Date.now() };
  return value;
}

/**
 * `true` if the user's effective package has the given feature flag on.
 * Returns `false` (deny) when no package is resolvable — fail closed.
 */
export async function userCan(
  userId: string,
  feature: PackageFeatureKey
): Promise<boolean> {
  const pkg = await getEffectivePackage(userId);
  if (!pkg) return false;
  const column = FEATURE_TO_COLUMN[feature];
  return Boolean((pkg as unknown as Record<string, unknown>)[column]);
}

/** Convenience: true if the package row has the flag on. Useful when caller
 *  already loaded the package row to avoid a redundant fetch. */
export function packageHasFeature(
  pkg: PackageRow | null | undefined,
  feature: PackageFeatureKey
): boolean {
  if (!pkg) return false;
  const column = FEATURE_TO_COLUMN[feature];
  return Boolean((pkg as unknown as Record<string, unknown>)[column]);
}

/** Effective access level for tasks/quizzes/missions gating. */
export async function userAccessLevel(userId: string): Promise<number> {
  const pkg = await getEffectivePackage(userId);
  return pkg?.accessLevel ?? 0;
}

/**
 * The user's effective feature set = package flags with per-user overrides
 * applied. One query. Use `enabled.has(key)` for nav hiding + page gating.
 */
// `React.cache` dedupes this per request — the (main) layout + several child
// pages all resolve features in the same render, so this collapses ~7 identical
// user queries into one.
export const getEffectiveFeatures = cache(async function getEffectiveFeatures(
  userId: string
): Promise<{
  pkg: PackageRow | null;
  overrides: FeatureOverrides;
  enabled: Set<PackageFeatureKey>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      packageExpiresAt: true,
      package: true,
      featureOverrides: true,
    },
  });

  const subActive =
    user?.package &&
    user.package.isActive &&
    (user.packageExpiresAt == null ||
      user.packageExpiresAt.getTime() > Date.now());
  const pkg: PackageRow | null = subActive
    ? (user!.package as unknown as PackageRow)
    : await defaultPackage();

  const overrides = parseFeatureOverrides(user?.featureOverrides);
  const enabled = new Set<PackageFeatureKey>();
  for (const key of FEATURE_KEYS) {
    if (resolveUserFeature(pkg, overrides, key)) enabled.add(key);
  }
  return { pkg, overrides, enabled };
});

/** True if the user can use a feature (override-aware). */
export async function userCanFeature(
  userId: string,
  feature: PackageFeatureKey
): Promise<boolean> {
  const { enabled } = await getEffectiveFeatures(userId);
  return enabled.has(feature);
}

/**
 * Subscription metadata for display: what's the user's raw plan, is it
 * expired, and what's the effective plan they fall back to?
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  effective: PackageRow | null;
  rawPackageId: string | null;
  expired: boolean;
  expiresAt: Date | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      packageId: true,
      packageExpiresAt: true,
    },
  });
  if (!user) {
    return {
      effective: await defaultPackage(),
      rawPackageId: null,
      expired: false,
      expiresAt: null,
    };
  }

  const expired =
    !!user.packageId &&
    !!user.packageExpiresAt &&
    user.packageExpiresAt.getTime() <= Date.now();

  const effective = await getEffectivePackage(userId);

  return {
    effective,
    rawPackageId: user.packageId,
    expired,
    expiresAt: user.packageExpiresAt,
  };
}
