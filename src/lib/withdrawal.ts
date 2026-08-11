import "server-only";
import { getSetting } from "@/lib/system-settings";
import { getEffectiveFeatures } from "@/lib/packages";

/**
 * Single source of truth for a user's withdrawal limits + fee, so the client
 * display, the fee summary, and the server enforcement all agree.
 *
 * Numbers come from the admin **Financial (earning) settings** (`min_withdrawal`,
 * `max_withdrawal`, `withdrawal_fee_percent`) and the global `allow_withdrawals`
 * kill-switch, layered with the user's effective package (`minWithdrawal` raises
 * the floor, `withdrawalFeeDiscount` cuts the fee, and the `withdrawals` feature
 * flag gates access). Replaces the old hardcoded client `TIER_LIMITS` (which had
 * FREE = {min:0,max:0} and blocked everyone) + the per-method server fee tables.
 */
export interface WithdrawalConfig {
  /** Minimum withdrawal (USD). */
  min: number;
  /** Maximum withdrawal (USD). */
  max: number;
  /** Effective fee percentage (0–100) after any package discount. */
  feePct: number;
  /** Whether this user may withdraw at all (global switch + package feature). */
  enabled: boolean;
  /**
   * True only when the admin requires an active subscription to withdraw AND
   * this user is on the free/default plan. When true, `enabled` is false and the
   * UI shows the "subscribe to withdraw" card (distinct from other lock reasons).
   */
  subscriptionRequired: boolean;
  /** Admin-configured "you'll receive funds in …" message shown to the user. */
  payoutMessage: string;
}

export async function getWithdrawalConfig(
  userId: string
): Promise<WithdrawalConfig> {
  const [
    globalMin,
    globalMax,
    globalFeePct,
    allowWithdrawals,
    requiresSubscription,
    payoutMessage,
    feats,
  ] = await Promise.all([
    getSetting<number>("min_withdrawal", 5),
    getSetting<number>("max_withdrawal", 1000),
    getSetting<number>("withdrawal_fee_percent", 5),
    getSetting<boolean>("allow_withdrawals", true),
    getSetting<boolean>("withdrawal_requires_subscription", false),
    getSetting<string>("withdrawal_payout_time_message", "1-3 business days"),
    getEffectiveFeatures(userId),
  ]);

  const pkg = feats.pkg;
  // PackageRow money columns are already numbers (see toPackageRow).
  const packageMin = pkg ? Number(pkg.minWithdrawal) || 0 : 0;
  const packageFeeDiscount = pkg ? Number(pkg.withdrawalFeeDiscount) || 0 : 0;

  // getEffectivePackage collapses expired/absent subscriptions to the default
  // (isDefault=true) plan, so a non-default effective package == an active paid
  // subscription — no expiry re-check needed here.
  const hasSubscription = !!pkg && !pkg.isDefault;
  const subscriptionRequired = requiresSubscription === true && !hasSubscription;

  const min = Math.max(Number(globalMin) || 0, packageMin);
  const max = Math.max(0, Number(globalMax) || 0);
  const feePct = Math.max(
    0,
    Math.min(100, (Number(globalFeePct) || 0) - packageFeeDiscount)
  );
  const enabled =
    allowWithdrawals !== false &&
    feats.enabled.has("withdrawals") &&
    !subscriptionRequired;

  return {
    min,
    max,
    feePct,
    enabled,
    subscriptionRequired,
    payoutMessage: payoutMessage || "1-3 business days",
  };
}
