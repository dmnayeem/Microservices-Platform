import "server-only";
import { dbRateLimit } from "@/lib/rate-limit-db";
import { getSetting } from "@/lib/system-settings";

/**
 * How often a single user may be shown a full-screen ad.
 *
 * There was no frequency cap of any kind anywhere in the codebase, and
 * `runInterstitial()` serialises its callers — so a user claiming five things in
 * a row was queued five full-screen ads back to back. At the density the owner
 * asked for, that is the fastest possible route to an ad blocker, which this
 * platform already spends effort fighting.
 *
 * The cap lives on the SERVER, inside `serveAd`, for two reasons. It cannot be
 * bypassed by a client. And when it trips, `serveAd` simply returns no ad —
 * which `AdInterstitialOverlay` already handles by calling `onDone()`
 * immediately. So a capped user's reward is never delayed and never blocked;
 * they just don't see an ad. No new code path, no risk to a payout.
 *
 * `GAME_INTERSTITIAL` is deliberately exempt. Games throttle their own ads per
 * game (`adThrottleSeconds`), and when `rewardRequiresAd` is on, a play session's
 * payout is bounded by `adsShown` — so suppressing a game ad would suppress the
 * user's earnings. That surface manages itself.
 */

/** Placements this cap applies to. Games manage their own pacing. */
const CAPPED_PLACEMENTS = new Set(["REWARD_INTERSTITIAL", "VIDEO_INTERSTITIAL"]);

export function isFrequencyCapped(placement: string): boolean {
  return CAPPED_PLACEMENTS.has(placement);
}

export interface AdFrequencyConfig {
  /** Seconds a user must wait between full-screen ads. 0 disables the gap. */
  minGapSeconds: number;
  /** Most full-screen ads one user may be shown per day. 0 disables the cap. */
  dailyMax: number;
}

const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Admin-settable, clamped on read — the same shape `getBrowseEarnConfig` and
 * `getAdDensity` use, so one mistyped value can't make the app unusable.
 */
export async function getAdFrequencyConfig(): Promise<AdFrequencyConfig> {
  const [gap, daily] = await Promise.all([
    getSetting<number>("ads.interstitial_min_gap_sec", 60),
    getSetting<number>("ads.interstitial_daily_max", 25),
  ]);
  return {
    minGapSeconds: clampInt(gap, 60, 0, 3600),
    dailyMax: clampInt(daily, 25, 0, 500),
  };
}

export interface FrequencyDecision {
  allowed: boolean;
  /** Which limit refused it — for logging and the admin's own understanding. */
  reason?: "gap" | "daily";
}

/**
 * Count one full-screen ad against this user's budget and say whether it may be
 * shown.
 *
 * Both windows go through `dbRateLimit`, which upserts on a unique
 * `(bucket, window)` index — so the count is correct across serverless
 * instances, unlike an in-memory map. It also fails OPEN: if the limiter's own
 * query fails, the ad is allowed. An outage should not cost the platform its
 * revenue.
 *
 * Note this INCREMENTS, so call it only when an ad is actually about to be
 * served — never for a preview.
 */
export async function claimInterstitialSlot(
  userId: string,
  placement: string
): Promise<FrequencyDecision> {
  if (!isFrequencyCapped(placement)) return { allowed: true };

  const cfg = await getAdFrequencyConfig();

  // Daily budget first: it is the one a user would actually notice, and checking
  // it first means a user who is out of budget for the day doesn't also burn
  // their gap window.
  if (cfg.dailyMax > 0) {
    const day = await dbRateLimit(`adfreq:day:${userId}`, cfg.dailyMax, 86_400_000);
    if (!day.ok) return { allowed: false, reason: "daily" };
  }

  if (cfg.minGapSeconds > 0) {
    const gap = await dbRateLimit(
      `adfreq:gap:${userId}`,
      1,
      cfg.minGapSeconds * 1000
    );
    if (!gap.ok) return { allowed: false, reason: "gap" };
  }

  return { allowed: true };
}
