import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ReferralsView,
  type ReferralUser,
} from "@/components/user/referrals/referrals-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

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
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app"}/register?ref=${code}`;

  // Build the 3-level team.
  //
  // Two different jobs, so two different queries per level: the TREE WALK only
  // needs ids (a user with 5,000 invitees used to load 5,000 full rows, and then
  // their invitees, and theirs), while the DISPLAY list is capped — nobody
  // scrolls a 25,000-row table. Counts stay exact via count().
  const ID_CAP = 5_000; // walk ceiling per level; beyond this the count is a floor
  const SHOW = 100; // rows rendered per level

  const l1Ids = (
    await prisma.user.findMany({
      // ACTIVE only — the same population the daily claim pays for.
      where: { referredById: userId, status: "ACTIVE" },
      select: { id: true },
      take: ID_CAP,
    })
  ).map((u) => u.id);

  const l2Ids = l1Ids.length
    ? (
        await prisma.user.findMany({
          where: { referredById: { in: l1Ids } },
          select: { id: true },
          take: ID_CAP,
        })
      ).map((u) => u.id)
    : [];

  const TEAM_SELECT = {
    id: true,
    name: true,
    avatar: true,
    createdAt: true,
    lastLoginAt: true,
  } as const;

  const [l1, l2, l3, l1Total, l2Total, l3Total] = await Promise.all([
    prisma.user.findMany({
      where: { referredById: userId, status: "ACTIVE" },
      select: TEAM_SELECT,
      orderBy: { createdAt: "desc" },
      take: SHOW,
    }),
    l1Ids.length
      ? prisma.user.findMany({
          where: { referredById: { in: l1Ids } },
          select: TEAM_SELECT,
          orderBy: { createdAt: "desc" },
          take: SHOW,
        })
      : Promise.resolve([]),
    l2Ids.length
      ? prisma.user.findMany({
          where: { referredById: { in: l2Ids } },
          select: TEAM_SELECT,
          orderBy: { createdAt: "desc" },
          take: SHOW,
        })
      : Promise.resolve([]),
    prisma.user.count({ where: { referredById: userId, status: "ACTIVE" } }),
    l1Ids.length
      ? prisma.user.count({
          where: { referredById: { in: l1Ids }, status: "ACTIVE" },
        })
      : Promise.resolve(0),
    l2Ids.length
      ? prisma.user.count({ where: { referredById: { in: l2Ids } } })
      : Promise.resolve(0),
  ]);

  // Earnings via ReferralEarning + this-month total.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [allEarnings, thisMonthEarnings] = await Promise.all([
    prisma.referralEarning.findMany({
      where: { userId },
      select: { level: true, amount: true, referredUserId: true },
    }),
    prisma.referralEarning.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  const earningsByUser = new Map<string, number>();
  let l1Earned = 0;
  let l2Earned = 0;
  let l3Earned = 0;
  for (const e of allEarnings) {
    const amt = Number(e.amount ?? 0);
    if (e.level === 1) l1Earned += amt;
    else if (e.level === 2) l2Earned += amt;
    else if (e.level === 3) l3Earned += amt;
    earningsByUser.set(
      e.referredUserId,
      (earningsByUser.get(e.referredUserId) ?? 0) + amt
    );
  }

  const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const isActive = (lastLogin: Date | null) =>
    lastLogin ? nowMs - new Date(lastLogin).getTime() < ACTIVE_WINDOW_MS : false;

  const buildTeam = (
    rows: typeof l1,
    level: 1 | 2 | 3
  ): ReferralUser[] =>
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      level,
      joinedAt: u.createdAt.toISOString(),
      earnings: earningsByUser.get(u.id) ?? 0,
      isActive: isActive(u.lastLoginAt),
    }));

  const team: ReferralUser[] = [
    ...buildTeam(l1, 1),
    ...buildTeam(l2, 2),
    ...buildTeam(l3, 3),
  ];

  return (
    <>
      <AdRenderer placement="REFERRALS_TOP" className="mb-4" />
      <ReferralsView
      referralCode={code}
      shareUrl={shareUrl}
      l1Count={l1Total}
      l2Count={l2Total}
      l3Count={l3Total}
      l1Earned={l1Earned}
      l2Earned={l2Earned}
      l3Earned={l3Earned}
      thisMonthEarned={Number(thisMonthEarnings._sum.amount ?? 0)}
      team={team}
      />
    </>
  );
}
