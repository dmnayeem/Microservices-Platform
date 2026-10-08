import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getReferralBonusConfig } from "@/lib/referral-bonus";
import { getAffiliateConfig } from "@/lib/affiliate";
import { getPwaRewardConfig } from "@/lib/pwa-install";
import { getBrowseEarnConfig } from "@/lib/browse-earn";
import { getRewardedConfig } from "@/lib/ads-rewarded";
import { getSocialEarningConfig } from "@/lib/social-earning";
import { getMilestones } from "@/lib/milestones";
import {
  DAILY_REWARD_KEY,
  SOLO_REWARD_KEY,
  normaliseDailyRewardConfig,
  normaliseSoloRewardConfig,
} from "@/lib/reward-config";

/**
 * Admin → Bonus Center: every AUTOMATIC points/cash bonus on one screen —
 * whether it is on, what it pays, what it actually paid in the last 30 days,
 * and a link to the one place it is edited. Tasks, daily missions, boards,
 * quizzes, games, lottery, leaderboards and offerwalls are deliberately not
 * here (they have their own consoles).
 *
 * Read-only on purpose except the welcome bonus (which had no admin control
 * at all): every other bonus keeps its single existing editor, so there are
 * never two screens writing the same setting.
 */

export const WELCOME_BONUS_KEY = "bonus.welcome_points";

/** Admin value when saved, else the old WELCOME_BONUS_POINTS env, else 0. */
export async function getWelcomeBonusPoints(): Promise<number> {
  const env = parseInt(process.env.WELCOME_BONUS_POINTS || "0", 10);
  const v = await getSetting<number | null>(WELCOME_BONUS_KEY, null).catch(() => null);
  const n = typeof v === "number" ? v : Number.isFinite(env) ? env : 0;
  return Math.max(0, Math.floor(n));
}

export type BonusStatus = "on" | "off" | "partial";

export interface BonusItem {
  id: string;
  name: string;
  /** When it is paid. */
  trigger: string;
  status: BonusStatus;
  /** What it pays right now, in words. */
  pays: string;
  /** "points" or "cash". */
  currency: "points" | "cash";
  editHref: string | null;
  editWhere: string;
  paid30: { count: number; points: number; cash: number };
}

export interface BonusGroup {
  id: string;
  label: string;
  items: BonusItem[];
}

const pts = (n: number) => `${Math.round(n).toLocaleString()} pts`;
const onOff = (b: boolean): BonusStatus => (b ? "on" : "off");

/** Ledger totals per bonus for the last 30 days, keyed by the bonus id. */
async function paidLast30(): Promise<Map<string, { count: number; points: number; cash: number }>> {
  const out = new Map<string, { count: number; points: number; cash: number }>();
  try {
    // `Transaction` signs are not consistent across write sites, so ABS().
    // Classified by each bonus's deterministic ledger reference / type.
    const rows = await prisma.$queryRaw<{ k: string | null; n: number; pts: number; cash: number }[]>`
      SELECT CASE
          WHEN reference LIKE 'welcome\\_%' THEN 'welcome'
          WHEN reference LIKE 'refbonus\\_%' THEN 'referral_bonus'
          WHEN reference LIKE 'daily\\_referral\\_%' THEN 'daily_referral'
          WHEN reference LIKE 'daily\\_mission\\_%' THEN NULL
          WHEN reference LIKE 'referral\\_%' AND type = 'REFERRAL' THEN 'commission'
          WHEN type = 'AFFILIATE_COMMISSION' THEN 'affiliate'
          WHEN reference LIKE 'pwa\\_install\\_%' THEN 'pwa'
          WHEN reference LIKE 'daily\\_%' OR reference LIKE 'mystery\\_%' THEN 'daily'
          WHEN reference LIKE 'solo\\_%' THEN 'solo'
          WHEN reference LIKE 'milestone\\_%' THEN 'milestones'
          WHEN reference LIKE 'achievement\\_%' THEN 'achievements'
          WHEN reference LIKE 'event\\_%' THEN 'events'
          WHEN reference LIKE 'social\\_%' THEN 'social'
          WHEN reference LIKE 'browse\\_%' THEN 'browse'
          WHEN reference LIKE 'adreward\\_%' THEN 'rewarded'
        END AS k,
        COUNT(*)::int AS n,
        COALESCE(SUM(ABS(points)), 0)::float8 AS pts,
        COALESCE(SUM(ABS(amount)), 0)::float8 AS cash
      FROM "Transaction"
      WHERE "createdAt" >= now() - interval '30 days'
        AND (reference IS NOT NULL OR type = 'AFFILIATE_COMMISSION')
      GROUP BY 1`;
    for (const r of rows) {
      if (r.k) out.set(r.k, { count: Number(r.n), points: Number(r.pts), cash: Number(r.cash) });
    }
  } catch (e) {
    console.error("[bonus-center] totals failed:", e);
  }
  return out;
}

export async function getBonusOverview(): Promise<BonusGroup[]> {
  const [
    paid,
    welcome,
    ref,
    aff,
    pwa,
    browse,
    rewarded,
    social,
    milestones,
    dailyRaw,
    soloRaw,
    levels,
    packages,
    achievements,
    events,
  ] = await Promise.all([
    paidLast30(),
    getWelcomeBonusPoints(),
    getReferralBonusConfig(),
    getAffiliateConfig(),
    getPwaRewardConfig(),
    getBrowseEarnConfig(),
    getRewardedConfig(),
    getSocialEarningConfig(),
    getMilestones(),
    getSetting<unknown>(DAILY_REWARD_KEY, null),
    getSetting<unknown>(SOLO_REWARD_KEY, null),
    prisma.referralLevel.findMany({
      where: { isActive: true },
      orderBy: { level: "asc" },
      select: { level: true, commissionType: true, commissionValue: true },
    }),
    prisma.package.findMany({ select: { name: true, dailyReferralPoints: true } }),
    prisma.achievement.findMany({ where: { isActive: true }, select: { pointsReward: true } }),
    prisma.event.count({
      where: {
        isActive: true,
        endAt: { gt: new Date() },
      },
    }),
  ]);

  const p = (id: string) => paid.get(id) ?? { count: 0, points: 0, cash: 0 };
  const daily = normaliseDailyRewardConfig(dailyRaw);
  const solo = normaliseSoloRewardConfig(soloRaw);

  const refParts = [
    ref.signupEnabled && ref.signupPoints > 0 && `referrer ${pts(ref.signupPoints)} per signup`,
    ref.inviteeEnabled && ref.inviteePoints > 0 && `new user ${pts(ref.inviteePoints)}`,
    ref.subscriptionEnabled && ref.subscriptionPoints > 0 && `${pts(ref.subscriptionPoints)} on a plan purchase`,
    ref.purchaseEnabled && ref.purchasePoints > 0 && `${pts(ref.purchasePoints)} on a first purchase`,
    ref.depositEnabled && ref.depositPercent > 0 && `${ref.depositPercent}% of deposits`,
    ref.withdrawalEnabled && ref.withdrawalPercent > 0 && `${ref.withdrawalPercent}% of withdrawals`,
    ref.milestonesEnabled && ref.milestones.length > 0 && `${ref.milestones.length} milestone step(s)`,
    ref.monthlyEnabled && ref.monthlyPoints > 0 && `${pts(ref.monthlyPoints)} monthly activity`,
  ].filter(Boolean) as string[];

  const commissionText =
    levels.length === 0
      ? "Level 1: 10% (default — no levels set)"
      : levels
          .slice(0, 4)
          .map((l) => `L${l.level}: ${l.commissionType === "PERCENTAGE" ? `${l.commissionValue}%` : pts(l.commissionValue)}`)
          .join(" · ") + (levels.length > 4 ? ` · +${levels.length - 4} more` : "");

  const dailyRefValues = [...new Set(packages.map((x) => Number(x.dailyReferralPoints)))].sort((a, b) => a - b);
  const msOn = milestones.filter((m) => m.enabled);
  const achPts = achievements.filter((a) => a.pointsReward > 0);

  return [
    {
      id: "join",
      label: "Joining & getting started",
      items: [
        {
          id: "welcome",
          name: "New user welcome bonus",
          trigger: "Once, when a new account is verified (email sign-up) or created with Google.",
          status: onOff(welcome > 0),
          pays: welcome > 0 ? pts(welcome) : "0 — off",
          currency: "points",
          editHref: null,
          editWhere: "Edit it here",
          paid30: p("welcome"),
        },
        {
          id: "pwa",
          name: "App install bonus",
          trigger: `Once, after the installed app is used and the account is ${pwa.minDays}+ day(s) old.`,
          status: onOff(pwa.enabled && pwa.points > 0),
          pays: pwa.enabled ? pts(pwa.points) : "Off",
          currency: "points",
          editHref: "/admin/users/app-installs",
          editWhere: "Users → App installs",
          paid30: p("pwa"),
        },
      ],
    },
    {
      id: "daily",
      label: "Every day",
      items: [
        {
          id: "daily",
          name: "Daily check-in streak",
          trigger: `Claimed once a day; a ${daily.days.length}-day ladder${daily.mysteryBoxEnabled ? " with a mystery box on the last day" : ""}.`,
          status: onOff(daily.days.some((d) => d.points > 0)),
          pays: daily.days.map((d) => d.points).join(" → ") + " pts",
          currency: "points",
          editHref: "/admin/gamification?tab=rewards",
          editWhere: "Levels & Achievements → Rewards",
          paid30: p("daily"),
        },
        {
          id: "solo",
          name: "Daily solo reward",
          trigger: `When a user gets ${solo.tasksToday} task(s) approved and earns $${solo.earningsToday} in one day.`,
          status: onOff(solo.points > 0),
          pays: `${pts(solo.points)} + ${solo.xp} XP`,
          currency: "points",
          editHref: "/admin/gamification?tab=rewards",
          editWhere: "Levels & Achievements → Rewards",
          paid30: p("solo"),
        },
        {
          id: "browse",
          name: "Browse & Earn",
          trigger: `Every ${browse.tickSeconds}s of viewing, up to ${pts(browse.dailyCap)} a day.`,
          status: onOff(browse.enabled && browse.pointsPerTick > 0),
          pays: browse.enabled ? `${pts(browse.pointsPerTick)} per ${browse.tickSeconds}s` : "Off",
          currency: "points",
          editHref: "/admin/monetization?tab=browse-earn",
          editWhere: "Monetization → Browse & Earn",
          paid30: p("browse"),
        },
        {
          id: "rewarded",
          name: "Watch ads (rewarded video)",
          trigger: `Watching a rewarded ad to the end, up to ${pts(rewarded.dailyCap)} a day.`,
          status: onOff(rewarded.enabled),
          pays: rewarded.enabled ? "Set per ad (Ads manager)" : "Off",
          currency: "points",
          editHref: "/admin/monetization",
          editWhere: "Monetization (switch) · Ads (points per ad)",
          paid30: p("rewarded"),
        },
        {
          id: "social",
          name: "Social / feed earning",
          trigger: "Posting, getting likes, comments, views, shares and votes on the feed.",
          status: onOff(social.enabled),
          pays: social.enabled ? "Per action (see feed settings)" : "Off",
          currency: "points",
          editHref: "/admin/settings/feed?tab=social-earning",
          editWhere: "Feed settings → Social earning",
          paid30: p("social"),
        },
      ],
    },
    {
      id: "referral",
      label: "Referrals & affiliates",
      items: [
        {
          id: "referral_bonus",
          name: "Referral bonuses",
          trigger: "Invite sign-up, invitee's plan / purchase / deposit, referral milestones and the monthly activity bonus.",
          status: !ref.enabled ? "off" : refParts.length ? "on" : "partial",
          pays: !ref.enabled ? "Off (master switch)" : refParts.length ? refParts.join(" · ") : "On, but every amount is 0",
          currency: "points",
          editHref: "/admin/referrals?tab=bonuses",
          editWhere: "Referrals → Bonuses",
          paid30: p("referral_bonus"),
        },
        {
          id: "daily_referral",
          name: "Daily referral claim",
          trigger: "Claimed once a day: points × the user's active referrals. Amount is set per plan.",
          status: onOff(dailyRefValues.some((v) => v > 0)),
          pays:
            dailyRefValues.length === 0
              ? "No plans"
              : `${dailyRefValues.join(" / ")} pts per active referral (by plan)`,
          currency: "points",
          editHref: "/admin/packages",
          editWhere: "Packages → each plan",
          paid30: p("daily_referral"),
        },
        {
          id: "commission",
          name: "Referral commission",
          trigger: "A share of what a user's referrals earn, up the referral levels their plan unlocks.",
          status: "on",
          pays: commissionText,
          currency: "points",
          editHref: "/admin/referrals?tab=commission",
          editWhere: "Referrals → Commission",
          paid30: p("commission"),
        },
        {
          id: "affiliate",
          name: "Affiliate commission",
          trigger: "A course or marketplace sale made through an affiliate's link. Rate set by each seller.",
          status: onOff(aff.enabled),
          pays: aff.enabled ? "Per product (set by the seller)" : "Off",
          currency: "cash",
          editHref: "/admin/affiliate",
          editWhere: "Affiliate",
          paid30: p("affiliate"),
        },
      ],
    },
    {
      id: "progress",
      label: "Progress & achievements",
      items: [
        {
          id: "milestones",
          name: "Milestones",
          trigger: "Reaching a goal: tasks done, streaks, earnings, posts, level 10/25, referrals, KYC, socials.",
          status: msOn.length ? (msOn.length === milestones.length ? "on" : "partial") : "off",
          pays: `${msOn.length} of ${milestones.length} on · ${pts(msOn.reduce((s, m) => s + m.pointsReward, 0))} in total`,
          currency: "points",
          editHref: "/admin/gamification?tab=milestones",
          editWhere: "Levels & Achievements → Milestones",
          paid30: p("milestones"),
        },
        {
          id: "achievements",
          name: "Achievements",
          trigger: "Unlocking an achievement badge.",
          status: onOff(achPts.length > 0),
          pays: `${achPts.length} of ${achievements.length} active pay points · ${pts(achPts.reduce((s, a) => s + a.pointsReward, 0))} in total`,
          currency: "points",
          editHref: "/admin/gamification?tab=levels",
          editWhere: "Levels & Achievements → Levels",
          paid30: p("achievements"),
        },
        {
          id: "events",
          name: "Events & quests",
          trigger: "Completing a running event or one of its reward tiers.",
          status: onOff(events > 0),
          pays: events > 0 ? `${events} event(s) running or upcoming` : "No events running",
          currency: "points",
          editHref: "/admin/events",
          editWhere: "Events",
          paid30: p("events"),
        },
      ],
    },
  ];
}
