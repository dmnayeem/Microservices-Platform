import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { getPointsPerUsd } from "@/lib/economy";
import { getEffectivePackage } from "@/lib/packages";
import { getUserDayContext } from "@/lib/user-day";
import { notifyUser } from "@/lib/notify";
import { TransactionType, NotificationType } from "@/generated/prisma";

/**
 * Referral-signup bonus system (feature #9). Rewards a referrer when the person
 * they invited does things — instantly on signup, on buying a package, and a
 * month-end bonus if the invitee stayed active all month. Anti-farming: the
 * referrer only earns these while THEY themselves stay active (complete their
 * own daily mission) and meet a package-tier requirement. All amounts are
 * admin-configurable via SystemSetting `referral_bonus_config`.
 */
export interface ReferralBonusConfig {
  enabled: boolean;
  /** Instant points when a referred user registers. */
  signupPoints: number;
  /** Points when a referred user buys any package/subscription. */
  subscriptionPoints: number;
  /** Month-end points if the referred user completed daily missions enough days. */
  monthlyPoints: number;
  /** Referrer must be on a package with accessLevel ≥ this to earn bonuses. */
  minReferrerAccessLevel: number;
  /** Anti-farm: referrer must have completed their own daily mission today. */
  requireReferrerDailyMission: boolean;
  /** Distinct mission-days the referred user needs in the month for the monthly bonus. */
  monthlyMinMissionDays: number;
}

const KEY = "referral_bonus_config";

export const REFERRAL_BONUS_DEFAULTS: ReferralBonusConfig = {
  enabled: false,
  signupPoints: 0,
  subscriptionPoints: 0,
  monthlyPoints: 0,
  minReferrerAccessLevel: 0,
  requireReferrerDailyMission: true,
  monthlyMinMissionDays: 20,
};

export async function getReferralBonusConfig(): Promise<ReferralBonusConfig> {
  try {
    const raw = await getSetting<Partial<ReferralBonusConfig> | null>(KEY, null);
    return { ...REFERRAL_BONUS_DEFAULTS, ...(raw ?? {}) };
  } catch {
    return REFERRAL_BONUS_DEFAULTS;
  }
}

/** Did the referrer complete a daily mission today (their local day)? */
async function referrerActiveToday(referrerId: string): Promise<boolean> {
  try {
    const { startOfDayUtc } = await getUserDayContext(referrerId);
    const n = await prisma.dailyMissionClaim.count({
      where: { userId: referrerId, claimedAt: { gte: startOfDayUtc } },
    });
    return n > 0;
  } catch {
    return false;
  }
}

/** Does the referrer currently qualify to earn referral bonuses? */
async function referrerQualifies(
  referrerId: string,
  cfg: ReferralBonusConfig
): Promise<boolean> {
  const pkg = await getEffectivePackage(referrerId).catch(() => null);
  if ((pkg?.accessLevel ?? 0) < cfg.minReferrerAccessLevel) return false;
  if (cfg.requireReferrerDailyMission && !(await referrerActiveToday(referrerId))) {
    return false;
  }
  return true;
}

/** Shared credit path: idempotent via the ledger `reference`, writes a
 *  ReferralEarning row, and notifies the referrer. Best-effort — never throws. */
async function awardBonus(opts: {
  referrerId: string;
  referredUserId: string;
  points: number;
  reference: string;
  sourceType: "SIGNUP" | "SUBSCRIPTION" | "MONTHLY_BONUS";
  description: string;
  notifyTitle: string;
  notifyMessage: string;
}): Promise<boolean> {
  if (opts.points <= 0) return false;
  try {
    const pointsPerUsd = await getPointsPerUsd();
    const usd = pointsPerUsd > 0 ? opts.points / pointsPerUsd : 0;
    await prisma.$transaction(async (tx) => {
      await creditPoints(tx, {
        userId: opts.referrerId,
        points: opts.points,
        type: TransactionType.REFERRAL,
        description: opts.description,
        reference: opts.reference,
        metadata: {
          referredUserId: opts.referredUserId,
          referralBonus: opts.sourceType,
        },
        pointsPerUsd,
      });
      await tx.referralEarning.create({
        data: {
          userId: opts.referrerId,
          referredUserId: opts.referredUserId,
          level: 1,
          amount: usd,
          // Enum extended with SIGNUP / MONTHLY_BONUS in the DB.
          sourceType: opts.sourceType as never,
        },
      });
    });
    await notifyUser({
      userId: opts.referrerId,
      type: NotificationType.REFERRAL,
      title: opts.notifyTitle,
      message: opts.notifyMessage,
      link: "/referrals",
    }).catch(() => {});
    return true;
  } catch (err) {
    // A duplicate reference means we already paid this bonus — fine.
    if (isDuplicateLedgerError(err)) return false;
    console.error("referral bonus failed:", err);
    return false;
  }
}

/** Instant bonus when a referred user signs up. Call after registration. */
export async function awardReferralSignupBonus(
  referredUserId: string
): Promise<void> {
  const cfg = await getReferralBonusConfig();
  if (!cfg.enabled || cfg.signupPoints <= 0) return;
  const referred = await prisma.user
    .findUnique({
      where: { id: referredUserId },
      select: { referredById: true },
    })
    .catch(() => null);
  if (!referred?.referredById) return;
  if (!(await referrerQualifies(referred.referredById, cfg))) return;
  await awardBonus({
    referrerId: referred.referredById,
    referredUserId,
    points: cfg.signupPoints,
    reference: `refbonus_signup_${referredUserId}`,
    sourceType: "SIGNUP",
    description: "Referral signup bonus",
    notifyTitle: "Referral bonus!",
    notifyMessage: `You earned ${cfg.signupPoints} points for inviting a new member.`,
  });
}

/** Bonus when a referred user buys a package/subscription. */
export async function awardReferralSubscriptionBonus(
  referredUserId: string,
  sourceRef: string
): Promise<void> {
  const cfg = await getReferralBonusConfig();
  if (!cfg.enabled || cfg.subscriptionPoints <= 0) return;
  const referred = await prisma.user
    .findUnique({
      where: { id: referredUserId },
      select: { referredById: true },
    })
    .catch(() => null);
  if (!referred?.referredById) return;
  if (!(await referrerQualifies(referred.referredById, cfg))) return;
  await awardBonus({
    referrerId: referred.referredById,
    referredUserId,
    points: cfg.subscriptionPoints,
    reference: `refbonus_sub_${sourceRef}`,
    sourceType: "SUBSCRIPTION",
    description: "Referral subscription bonus",
    notifyTitle: "Referral bonus!",
    notifyMessage: `Your invitee upgraded — you earned ${cfg.subscriptionPoints} points.`,
  });
}

/**
 * Month-end sweep: for each referred user who completed daily missions on at
 * least `monthlyMinMissionDays` distinct days in the given month, pay the
 * referrer (if the referrer still qualifies). Idempotent per (referrer,
 * referredUser, month). `monthKey` = "YYYY-MM".
 */
export async function runMonthlyReferralBonuses(
  monthStart: Date,
  monthEnd: Date,
  monthKey: string
): Promise<{ paid: number; points: number }> {
  const cfg = await getReferralBonusConfig();
  if (!cfg.enabled || cfg.monthlyPoints <= 0) return { paid: 0, points: 0 };

  // All referred users who were active in the window (had ≥1 mission claim).
  const claims = (await prisma.dailyMissionClaim.groupBy({
    by: ["userId"],
    where: { claimedAt: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  })) as unknown as { userId: string }[];

  let paid = 0;
  let points = 0;
  for (const c of claims) {
    // Count DISTINCT days this user completed a mission (date is YYYY-MM-DD).
    const days = await prisma.dailyMissionClaim.findMany({
      where: { userId: c.userId, claimedAt: { gte: monthStart, lt: monthEnd } },
      select: { date: true },
      distinct: ["date"],
    });
    if (days.length < cfg.monthlyMinMissionDays) continue;

    const referred = await prisma.user.findUnique({
      where: { id: c.userId },
      select: { referredById: true },
    });
    if (!referred?.referredById) continue;
    if (!(await referrerQualifies(referred.referredById, cfg))) continue;

    const ok = await awardBonus({
      referrerId: referred.referredById,
      referredUserId: c.userId,
      points: cfg.monthlyPoints,
      reference: `refbonus_month_${c.userId}_${monthKey}`,
      sourceType: "MONTHLY_BONUS",
      description: `Referral monthly bonus (${monthKey})`,
      notifyTitle: "Monthly referral bonus!",
      notifyMessage: `An invitee stayed active all month — you earned ${cfg.monthlyPoints} points.`,
    });
    if (ok) {
      paid += 1;
      points += cfg.monthlyPoints;
    }
  }
  return { paid, points };
}

/** Convenience for the monthly cron: sweep the just-ended calendar month. */
export async function runPreviousMonthReferralBonuses(): Promise<{
  paid: number;
  points: number;
}> {
  const now = new Date();
  const thisMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const prevMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const monthKey = `${prevMonthStart.getUTCFullYear()}-${String(
    prevMonthStart.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  return runMonthlyReferralBonuses(prevMonthStart, thisMonthStart, monthKey);
}
