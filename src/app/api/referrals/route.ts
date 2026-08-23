import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";

// GET /api/referrals - Get user's referral dashboard data
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Get user with referral code
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        referralCode: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get referral settings (commission rates)
    const referralLevels = await prisma.referralLevel.findMany({
      where: { isActive: true },
      orderBy: { level: "asc" },
    });

    // Default rates if not configured
    const commissionRates = referralLevels.length > 0
      ? referralLevels.reduce((acc, lvl) => {
          // Store commission value with type indicator
          if (lvl.commissionType === "PERCENTAGE") {
            acc[lvl.level] = lvl.commissionValue;
          } else {
            // For flat rate, store as negative to differentiate (temporary workaround)
            acc[lvl.level] = -lvl.commissionValue;
          }
          return acc;
        }, {} as Record<number, number>)
      : { 1: 10, 2: 5, 3: 2 };

    // This month's boundary (used by the earnings aggregate below).
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Collect the downline id-chains. We only need ids to (a) build the
    // parent-id filters for the lower levels and (b) count each level — the
    // full user records for the visible page are fetched with DB pagination
    // below instead of loading the entire downline into memory.
    const level1IdRows = await prisma.user.findMany({
      // ACTIVE only, matching what the daily referral claim actually pays for.
      // Showing a count the payout doesn't honour reads as being short-changed.
      where: { referredById: session.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    const level1Ids = level1IdRows.map((r) => r.id);

    const level2IdRows = await prisma.user.findMany({
      where: { referredById: { in: level1Ids } },
      select: { id: true },
    });
    const level2Ids = level2IdRows.map((r) => r.id);

    const level1Count = level1Ids.length;
    const level2Count = level2Ids.length;
    const level3Count = await prisma.user.count({
      where: { referredById: { in: level2Ids } },
    });
    const totalReferrals = level1Count + level2Count + level3Count;

    // Earnings by level — aggregate in the DB (was: load all earnings + reduce
    // in JS). groupBy gives both the per-level sum and count in one query.
    const earningsGrouped = (await prisma.referralEarning.groupBy({
      by: ["level"],
      where: { userId: session.user.id },
      _sum: { amount: true },
      _count: { _all: true },
    })) as unknown as {
      level: number;
      _sum: { amount: number | null };
      _count: { _all: number };
    }[];
    const earningsByLevel: Record<number, { amount: number; count: number }> = {};
    let totalEarningsAmount = 0;
    for (const g of earningsGrouped) {
      const amount = toNum(g._sum.amount);
      earningsByLevel[g.level] = { amount, count: g._count._all };
      totalEarningsAmount += amount;
    }

    const monthEarningsAgg = await prisma.referralEarning.aggregate({
      where: { userId: session.user.id, createdAt: { gte: monthStart } },
      _sum: { amount: true },
    });
    const monthEarningsAmount = toNum(monthEarningsAgg._sum.amount);

    // Get recent referral activities
    const recentActivities = await prisma.referralEarning.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        level: true,
        amount: true,
        sourceType: true,
        createdAt: true,
      },
    });

    // Downline list for the requested level — paginated in the DB rather than
    // fetching the whole downline and .slice()-ing.
    const level1Where: Prisma.UserWhereInput = {
      referredById: session.user.id,
      status: "ACTIVE",
    };
    const level2Where: Prisma.UserWhereInput = {
      referredById: { in: level1Ids },
      status: "ACTIVE",
    };
    const level3Where: Prisma.UserWhereInput = {
      referredById: { in: level2Ids },
    };

    const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const fetchAndMap = async (
      where: Prisma.UserWhereInput,
      tag: number,
      s: number,
      t: number
    ) => {
      const rows = await prisma.user.findMany({
        where,
        skip: s,
        take: t,
        select: {
          id: true,
          name: true,
          avatar: true,
          createdAt: true,
          level: true,
          lastLoginAt: true,
        },
      });
      // Per-member earnings = the commission THIS referrer earned from that
      // downline member (ReferralEarning.referredUserId), NOT the member's own
      // balance (which would leak a downline user's private earnings). Bounded
      // to just the page's rows.
      const ids = rows.map((r) => r.id);
      const commByMember = new Map<string, number>();
      if (ids.length > 0) {
        const grouped = (await prisma.referralEarning.groupBy({
          by: ["referredUserId"],
          where: { userId: session.user.id, referredUserId: { in: ids } },
          _sum: { amount: true },
        })) as unknown as {
          referredUserId: string;
          _sum: { amount: number | null };
        }[];
        for (const g of grouped)
          commByMember.set(g.referredUserId, toNum(g._sum.amount));
      }
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatar: r.avatar,
        joinedAt: r.createdAt,
        level: tag,
        userLevel: r.level,
        // Aligns with the client `ReferralUser` shape (earnings + isActive).
        earnings: commByMember.get(r.id) ?? 0,
        isActive: r.lastLoginAt
          ? nowMs - new Date(r.lastLoginAt).getTime() < ACTIVE_WINDOW_MS
          : false,
      }));
    };

    let referrals: Awaited<ReturnType<typeof fetchAndMap>> = [];
    let totalForPagination: number;

    if (level === "all") {
      // Reproduce the L1→L2→L3 concatenation, but fetch only the rows that
      // fall inside the requested [skip, skip+limit) window per segment.
      totalForPagination = totalReferrals;
      const segments = [
        { where: level1Where, size: level1Count, tag: 1 },
        { where: level2Where, size: level2Count, tag: 2 },
        { where: level3Where, size: level3Count, tag: 3 },
      ];
      let offset = 0;
      for (const seg of segments) {
        const localStart = Math.max(0, skip - offset);
        const localEnd = Math.min(seg.size, skip + limit - offset);
        if (localEnd > localStart) {
          const part = await fetchAndMap(
            seg.where,
            seg.tag,
            localStart,
            localEnd - localStart
          );
          referrals.push(...part);
        }
        offset += seg.size;
      }
    } else {
      let where: Prisma.UserWhereInput;
      let tag: number;
      if (level === "2") {
        where = level2Where;
        tag = 2;
        totalForPagination = level2Count;
      } else if (level === "3") {
        where = level3Where;
        tag = 3;
        totalForPagination = level3Count;
      } else {
        where = level1Where;
        tag = 1;
        totalForPagination = level1Count;
      }
      referrals = await fetchAndMap(where, tag, skip, limit);
    }

    return NextResponse.json({
      referralCode: user.referralCode,
      referralLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app"}/register?ref=${user.referralCode}`,
      commissionRates,
      stats: {
        totalReferrals,
        level1Count,
        level2Count,
        level3Count,
        totalEarnings: totalEarningsAmount,
        monthEarnings: monthEarningsAmount,
        earningsByLevel,
      },
      referrals,
      pagination: {
        page,
        limit,
        total: totalForPagination,
        totalPages: Math.ceil(totalForPagination / limit),
      },
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        level: a.level,
        amount: toNum(a.amount),
        sourceType: a.sourceType,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    return NextResponse.json(
      { error: "Failed to fetch referrals" },
      { status: 500 }
    );
  }
}
