import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getSetting } from "@/lib/system-settings";
import { getReferralBonusConfig } from "@/lib/referral-bonus";
import {
  MILESTONE_REWARDS_KEY,
  MILESTONE_REFERRAL_DEFER_KEY,
  type MilestoneRewardOverrides,
} from "@/lib/reward-config";

/**
 * Static milestone definitions, and each one's live progress for a user.
 *
 * One definition for the list (GET /api/milestones) AND the claim route. The
 * claim route used to keep its own reward map and never looked at progress, so
 * any signed-in user could POST /api/milestones/refer_50/claim and collect
 * every reward — 31,100 points — without doing a single one of them.
 */

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  category: "ACTIVITY" | "EARNINGS" | "SOCIAL" | "ENGAGEMENT" | "REFERRAL" | "PROFILE";
  target: number;
  unit?: string;
  pointsReward: number;
  badgeName?: string;
}

export const MILESTONES: MilestoneDef[] = [
  // Activity
  { id: "tasks_5", title: "First Steps", description: "Complete 5 tasks", category: "ACTIVITY", target: 5, pointsReward: 100 },
  { id: "tasks_25", title: "Getting Started", description: "Complete 25 tasks", category: "ACTIVITY", target: 25, pointsReward: 500, badgeName: "Active Earner" },
  { id: "tasks_100", title: "Centurion", description: "Complete 100 tasks", category: "ACTIVITY", target: 100, pointsReward: 2000, badgeName: "Centurion" },
  { id: "checkins_7", title: "Week Warrior", description: "Check in 7 days in a row", category: "ACTIVITY", target: 7, unit: " days", pointsReward: 250 },
  { id: "checkins_30", title: "Monthly Master", description: "Check in 30 days in a row", category: "ACTIVITY", target: 30, unit: " days", pointsReward: 1500, badgeName: "Streak Master" },
  // Earnings
  { id: "earn_5", title: "First Dollar", description: "Earn $5 total", category: "EARNINGS", target: 5, unit: "$", pointsReward: 250 },
  { id: "earn_50", title: "Small Wins", description: "Earn $50 total", category: "EARNINGS", target: 50, unit: "$", pointsReward: 1000, badgeName: "Earner" },
  { id: "earn_500", title: "Half Grand", description: "Earn $500 total", category: "EARNINGS", target: 500, unit: "$", pointsReward: 5000, badgeName: "Pro Earner" },
  // Social
  { id: "posts_5", title: "Conversation Starter", description: "Create 5 posts", category: "SOCIAL", target: 5, pointsReward: 200 },
  { id: "likes_50", title: "Liked", description: "Receive 50 likes on your posts", category: "SOCIAL", target: 50, pointsReward: 500, badgeName: "Popular" },
  // Engagement
  { id: "level_10", title: "Level 10", description: "Reach level 10", category: "ENGAGEMENT", target: 10, unit: " level", pointsReward: 1000, badgeName: "Apprentice" },
  { id: "level_25", title: "Level 25", description: "Reach level 25", category: "ENGAGEMENT", target: 25, unit: " level", pointsReward: 5000, badgeName: "Earner" },
  // Referral
  { id: "refer_1", title: "First Referral", description: "Refer your first friend", category: "REFERRAL", target: 1, pointsReward: 500 },
  { id: "refer_10", title: "Influencer", description: "Refer 10 friends", category: "REFERRAL", target: 10, pointsReward: 2500, badgeName: "Influencer" },
  { id: "refer_50", title: "Network King", description: "Refer 50 friends", category: "REFERRAL", target: 50, pointsReward: 10000, badgeName: "Network King" },
  // Profile
  { id: "profile_complete", title: "Identity Verified", description: "Complete KYC verification", category: "PROFILE", target: 1, pointsReward: 500, badgeName: "Verified" },
  { id: "profile_socials", title: "Social Butterfly", description: "Connect 3 social accounts", category: "PROFILE", target: 3, pointsReward: 300 },
];

/** The three milestones that count referrals — see `getMilestones`. */
export const REFERRAL_MILESTONE_IDS = ["refer_1", "refer_10", "refer_50"] as const;

export interface LiveMilestone extends MilestoneDef {
  /** Off = hidden from users and refused by the claim route. */
  enabled: boolean;
  /** Why it is off, for the admin screen. */
  disabledReason?: "admin" | "referral_ladder";
}

/**
 * The milestones as they are live right now: the built-in list above with the
 * admin's overrides from `milestones.rewards` applied (points, on/off).
 *
 * `milestones.referral_defer_to_ladder` (default ON, so the platform never pays twice)
 * switches the three referral milestones off while the admin referral
 * milestone ladder (`referral_bonus_config`) is paying — the two systems
 * reward the same thing under different ledger references, so with both on a
 * referrer is paid twice for one referral count.
 *
 * Never throws: a settings blip serves the built-in values.
 */
export async function getMilestones(): Promise<LiveMilestone[]> {
  let overrides: MilestoneRewardOverrides = {};
  let deferToLadder = true;
  try {
    const [raw, defer] = await Promise.all([
      getSetting<unknown>(MILESTONE_REWARDS_KEY, null),
      getSetting<unknown>(MILESTONE_REFERRAL_DEFER_KEY, true),
    ]);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      overrides = raw as MilestoneRewardOverrides;
    }
    deferToLadder = defer !== false;
  } catch {
    /* built-in values */
  }

  let ladderOn = false;
  if (deferToLadder) {
    const cfg = await getReferralBonusConfig();
    ladderOn = cfg.enabled && cfg.milestonesEnabled && cfg.milestones.length > 0;
  }

  return MILESTONES.map((m) => {
    const o = overrides[m.id] ?? {};
    const p = Number(o.points);
    const points =
      o.points !== undefined && Number.isInteger(p) && p >= 0 && p <= 100_000
        ? p
        : m.pointsReward;
    const adminOff = o.enabled === false;
    const ladderOff =
      ladderOn && (REFERRAL_MILESTONE_IDS as readonly string[]).includes(m.id);
    return {
      ...m,
      pointsReward: points,
      enabled: !adminOff && !ladderOff,
      disabledReason: adminOff ? "admin" : ladderOff ? "referral_ladder" : undefined,
    };
  });
}

/** Current progress toward every milestone, keyed by milestone id. Null if no such user. */
export async function milestoneProgress(userId: string): Promise<Map<string, number> | null> {
  const [user, taskSubmissionCount, postCount, likeCount, referralCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          totalEarnings: true,
          streak: true,
          level: true,
          kycStatus: true,
        },
      }),
      prisma.taskSubmission.count({
        where: {
          userId,
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
      }),
      prisma.post.count({ where: { userId } }),
      prisma.like.count({
        where: { post: { userId } },
      }),
      prisma.user.count({ where: { referredById: userId } }),
    ]);

  if (!user) return null;

  const computeCurrent = (m: MilestoneDef): number => {
    switch (m.id) {
      case "tasks_5":
      case "tasks_25":
      case "tasks_100":
        return taskSubmissionCount;
      case "checkins_7":
      case "checkins_30":
        return user.streak;
      case "earn_5":
      case "earn_50":
      case "earn_500":
        return toNum(user.totalEarnings);
      case "posts_5":
        return postCount;
      case "likes_50":
        return likeCount;
      case "level_10":
      case "level_25":
        return user.level;
      case "refer_1":
      case "refer_10":
      case "refer_50":
        return referralCount;
      case "profile_complete":
        return user.kycStatus === "APPROVED" ? 1 : 0;
      case "profile_socials":
        return 0; // no social-account model yet
      default:
        return 0;
    }
  };

  return new Map(MILESTONES.map((m) => [m.id, computeCurrent(m)]));
}
