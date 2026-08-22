// Package-tier <-> accessLevel helpers.
//
// Named `missions.ts` until Missions became a real product with its own module;
// it never held mission logic, only this map.
//
// `DailyMissionTemplate` stores the tier as `requiredAccessLevel` (Int), but the
// admin UI works with a named tier enum. These map between the two so the admin
// routes/list and the user-facing gating stay consistent.

export const TIER_TO_ACCESS_LEVEL = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ELITE: 3,
  VIP: 4,
} as const;

export type PackageTier = keyof typeof TIER_TO_ACCESS_LEVEL;

export function tierToAccessLevel(tier: PackageTier): number {
  return TIER_TO_ACCESS_LEVEL[tier] ?? 0;
}

export function accessLevelToTier(level: number): PackageTier {
  return (
    (Object.keys(TIER_TO_ACCESS_LEVEL) as PackageTier[]).find(
      (k) => TIER_TO_ACCESS_LEVEL[k] === level
    ) ?? "FREE"
  );
}
