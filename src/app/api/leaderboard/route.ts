import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeCombinedTopUsers,
  computeCombinedUserRank,
  getEligiblePackages,
  taskEarningsFor,
  topTaskEarners,
} from "@/lib/leaderboard";
import { NON_STAFF_WHERE, isStaffRole } from "@/lib/staff";
import { leaderboardDisabled } from "@/lib/leaderboard-gate";

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
//
// Staff are left out of the count as well: it sits directly under a board they
// no longer appear on, so counting them would say "40 competing" over a list of
// 29 people who actually compete.
const cachedTotalParticipants = unstable_cache(
  async () => prisma.user.count({ where: NON_STAFF_WHERE }),
  ["leaderboard-total-participants"],
  { revalidate: 60 }
);

// GET /api/leaderboard - Get leaderboard data
export async function GET(request: NextRequest) {
  try {
    // The feature switch, before anything is computed or served. Hiding the
    // page is not turning the board off — this endpoint answers any saved
    // request, from a bookmarked fetch to the mobile shell.
    const off = await leaderboardDisabled();
    if (off) return off;

    const session = await auth();
    // Super-admin page visibility: refuse when /leaderboard is hidden for this user.
    const pageHidden = await assertPageVisible(session?.user?.id, "/leaderboard");
    if (pageHidden) return pageHidden;

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
      // A staff viewer is not on the board, so there is no rank to report. The
      // fallback below would otherwise hand them "501" — a position on a list
      // they were deliberately left off.
      if (session?.user?.id && !isStaffRole(session.user.role)) {
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
          // Reuse the CACHED 500-pool rather than recomputing the pipeline
          // per viewer. Same cache entry the board itself is built from.
          const pool = await cachedCombinedTop(500, eligiblePackages);
          const computed = await computeCombinedUserRank(session.user.id, pool);
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
      // Earnings FROM TASKS, ranked by the sum itself. This board used to order
      // by `totalEarnings`, which a marketplace sale also increments — two
      // accounts trading the same item back and forth both climbed, for the
      // price of the platform fee per lap. `topTaskEarners` is the same basis
      // the prize-paying reset uses, so the board and the payout agree.
      const earners = await topTaskEarners(limit);
      const usersRaw = await prisma.user.findMany({
        where: { id: { in: earners.map((e) => e.userId) }, ...NON_STAFF_WHERE },
        // SHARED board, polled every 30s by every viewer. 60s of staleness on a
        // leaderboard is invisible; nobody transacts on it.
        cacheStrategy: { ttl: 60, swr: 300 },
        select: {
          id: true,
          name: true,
          avatar: true,
          level: true,
          package: { select: { slug: true, name: true } },
        },
      });
      const users = usersRaw as unknown as LBUser[];
      const byId = new Map(users.map((u) => [u.id, u]));

      leaderboard = earners.flatMap((e, idx) => {
        const u = byId.get(e.userId);
        if (!u) return [];
        return [
          {
            rank: idx + 1,
            userId: u.id,
            name: u.name || "Anonymous",
            avatar: u.avatar,
            level: u.level,
            packageTier: u.package?.slug ?? "default",
            value: e.points,
          },
        ];
      });
    } else if (type === "xp") {
      const usersRaw = await prisma.user.findMany({
        where: NON_STAFF_WHERE,
        orderBy: { xp: "desc" },
        take: limit,
        cacheStrategy: { ttl: 60, swr: 300 },
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
        where: NON_STAFF_WHERE,
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
        where: NON_STAFF_WHERE,
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

    // Get current user's rank if authenticated — same rule as the combined
    // board above: staff are off the board, so they get no rank line.
    let currentUserRank = null;
    if (session?.user?.id && !isStaffRole(session.user.role)) {
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
            xp: true,
          },
        });

        if (user) {
          let userValue = 0;
          if (type === "points") {
            // Same basis as the board above — task earnings, not `totalEarnings`.
            userValue =
              (await taskEarningsFor([session.user.id])).get(session.user.id) ??
              0;
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
