import { getSetting } from "@/lib/system-settings";

/**
 * Floor on a rewarded ad's per-user cooldown, in seconds.
 *
 * The admin routes clamped this with `Math.max(0, …)`, and the reward gate is
 * `Date.now() < last.createdAt + cooldown * 1000` — so a cooldown of 0 makes the
 * comparison always false and the gate vanishes. That route has no daily cap
 * either, so one mistyped config field turned a rewarded ad into unlimited
 * points. 60s is short enough for any legitimate "watch again" flow.
 */
export const MIN_REWARD_COOLDOWN_SEC = 60;

export function clampRewardCooldown(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 3600;
  return Math.max(MIN_REWARD_COOLDOWN_SEC, Math.round(n));
}

/**
 * Cost billed to an advertiser per ad click, in dollars. Admin-configurable via
 * the `ads.cpcUsd` SystemSetting; defaults to $0.05. Clamped to a sane range so
 * a bad setting can't zero-out or blow up billing.
 */
export async function getAdClickCost(): Promise<number> {
  const raw = await getSetting<number>("ads.cpcUsd", 0.05);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0.05;
  return Math.min(Math.max(n, 0.001), 100);
}
