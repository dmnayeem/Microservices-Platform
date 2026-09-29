import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ReferralsView,
  type ReferralUser,
} from "@/components/user/referrals/referrals-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { getTeamSummary } from "@/lib/team";
import {
  getReferralBonusConfig,
  qualifiedReferralCount,
  awardReferralMilestones,
} from "@/lib/referral-bonus";
import type { ReferralBonusInfo } from "@/components/user/referrals/referrals-view";

export const metadata = { title: "My Team" };

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, name: true },
  });
  if (!user) redirect("/login");

  const code =
    user.referralCode ?? `EARN${user.id.slice(0, 6).toUpperCase()}`;
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com"}/register?ref=${code}`;

  // Build the 3-level team.
  //
  // Two different jobs, so two different queries per level: the TREE WALK only
  // needs ids (a user with 5,000 invitees used to load 5,000 full rows, and then
  // their invitees, and theirs), while the DISPLAY list is capped — nobody
  // scrolls a 25,000-row table. Counts stay exact via count().
  // The team to the depth the admin configured (up to 10 levels), with each
  // level's rate — one recursive query instead of a walk per level.
  const SHOW = 100; // members listed per level
  const [summary, bonusCfg] = await Promise.all([
    getTeamSummary(userId, { membersPerLevel: SHOW }),
    getReferralBonusConfig(),
  ]);
  const memberIds = summary.members.map((m) => m.id);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  // Sums, not rows: this used to load every referral-earning row the user
  // ever had just to add them up.
  const [perMember, thisMonthEarnings] = await Promise.all([
    memberIds.length
      ? (prisma.referralEarning.groupBy({
          by: ["referredUserId"],
          where: { userId, referredUserId: { in: memberIds } },
          _sum: { amount: true },
        }) as unknown as Promise<Array<{ referredUserId: string; _sum: { amount: unknown } }>>)
      : Promise.resolve([]),
    prisma.referralEarning.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);
  const earningsByUser = new Map(perMember.map((e) => [e.referredUserId, Number(e._sum.amount ?? 0)]));

  const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  // eslint-disable-next-line react-hooks/purity -- async Server Component: runs once per request, never hydrated.
  const nowMs = Date.now();
  const team: ReferralUser[] = summary.members.map((u) => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    level: u.level,
    joinedAt: u.createdAt.toISOString(),
    earnings: earningsByUser.get(u.id) ?? 0,
    isActive: u.lastLoginAt ? nowMs - new Date(u.lastLoginAt).getTime() < ACTIVE_WINDOW_MS : false,
  }));

  // The bonuses the admin has switched on — only those, in plain words.
  const pts = (n: number) => `+${n.toLocaleString()} pts`;
  const on = bonusCfg.enabled;
  const perks: ReferralBonusInfo["perks"] = on
    ? [
        bonusCfg.signupEnabled && bonusCfg.signupPoints > 0 && { label: "A friend signs up", reward: pts(bonusCfg.signupPoints) },
        bonusCfg.inviteeEnabled && bonusCfg.inviteePoints > 0 && { label: "Your friend gets on joining", reward: pts(bonusCfg.inviteePoints) },
        bonusCfg.purchaseEnabled && bonusCfg.purchasePoints > 0 && { label: "A friend buys a plan", reward: pts(bonusCfg.purchasePoints) },
        bonusCfg.subscriptionEnabled && bonusCfg.subscriptionPoints > 0 && { label: "A friend subscribes", reward: pts(bonusCfg.subscriptionPoints) },
        bonusCfg.depositEnabled && bonusCfg.depositPercent > 0 && { label: "A friend adds funds", reward: `${bonusCfg.depositPercent}%` },
        bonusCfg.withdrawalEnabled && bonusCfg.withdrawalPercent > 0 && { label: "A friend withdraws", reward: `${bonusCfg.withdrawalPercent}%` },
        bonusCfg.monthlyEnabled && bonusCfg.monthlyPoints > 0 && { label: "A friend stays active all month", reward: pts(bonusCfg.monthlyPoints) },
      ].filter((x): x is { label: string; reward: string } => Boolean(x))
    : [];
  const ladder = on && bonusCfg.milestonesEnabled ? bonusCfg.milestones : [];
  const subIds = ladder.filter((m) => m.rewardType === "SUBSCRIPTION").map((m) => m.packageId);
  const [milestoneProgress, plans] = await Promise.all([
    ladder.length ? qualifiedReferralCount(userId, bonusCfg.milestoneActivity) : Promise.resolve(null),
    subIds.length
      ? prisma.package.findMany({ where: { id: { in: subIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  // Milestones are otherwise only checked when a NEW friend signs up — and a
  // new friend is never "active" yet, so a referrer whose existing friends
  // became active later was never paid a step the ladder below shows as
  // reached. Settle here, where they look at it. Idempotent per step.
  if (milestoneProgress != null && ladder.some((m) => milestoneProgress >= m.referrals)) {
    await awardReferralMilestones(userId).catch(() => 0);
  }
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const minDays = bonusCfg.milestoneActivity?.minActiveDays ?? 0;
  const bonuses: ReferralBonusInfo = {
    perks,
    milestones: ladder.map((m) => ({
      id: m.id,
      label: m.label || `${m.referrals} referrals`,
      referrals: m.referrals,
      reward:
        m.rewardType === "SUBSCRIPTION"
          ? `${m.months} month${m.months === 1 ? "" : "s"} ${planName.get(m.packageId) ?? "plan"}`
          : pts(m.points),
    })),
    milestoneProgress,
    activeRule: minDays > 0 ? `a friend counts once active on ${minDays} days in ${bonusCfg.milestoneActivity.windowDays}` : null,
  };

  return (
    <>
      <AdRenderer placement="REFERRALS_TOP" className="mb-4" />
      <ReferralsView
      referralCode={code}
      shareUrl={shareUrl}
      levels={summary.levels}
      totalEarned={summary.totalEarnedUsd}
      thisMonthEarned={Number(thisMonthEarnings._sum.amount ?? 0)}
      team={team}
      bonuses={bonuses}
      />
    </>
  );
}
