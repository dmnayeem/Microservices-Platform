import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";

/**
 * A user's referral team, level by level, using the levels the ADMIN set
 * (/admin/referrals/settings → `ReferralLevel`) — the same rows
 * `referral-commissions.ts` pays from.
 *
 * My Team and the wallet used to print 10% / 5% / 2% from the code and stop at
 * level 3, so whatever the admin configured never showed, and levels 4–10
 * were invisible even while they paid.
 *
 * Cost: one levels read, one recursive query for the whole tree (counts, and
 * member rows when asked), one grouped sum of earnings — however deep the team.
 */

export interface TeamLevel {
  level: number;
  /** "10%" of what the member earns, or "$0.05" per task. */
  rateLabel: string;
  count: number;
  /** Commission earned from this level, USD. */
  earnedUsd: number;
}

export interface TeamMember {
  id: string;
  name: string | null;
  avatar: string | null;
  level: number;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface TeamSummary {
  levels: TeamLevel[];
  totalCount: number;
  totalEarnedUsd: number;
  /** Newest first, at most `membersPerLevel` per level (only when asked). */
  members: TeamMember[];
}

/** The active commission levels, as the commission code reads them. */
export async function getCommissionLevels(): Promise<Array<{ level: number; rateLabel: string }>> {
  const rows = await prisma.referralLevel.findMany({
    where: { isActive: true },
    orderBy: { level: "asc" },
    select: { level: true, commissionType: true, commissionValue: true },
  });
  // No rows = the commission code's own default (L1 10%).
  const levels = rows.length ? rows : [{ level: 1, commissionType: "PERCENTAGE", commissionValue: 10 }];
  return levels
    .filter((l) => l.level >= 1 && l.level <= 10)
    .map((l) => ({
      level: l.level,
      rateLabel:
        l.commissionType === "FLAT_RATE"
          ? usd(Number(l.commissionValue))
          : `${Number(l.commissionValue)}%`,
    }));
}

export async function getTeamSummary(userId: string, opts: { membersPerLevel?: number } = {}): Promise<TeamSummary> {
  const levels = await getCommissionLevels();
  const depth = Math.max(1, ...levels.map((l) => l.level));
  const perLevel = opts.membersPerLevel ?? 0;

  const [tree, earned] = await Promise.all([
    // The whole tree to `depth` in one statement. Everyone is walked (the
    // commission walk ignores status too); only ACTIVE accounts are counted
    // and listed.
    prisma.$queryRaw<
      Array<{ id: string | null; level: number; n: number; name: string | null; avatar: string | null; createdAt: Date | null; lastLoginAt: Date | null }>
    >`
      WITH RECURSIVE team AS (
        SELECT u.id, 1 AS lvl FROM "User" u WHERE u."referredById" = ${userId}
        UNION ALL
        SELECT u.id, t.lvl + 1 FROM "User" u JOIN team t ON u."referredById" = t.id
        WHERE t.lvl < ${depth}
      ),
      live AS (
        SELECT u.id, t.lvl, u.name, u.avatar, u."createdAt", u."lastLoginAt",
               ROW_NUMBER() OVER (PARTITION BY t.lvl ORDER BY u."createdAt" DESC) AS rn,
               COUNT(*) OVER (PARTITION BY t.lvl) AS n
        FROM team t JOIN "User" u ON u.id = t.id
        WHERE u.status = 'ACTIVE' AND u.id <> ${userId}
      )
      SELECT CASE WHEN rn <= ${perLevel} THEN id END AS id, lvl AS level, n::int AS n,
             name, avatar, "createdAt", "lastLoginAt"
      FROM live WHERE rn <= GREATEST(${perLevel}, 1)
      ORDER BY lvl, rn`,
    prisma.referralEarning.groupBy({
      by: ["level"],
      where: { userId },
      _sum: { amount: true },
    }) as unknown as Promise<Array<{ level: number; _sum: { amount: Prisma.Decimal | null } }>>,
  ]);

  const countBy = new Map<number, number>();
  const members: TeamMember[] = [];
  for (const r of tree) {
    countBy.set(r.level, r.n);
    if (r.id && r.createdAt) {
      members.push({ id: r.id, name: r.name, avatar: r.avatar, level: r.level, createdAt: r.createdAt, lastLoginAt: r.lastLoginAt });
    }
  }
  const earnedBy = new Map(earned.map((e) => [e.level, toNum(e._sum.amount)]));

  const out = levels.map((l) => ({
    level: l.level,
    rateLabel: l.rateLabel,
    count: countBy.get(l.level) ?? 0,
    earnedUsd: earnedBy.get(l.level) ?? 0,
  }));
  return {
    levels: out,
    totalCount: out.reduce((a, l) => a + l.count, 0),
    // Every level ever paid, including one the admin has since switched off.
    totalEarnedUsd: [...earnedBy.values()].reduce((a, v) => a + v, 0),
    members,
  };
}
