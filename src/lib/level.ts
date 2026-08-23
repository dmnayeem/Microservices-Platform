/**
 * The ONE XP/level curve. Client-safe (no prisma, no next/cache) so the
 * dashboard, the Earn hub and the profile all render the same number.
 *
 * Before this module existed there were four competing formulas — a threshold
 * table here, a `level² × 100` curve in `utils.ts`, and a `level * 100` divisor
 * on the dashboard that divided CUMULATIVE xp, pinning every user past level 2
 * at "100% to next level".
 *
 * Two survived that first cleanup, because this module exported only the
 * FORWARD direction: `calculateXpForLevel`, which draws the progress bar. The
 * two API routes that actually WRITE `User.level` each carried their own
 * threshold table, and those tables disagreed with this one across the whole
 * range (their level 3 began at 300 XP, this one at 250). So the number stored
 * and the number rendered came from different curves — which is why a user
 * could sit at 100% of a level forever. `calculateLevel` below closes that:
 * it is the exact inverse of `calculateXpForLevel`, and it is the only
 * XP→level function in the codebase.
 */

/** Total XP needed to be AT a given level (cumulative from 0). */
export function calculateXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return 100;
  if (level === 3) return 250;
  if (level === 4) return 500;
  if (level === 5) return 1000;
  if (level === 6) return 2000;
  if (level === 7) return 4000;
  if (level === 8) return 7000;
  if (level === 9) return 11000;
  if (level === 10) return 16000;
  if (level === 11) return 22000;
  return 22000 + (level - 11) * 10000;
}

/** The highest level a given total XP has reached. Exact inverse of the above. */
export const MAX_LEVEL = 50;

export function calculateLevel(xp: number): number {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  while (level < MAX_LEVEL && total >= calculateXpForLevel(level + 1)) level++;
  return level;
}

/** Progress within the CURRENT level: earned, needed, and a clamped percentage. */
export function levelProgress(
  level: number,
  xp: number
): { xpProgress: number; xpNeeded: number; xpPercentage: number } {
  const xpForCurrent = calculateXpForLevel(level);
  const xpForNext = calculateXpForLevel(level + 1);
  const xpProgress = Math.max(0, xp - xpForCurrent);
  const xpNeeded = Math.max(1, xpForNext - xpForCurrent);
  const xpPercentage = Math.max(
    0,
    Math.min(100, Math.round((xpProgress / xpNeeded) * 100))
  );
  return { xpProgress, xpNeeded, xpPercentage };
}
