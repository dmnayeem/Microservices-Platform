import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getUserDayContext } from "@/lib/user-day";

/**
 * "Browse & Earn" — a passive, ad-supported earning surface. The page shows
 * real ad-network creatives (CPM to the platform) and rewards the viewer a small
 * number of points for every interval the page stays open & visible, up to a
 * per-day cap. The server is the source of truth: it enforces the interval
 * cooldown and daily cap regardless of what the client claims, so the reward can
 * never be farmed faster than configured.
 *
 * All knobs live in SystemSetting (category "ads") so an admin tunes payout vs.
 * their real ad-network CPM from the Monetization page.
 */

export interface BrowseEarnConfig {
  enabled: boolean;
  /** Points credited per completed interval. */
  pointsPerTick: number;
  /** Seconds of visible viewing required per reward. */
  tickSeconds: number;
  /** Max points a user can earn per local day from this surface. */
  dailyCap: number;
}

export const BROWSE_EARN_DEFAULTS: BrowseEarnConfig = {
  enabled: true,
  pointsPerTick: 1,
  tickSeconds: 45,
  dailyCap: 15,
};

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Read the admin-tuned config, with safe clamped fallbacks. */
export async function getBrowseEarnConfig(): Promise<BrowseEarnConfig> {
  try {
    const [enabled, points, seconds, cap] = await Promise.all([
      getSetting<boolean>("ads.browse_earn_enabled", BROWSE_EARN_DEFAULTS.enabled),
      getSetting<number>("ads.browse_earn_points", BROWSE_EARN_DEFAULTS.pointsPerTick),
      getSetting<number>("ads.browse_earn_seconds", BROWSE_EARN_DEFAULTS.tickSeconds),
      getSetting<number>("ads.browse_earn_daily_cap", BROWSE_EARN_DEFAULTS.dailyCap),
    ]);
    return {
      enabled: enabled !== false,
      pointsPerTick: clampInt(points, 1, 1000, BROWSE_EARN_DEFAULTS.pointsPerTick),
      tickSeconds: clampInt(seconds, 10, 600, BROWSE_EARN_DEFAULTS.tickSeconds),
      dailyCap: clampInt(cap, 0, 100000, BROWSE_EARN_DEFAULTS.dailyCap),
    };
  } catch {
    return { ...BROWSE_EARN_DEFAULTS };
  }
}

/** Sum of points a user has already earned from browsing during their local day. */
export async function getBrowseEarnToday(userId: string): Promise<number> {
  try {
    const { startOfDayUtc } = await getUserDayContext(userId);
    const agg = (await prisma.browseEarnLog.aggregate({
      where: { userId, createdAt: { gte: startOfDayUtc } },
      _sum: { points: true },
    })) as unknown as { _sum: { points: number | null } };
    return agg._sum.points ?? 0;
  } catch {
    return 0;
  }
}
