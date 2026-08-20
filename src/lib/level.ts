/**
 * The ONE XP/level curve. Client-safe (no prisma, no next/cache) so the
 * dashboard, the Earn hub and the profile all render the same number.
 *
 * Before this module existed there were four competing formulas — a threshold
 * table here, a `level² × 100` curve in `utils.ts`, and a `level * 100` divisor
 * on the dashboard that divided CUMULATIVE xp, pinning every user past level 2
 * at "100% to next level".
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
