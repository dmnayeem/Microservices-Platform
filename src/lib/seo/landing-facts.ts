import "server-only";
import { getSetting } from "@/lib/system-settings";
import { getPointsPerUsd, getPointsConvertThreshold, pointsToUsd } from "@/lib/economy";
import { usd } from "@/lib/utils";
import {
  fillFaqTokens,
  withRequiredFaq,
  type FaqFacts,
  type LandingContent,
} from "@/lib/landing-content";

/**
 * The live money facts the public FAQ quotes — points rate, convert minimum,
 * minimum withdrawal, payout time — read from the same settings the wallet
 * and withdrawal screens use (lib/economy, lib/withdrawal), so the home page
 * and llms.txt never state a number the app does not apply.
 */
export async function getLandingFaqFacts(): Promise<FaqFacts> {
  const [rate, threshold, minWithdrawal, payoutTime] = await Promise.all([
    getPointsPerUsd().catch(() => 1000),
    getPointsConvertThreshold().catch(() => 10000),
    getSetting<number>("min_withdrawal", 5).catch(() => 5),
    getSetting<string>("withdrawal_payout_time_message", "1-3 business days").catch(
      () => "1-3 business days"
    ),
  ]);
  const min = Math.max(0, Number(minWithdrawal) || 0);
  return {
    points_per_usd: Math.round(rate).toLocaleString("en-US"),
    convert_min_points: Math.round(threshold).toLocaleString("en-US"),
    convert_min_usd: usd(pointsToUsd(threshold, rate)),
    min_withdrawal: usd(min),
    payout_time: String(payoutTime || "1-3 business days").trim(),
  };
}

/** The required FAQ answers added back (raw content, before `publicLanding`) and their live values filled in. */
export async function withLiveFaq(c: LandingContent): Promise<LandingContent> {
  return fillFaqTokens(withRequiredFaq(c), await getLandingFaqFacts());
}
