import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull, type MoneyInput } from "@/lib/money";
import {
  FEATURE_TO_COLUMN,
  FEATURE_KEYS,
  FEATURES,
  ROLE_FEATURES,
  parseFeatureOverrides,
  type PackageFeatureKey,
  type FeatureOverrides,
} from "@/lib/features";
import type { UserRole } from "@/lib/rbac";

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
  shareLinksEnabled: boolean;
  shareYoutubeEnabled: boolean;
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
/**
 * Normalize a raw Prisma `Package` row into a `PackageRow`: the money columns
 * are `Decimal` in the DB but `PackageRow` (and every consumer) uses `number`,
 * so convert them at this single boundary instead of leaking Decimals behind an
 * `as unknown as PackageRow` cast.
 */
function toPackageRow(pkg: unknown): PackageRow {
  const p = pkg as Record<string, unknown>;
  return {
    ...(p as unknown as PackageRow),
    priceMonthly: toNum(p.priceMonthly as MoneyInput),
    priceYearly: toNumOrNull(p.priceYearly as MoneyInput | null),
    minWithdrawal: toNum(p.minWithdrawal as MoneyInput),
  };
}

// React.cache: dedupe the per-request user lookup — called on the ad-serve hot
// path and several times per render (mirrors getEffectiveFeatures below).
export const getEffectivePackage = cache(async function getEffectivePackage(
  userId: string
): Promise<PackageRow | null> {
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        packageId: true,
        packageExpiresAt: true,
        package: true,
      },
      // Accelerate edge cache: the user's plan changes rarely; serve stale
      // through a transient DB blip instead of failing the request.
      cacheStrategy: { ttl: 30, swr: 60 },
    });
  } catch {
    // DB blip → degrade to the (resilient, memoized) default plan.
    return defaultPackage().catch(() => null);
  }

  if (!user) return defaultPackage();

  // Expired premium subs fall back to default.
  const subActive =
    user.package &&
    user.package.isActive &&
    (user.packageExpiresAt == null ||
      user.packageExpiresAt.getTime() > Date.now());

  if (subActive) return toPackageRow(user.package);

  return defaultPackage();
});

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
  const value = row ? toPackageRow(row) : null;
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

export type FeatureResult = {
  pkg: PackageRow | null;
  overrides: FeatureOverrides;
  enabled: Set<PackageFeatureKey>;
};

// Cross-request memo for the per-navigation feature set. The (main) layout
// resolves this on EVERY authenticated page load; React.cache only dedupes
// within one render, so this short module TTL also cuts the repeat User⋈Package
// join across navigations. Combined with the guard below, a transient DB blip
// serves the last-known set instead of crashing the whole shell to "Try again".
const _featCache = new Map<string, { value: FeatureResult; at: number }>();
const FEAT_TTL_MS = 20_000;

/** Drop a user's cached feature set so a plan / override change reflects at
 *  once (otherwise it self-heals within ~20-30s). No arg = clear everyone. */
export function invalidateUserFeatures(userId?: string) {
  if (userId) _featCache.delete(userId);
  else _featCache.clear();
}

/**
 * The user's effective feature set = package flags with per-user overrides
 * applied. Use `enabled.has(key)` for nav hiding + page gating. Cached and
 * fail-safe: never throws (returns last-known / default-plan features on error).
 */
export const getEffectiveFeatures = cache(async function getEffectiveFeatures(
  userId: string
): Promise<FeatureResult> {
  const cached = _featCache.get(userId);
  if (cached && Date.now() - cached.at < FEAT_TTL_MS) return cached.value;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        packageExpiresAt: true,
        package: true,
        featureOverrides: true,
      },
      cacheStrategy: { ttl: 30, swr: 60 },
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
    // Role-granted features (e.g. AGENCY → advertiser/agency console) union on
    // top, unless a per-user override explicitly turns the feature OFF.
    const roleFeatures = ROLE_FEATURES[(user?.role as UserRole) ?? "USER"] ?? [];
    for (const key of roleFeatures) {
      if (overrides[key] === false) continue;
      enabled.add(key);
    }
    const value: FeatureResult = { pkg, overrides, enabled };
    _featCache.set(userId, { value, at: Date.now() });
    return value;
  } catch {
    // Fail-safe: ride out a DB blip on the last-known set, else degrade to the
    // default plan's features. Never throw → the shell never hits "Try again".
    if (cached) return cached.value;
    const pkg = await defaultPackage().catch(() => null);
    const enabled = new Set<PackageFeatureKey>();
    for (const key of FEATURE_KEYS) {
      if (packageHasFeature(pkg, key)) enabled.add(key);
    }
    return { pkg, overrides: {}, enabled };
  }
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
