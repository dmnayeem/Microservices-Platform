import { getSetting } from "@/lib/system-settings";
import {
  DEFAULT_POINTS_TO_USD_RATE,
  DEFAULT_POINTS_CONVERT_THRESHOLD,
} from "@/config/constants";

/**
 * Points ⇆ USD conversion rate, admin-configurable.
 *
 * `points_per_usd` = how many points equal $1 (default 1000 → 1 pt = $0.001).
 * Stored in SystemSetting (key `points_per_usd`, category `financial`) and edited
 * from Admin → System Settings → Financial. Every money boundary (withdrawals,
 * earn-time USD mirrors, balance display) reads this so the whole app stays
 * consistent when an admin changes the rate.
 *
 * A short in-memory cache avoids a DB read on every credit; `invalidatePointsRateCache()`
 * clears it after an admin save.
 */
const TTL_MS = 30_000;
let _cache: { value: number; at: number } | null = null;

export async function getPointsPerUsd(): Promise<number> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.value;
  const raw = await getSetting<number>("points_per_usd", DEFAULT_POINTS_TO_USD_RATE);
  const value =
    typeof raw === "number" && isFinite(raw) && raw > 0
      ? raw
      : DEFAULT_POINTS_TO_USD_RATE;
  _cache = { value, at: Date.now() };
  return value;
}

export function invalidatePointsRateCache(): void {
  _cache = null;
}

/** Convert a points amount to its USD value at the given rate. */
export function pointsToUsd(points: number, pointsPerUsd: number): number {
  return points / pointsPerUsd;
}

/** Convert a USD amount to whole points at the given rate. */
export function usdToPoints(usd: number, pointsPerUsd: number): number {
  return Math.round(usd * pointsPerUsd);
}

/**
 * Minimum points a user must hold before the "convert points → cash" option
 * unlocks. Admin-configurable via SystemSetting `points_convert_threshold`
 * (category `financial`); falls back to DEFAULT_POINTS_CONVERT_THRESHOLD.
 */
export async function getPointsConvertThreshold(): Promise<number> {
  const raw = await getSetting<number>(
    "points_convert_threshold",
    DEFAULT_POINTS_CONVERT_THRESHOLD
  );
  return typeof raw === "number" && isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : DEFAULT_POINTS_CONVERT_THRESHOLD;
}
