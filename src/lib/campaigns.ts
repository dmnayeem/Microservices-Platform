import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";

/**
 * Campaigns that actually do something (Admin → Campaigns). Until 2026-10-11
 * nothing read the Campaign table — a campaign was a record and nothing more.
 *
 * Two kinds have an effect, both on task rewards, applied through the same
 * multiplier every task payout already uses (lib/plan-multipliers.ts):
 *   XP_MULTIPLIER → XP from tasks × value     ("Double XP weekend")
 *   BONUS_POINTS  → points from tasks × value ("1.5× task points")
 * Live while: status is not PAUSED / ENDED and now is between start and end.
 * Who: everyone, chosen plans, new accounts, or chosen countries.
 *
 * The value is a multiplier, capped at 1–5×, so a typo can't mint rewards.
 * Several live campaigns multiply together (still capped by the plan
 * multiplier's own 50× ceiling).
 */

export const CAMPAIGNS_TAG = "campaigns";
export const EFFECT_TYPES = ["XP_MULTIPLIER", "BONUS_POINTS"] as const;
export const MIN_CAMPAIGN_MULTIPLIER = 1;
export const MAX_CAMPAIGN_MULTIPLIER = 5;

export const clampCampaignValue = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CAMPAIGN_MULTIPLIER, Math.max(MIN_CAMPAIGN_MULTIPLIER, n));
};

type LiveCampaign = {
  id: string;
  type: string;
  value: number;
  startDate: string;
  endDate: string;
  targetType: string;
  targetValue: string | null;
};

// One small read for every task payout, so it is cached briefly; an admin
// change purges it (CAMPAIGNS_TAG).
const liveCampaigns = unstable_cache(
  async (): Promise<LiveCampaign[]> => {
    const rows = await prisma.campaign.findMany({
      where: {
        type: { in: [...EFFECT_TYPES] },
        status: { in: ["SCHEDULED", "ACTIVE"] },
        endDate: { gte: new Date() },
      },
      select: { id: true, type: true, value: true, startDate: true, endDate: true, targetType: true, targetValue: true },
      take: 50,
    });
    return rows.map((r) => ({ ...r, startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString() }));
  },
  ["campaigns-live"],
  { revalidate: 60, tags: [CAMPAIGNS_TAG] }
);

const list = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Task-reward multipliers from the campaigns that apply to this user right now. */
export async function campaignMultipliers(userId: string): Promise<{ taskReward: number; xp: number }> {
  const out = { taskReward: 1, xp: 1 };
  try {
    const now = Date.now();
    const live = (await liveCampaigns()).filter(
      (c) => new Date(c.startDate).getTime() <= now && new Date(c.endDate).getTime() >= now
    );
    if (live.length === 0) return out;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, country: true, lastCountry: true, signupCountry: true },
    });
    if (!user) return out;
    const needsPlan = live.some((c) => c.targetType === "TIER");
    const pkg = needsPlan ? await getEffectivePackage(userId).catch(() => null) : null;
    const country = (user.country || user.lastCountry || user.signupCountry || "").toLowerCase();

    for (const c of live) {
      let applies = true;
      if (c.targetType === "TIER") {
        const plans = list(c.targetValue);
        applies = !!pkg && (plans.includes(pkg.slug.toLowerCase()) || plans.includes(pkg.name.toLowerCase()));
      } else if (c.targetType === "NEW_USERS") {
        const days = Math.max(1, parseInt(c.targetValue ?? "", 10) || 30);
        applies = now - user.createdAt.getTime() <= days * 86_400_000;
      } else if (c.targetType === "COUNTRY") {
        applies = !!country && list(c.targetValue).includes(country);
      }
      if (!applies) continue;
      const m = clampCampaignValue(c.value);
      if (c.type === "XP_MULTIPLIER") out.xp *= m;
      if (c.type === "BONUS_POINTS") out.taskReward *= m;
    }
  } catch {
    // A campaign lookup must never block or change a payout on error.
    return { taskReward: 1, xp: 1 };
  }
  return out;
}
