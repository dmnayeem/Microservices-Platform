import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJsonParse } from "@/lib/safe-json";

// GET /api/lottery/my-tickets - Get user's lottery ticket history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status"); // "active", "won", "lost"
    const skip = (page - 1) * limit;

    // Build query based on status filter
    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (status === "won") {
      where.isWinner = true;
    } else if (status === "lost") {
      where.isWinner = false;
      where.lottery = { status: "COMPLETED" };
    } else if (status === "active") {
      where.lottery = { status: { in: ["UPCOMING", "ACTIVE"] } };
    }

    // Get tickets
    const [tickets, total] = await Promise.all([
      prisma.lotteryTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.lotteryTicket.count({ where }),
    ]);

    // Get lottery info for tickets
    const lotteryIds = [...new Set(tickets.map((t) => t.lotteryId))];
    const lotteries = await prisma.lottery.findMany({
      where: { id: { in: lotteryIds } },
      select: {
        id: true,
        title: true,
        drawDate: true,
        status: true,
        winningNumbers: true,
      },
    });
    const lotteryMap = new Map(lotteries.map((l) => [l.id, l]));

    // Get summary stats
    const [totalWon, totalWinnings] = await Promise.all([
      prisma.lotteryTicket.count({
        where: { userId: session.user.id, isWinner: true },
      }),
      prisma.lotteryTicket.aggregate({
        where: { userId: session.user.id, isWinner: true },
        _sum: { prizeAmount: true },
      }),
    ]);

    const summary = {
      totalTickets: total,
      totalWon,
      totalWinnings: totalWinnings._sum.prizeAmount || 0,
    };

    // Get total spent on lottery
    const totalSpent = await prisma.transaction.aggregate({
      where: {
        userId: session.user.id,
        type: "PURCHASE",
        description: { contains: "lottery" },
      },
      _sum: { points: true },
    });

    return NextResponse.json({
      tickets: tickets.map((t) => {
        const lottery = lotteryMap.get(t.lotteryId);
        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          numbers: safeJsonParse<number[] | null>(t.numbers, null),
          isWinner: t.isWinner,
          prizeAmount: t.prizeAmount,
          purchasedAt: t.createdAt,
          lottery: lottery
            ? {
                id: lottery.id,
                title: lottery.title,
                drawDate: lottery.drawDate,
                status: lottery.status,
                winningNumbers: safeJsonParse<number[] | null>(
                  lottery.winningNumbers,
                  null
                ),
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        ...summary,
        totalSpent: Math.abs(totalSpent._sum.points || 0),
        netProfit: summary.totalWinnings - Math.abs(totalSpent._sum.points || 0),
      },
    });
  } catch (error) {
    console.error("Error fetching user lottery tickets:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}
