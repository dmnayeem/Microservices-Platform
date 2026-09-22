import { getSetting } from "@/lib/system-settings";
import {
  DEFAULT_LEVEL_CURVE,
  DEFAULT_LEVEL_STEP,
  setLevelCurve,
  getLevelCurveInUse,
} from "@/lib/level";

export const LEVEL_CURVE_KEY = "gamification.level_curve";

export interface LevelCurve {
  /** Cumulative XP to reach level 2, 3, 4 … in order. */
  thresholds: number[];
  /** What each level beyond the table costs. */
  step: number;
}

/**
 * The admin's curve, or the one the platform ships with.
 *
 * Validated on the way out, not just on the way in. The value lives in a JSON
 * column an admin edits, and a curve that does not strictly increase makes
 * `calculateLevel` ambiguous — a user could satisfy two levels at once. A bad
 * row therefore reads as "no row": the default, which is always sane.
 */
export async function getLevelCurve(): Promise<LevelCurve> {
  const raw = await getSetting<unknown>(LEVEL_CURVE_KEY, null);
  const fallback: LevelCurve = {
    thresholds: [...DEFAULT_LEVEL_CURVE],
    step: DEFAULT_LEVEL_STEP,
  };
  if (!raw || typeof raw !== "object") return fallback;

  const r = raw as { thresholds?: unknown; step?: unknown };
  const thresholds = Array.isArray(r.thresholds)
    ? r.thresholds.map((n) => Number(n))
    : [];
  const step = Number(r.step);

  if (thresholds.length === 0 || !Number.isFinite(step) || step <= 0) {
    return fallback;
  }
  let last = 0;
  for (const t of thresholds) {
    if (!Number.isFinite(t) || t <= last) return fallback;
    last = t;
  }
  return { thresholds, step };
}

/**
 * Put the admin's curve into force for this request.
 *
 * Called by anything that reads or writes a level. Cheap: `getSetting` is
 * memoised for ~45s, and on a warm instance where the curve has not moved this
 * does nothing at all.
 *
 * The comparison matters. Serverless instances are reused, and re-setting an
 * identical curve on every request would be harmless but pointless; what it
 * must NOT do is leave a stale curve in place after an admin edits one, which
 * is why it re-reads rather than setting once per process.
 */
export async function ensureLevelCurve(): Promise<LevelCurve> {
  const curve = await getLevelCurve();
  const inUse = getLevelCurveInUse();
  const same =
    inUse.step === curve.step &&
    inUse.thresholds.length === curve.thresholds.length &&
    inUse.thresholds.every((t, i) => t === curve.thresholds[i]);
  if (!same) setLevelCurve(curve.thresholds, curve.step);
  return curve;
}
