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

/**
 * The curve the platform ships with. Cumulative XP to REACH each level,
 * starting at level 2 — level 1 is always 0.
 */
export const DEFAULT_LEVEL_CURVE: number[] = [
  100, 250, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000,
];

/** Beyond the table, each level costs this much more than the last. */
export const DEFAULT_LEVEL_STEP = 10000;

/**
 * The curve in force.
 *
 * Admin-editable, and therefore a single global rather than a parameter on
 * seventeen call sites. That is deliberate: the bug this module was written to
 * kill was two curves disagreeing — the one that WROTE `User.level` and the one
 * that DREW the progress bar — which pinned users at 100% forever. A curve
 * passed in by some callers and defaulted by others would rebuild exactly that.
 *
 * The server sets it from settings before it reads a level; the browser gets
 * the same numbers from a script the layout inlines, so both sides answer
 * identically from the first paint.
 */
let CURVE: number[] = DEFAULT_LEVEL_CURVE;
let STEP: number = DEFAULT_LEVEL_STEP;

/* Picked up on module load in the browser. The layout writes this before any
   app code runs, the same way it sets the theme, so nothing renders a bar from
   one curve and a level from another. */
declare global {
  interface Window {
    __EG_LEVEL_CURVE?: { thresholds: number[]; step: number };
  }
}
if (typeof window !== "undefined" && window.__EG_LEVEL_CURVE) {
  const w = window.__EG_LEVEL_CURVE;
  if (Array.isArray(w.thresholds) && w.thresholds.length > 0) CURVE = w.thresholds;
  if (Number.isFinite(w.step) && w.step > 0) STEP = w.step;
}

/**
 * Replace the curve.
 *
 * Rejects anything that does not strictly increase: a flat or falling curve
 * makes `calculateLevel` ambiguous, and a user could be two levels at once.
 */
export function setLevelCurve(thresholds: number[], step: number): boolean {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return false;
  if (!Number.isFinite(step) || step <= 0) return false;
  let last = 0;
  for (const t of thresholds) {
    if (!Number.isFinite(t) || t <= last) return false;
    last = t;
  }
  CURVE = thresholds;
  STEP = step;
  return true;
}

/** The curve in force, for the admin screen and for the boot script. */
export function getLevelCurveInUse(): { thresholds: number[]; step: number } {
  return { thresholds: [...CURVE], step: STEP };
}

/** Total XP needed to be AT a given level (cumulative from 0). */
export function calculateXpForLevel(level: number): number {
  if (level <= 1) return 0;
  const i = level - 2;
  if (i < CURVE.length) return CURVE[i];
  return CURVE[CURVE.length - 1] + (i - (CURVE.length - 1)) * STEP;
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
