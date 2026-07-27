import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeCombinedTopUsers,
  computeCombinedUserRank,
  getEligiblePackages,
} from "@/lib/leaderboard";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

// The combined board is identical for every viewer — cache it for 60s so the
// expensive 500-user pipeline runs at most once per minute (was per request).
const cachedCombinedTop = unstable_cache(
  async (limit: number, eligiblePackages: string[]) =>
    computeCombinedTopUsers({ limit, eligiblePackages }),
  ["leaderboard-combined"],
  { revalidate: 60 }
);

// A full-table user COUNT is brutal at 10M rows; the participant total is
// display-only and barely changes minute-to-minute — cache it for 60s.
const cachedTotalParticipants = unstable_cache(
  async () => prisma.user.count(),
  ["leaderboard-total-participants"],
  { revalidate: 60 }
);

// GET /api/leaderboard - Get leaderboard data
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "combined"; // combined | points | xp | tasks | referrals
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Combined mode — single mixed-metric leaderboard with eligibility.
    if (type === "combined") {
      const eligiblePackages = await getEligiblePackages();
      const top = await cachedCombinedTop(limit, eligiblePackages);
      let currentUser: {
        rank: number | string;
        score: number;
        components: { points: number; xp: number; tasks: number; team: number };
        isEligible: boolean;
        packageSlug: string;
        isInTop: boolean;
      } | null = null;
      if (session?.user?.id) {
        const inTopIdx = top.findIndex((r) => r.userId === session.user.id);
        if (inTopIdx !== -1) {
          const me = top[inTopIdx];
          currentUser = {
            rank: me.rank,
            score: me.score,
            components: me.components,
            isEligible: me.isEligible,
            packageSlug: me.packageSlug,
            isInTop: true,
          };
        } else {
          const computed = await computeCombinedUserRank(session.user.id);
          if (computed) {
            currentUser = {
              rank: computed.rank > 500 ? "500+" : computed.rank,
              score: computed.score,
              components: computed.components,
              isEligible: computed.isEligible,
              packageSlug: computed.packageSlug,
              isInTop: false,
            };
          }
        }
      }
      const totalParticipants = await cachedTotalParticipants();
      return NextResponse.json({
        leaderboard: top,
        eligiblePackages,
        currentUser,
        metadata: {
          type,
          limit,
          totalParticipants,
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    const pointsPerUsd = await getPointsPerUsd();

    let leaderboard: Array<{
      rank: number;
      userId: string;
      name: string | null;
      avatar: string | null;
      level: number;
      packageTier: string;
      value: number;
    }> = [];

    type LBUser = {
      id: string;
      name: string | null;
      avatar: string | null;
      level: number;
      package: { slug: string; name: string } | null;
    };

    if (type === "points") {
      const usersRaw = await prisma.user.findMany({
        orderBy: { totalEarnings: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          avatar: true,
          level: true,
          package: { select: { slug: true, name: true } },
          totalEarnings: true,
        },
      });
      const users = usersRaw as unknown as Array<LBUser & { totalEarnings: number }>;

      leaderboard = users.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name || "Anonymous",
        avatar: u.avatar,
        level: u.level,
        packageTier: u.package?.slug ?? "default",
        value: Math.round(toNum(u.totalEarnings) * pointsPerUsd),
      }));
    } else if (type === "xp") {
      const usersRaw = await prisma.user.findMany({
        orderBy: { xp: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          avatar: true,
          level: true,
          package: { select: { slug: true, name: true } },
          xp: true,
        },
      });
      const users = usersRaw as unknown as Array<LBUser & { xp: number }>;

      leaderboard = users.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name || "Anonymous",
        avatar: u.avatar,
        level: u.level,
        packageTier: u.package?.slug ?? "default",
        value: u.xp,
      }));
    } else if (type === "referrals") {
      const usersRaw = await prisma.user.findMany({
        orderBy: {
          referrals: { _count: "desc" },
        },
        take: limit,
        select: {
          id: true,
          name: true,
          avatar: true,
          level: true,
          package: { select: { slug: true, name: true } },
        },
      });
      const users = usersRaw as unknown as LBUser[];

      // One groupBy instead of N per-user counts (referral downline sizes).
      const ids = users.map((u) => u.id);
      const grouped = (await prisma.user.groupBy({
        by: ["referredById"],
        where: { referredById: { in: ids } },
        _count: { _all: true },
      })) as unknown as Array<{
        referredById: string | null;
        _count: { _all: number };
      }>;
      const countByReferrer = new Map(
        grouped.map((g) => [g.referredById, g._count._all])
      );

      leaderboard = users.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name || "Anonymous",
        avatar: u.avatar,
        level: u.level,
        packageTier: u.package?.slug ?? "default",
        value: countByReferrer.get(u.id) ?? 0,
      }));
    } else if (type === "tasks") {
      const usersRaw = await prisma.user.findMany({
        orderBy: {
          taskSubmissions: { _count: "desc" },
        },
        take: limit,
        select: {
          id: true,
          name: true,
          avatar: true,
          level: true,
          package: { select: { slug: true, name: true } },
        },
      });
      const users = usersRaw as unknown as LBUser[];

      // One groupBy instead of N per-user counts on the big TaskSubmission table.
      const ids = users.map((u) => u.id);
      const grouped = (await prisma.taskSubmission.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
        _count: { _all: true },
      })) as unknown as Array<{ userId: string; _count: { _all: number } }>;
      const countByUser = new Map(
        grouped.map((g) => [g.userId, g._count._all])
      );

      leaderboard = users.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name || "Anonymous",
        avatar: u.avatar,
        level: u.level,
        packageTier: u.package?.slug ?? "default",
        value: countByUser.get(u.id) ?? 0,
      }));
    }

    // Get current user's rank if authenticated
    let currentUserRank = null;
    if (session?.user?.id) {
      const userIndex = leaderboard.findIndex(
        (entry) => entry.userId === session.user.id
      );

      if (userIndex !== -1) {
        currentUserRank = {
          rank: userIndex + 1,
          value: leaderboard[userIndex].value,
          isInTop: userIndex < limit,
        };
      } else {
        // User not in top N, get their stats
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            totalEarnings: true,
            xp: true,
          },
        });

        if (user) {
          let userValue = 0;
          if (type === "points") {
            userValue = Math.round(toNum(user.totalEarnings) * pointsPerUsd);
          } else if (type === "xp") {
            userValue = user.xp;
          } else if (type === "referrals") {
            userValue = await prisma.user.count({
              where: { referredById: session.user.id },
            });
          } else if (type === "tasks") {
            userValue = await prisma.taskSubmission.count({
              where: {
                userId: session.user.id,
                status: { in: ["APPROVED", "AUTO_APPROVED"] },
              },
            });
          }

          currentUserRank = {
            rank: "50+",
            value: userValue,
            isInTop: false,
          };
        }
      }
    }

    // Get leaderboard metadata
    const totalParticipants = await cachedTotalParticipants();

    return NextResponse.json({
      leaderboard,
      metadata: {
        type,
        limit,
        totalParticipants,
        lastUpdated: new Date().toISOString(),
      },
      currentUser: currentUserRank,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
