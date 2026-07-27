import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { LotteryStatus, TransactionType, TransactionStatus, NotificationType } from "@/generated/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { safeJsonParse } from "@/lib/safe-json";

// GET /api/lottery - Get available lotteries and user's tickets
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as LotteryStatus | null;
    const includeEnded = searchParams.get("includeEnded") === "true";

    // Build query
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    } else if (!includeEnded) {
      // By default, show upcoming and active lotteries
      where.status = { in: [LotteryStatus.UPCOMING, LotteryStatus.ACTIVE] };
    }

    // Get lotteries
    const lotteries = await prisma.lottery.findMany({
      where,
      orderBy: { drawDate: "asc" },
    });

    // Get ticket counts for each lottery
    const ticketCounts = await Promise.all(
      lotteries.map((l) =>
        prisma.lotteryTicket.count({ where: { lotteryId: l.id } })
      )
    );
    const ticketCountMap = new Map(
      lotteries.map((l, idx) => [l.id, ticketCounts[idx]])
    );

    // Get user's tickets if authenticated
    const userTickets: Record<string, { count: number; tickets: string[] }> = {};

    if (session?.user?.id) {
      const tickets = await prisma.lotteryTicket.findMany({
        where: {
          userId: session.user.id,
          lotteryId: { in: lotteries.map((l) => l.id) },
        },
        select: {
          lotteryId: true,
          ticketNumber: true,
          numbers: true,
          isWinner: true,
          prizeAmount: true,
        },
      });

      tickets.forEach((ticket) => {
        if (!userTickets[ticket.lotteryId]) {
          userTickets[ticket.lotteryId] = { count: 0, tickets: [] };
        }
        userTickets[ticket.lotteryId].count++;
        userTickets[ticket.lotteryId].tickets.push(ticket.ticketNumber);
      });
    }

    // Format lotteries for frontend
    const formattedLotteries = lotteries.map((lottery) => {
      const prizes = lottery.prizes as Array<{
        position: number;
        amount: number;
        count: number;
      }>;

      const totalPrizePool = prizes.reduce(
        (sum, p) => sum + p.amount * (p.count || 1),
        0
      );

      return {
        id: lottery.id,
        title: lottery.title,
        description: lottery.description,
        startDate: lottery.startDate,
        endDate: lottery.endDate,
        drawDate: lottery.drawDate,
        ticketPrice: lottery.ticketPrice,
        maxTickets: lottery.maxTickets,
        ticketsSold: ticketCountMap.get(lottery.id) || 0,
        maxTicketsPerUser: lottery.maxTicketsPerUser,
        status: lottery.status,
        prizes,
        totalPrizePool,
        userTickets: userTickets[lottery.id] || { count: 0, tickets: [] },
        canBuyTicket:
          lottery.status === LotteryStatus.ACTIVE &&
          (!lottery.maxTickets || (ticketCountMap.get(lottery.id) || 0) < lottery.maxTickets),
        timeUntilDraw: Math.max(
          0,
          new Date(lottery.drawDate).getTime() - Date.now()
        ),
        winningNumbers: lottery.winningNumbers,
        winners:
          lottery.status === LotteryStatus.COMPLETED ? lottery.winners : null,
      };
    });

    // Get recent winners across all lotteries
    const recentWinnerTickets = await prisma.lotteryTicket.findMany({
      where: { isWinner: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Get user and lottery info for winners
    const winnerUserIds = [...new Set(recentWinnerTickets.map((w) => w.userId))];
    const winnerLotteryIds = [...new Set(recentWinnerTickets.map((w) => w.lotteryId))];

    const [winnerUsers, winnerLotteries] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: winnerUserIds } },
        select: { id: true, name: true, avatar: true },
      }),
      prisma.lottery.findMany({
        where: { id: { in: winnerLotteryIds } },
        select: { id: true, title: true },
      }),
    ]);

    const winnerUserMap = new Map(winnerUsers.map((u) => [u.id, u]));
    const winnerLotteryMap = new Map(winnerLotteries.map((l) => [l.id, l]));

    return NextResponse.json({
      lotteries: formattedLotteries,
      recentWinners: recentWinnerTickets.map((w) => ({
        userName: winnerUserMap.get(w.userId)?.name || "Anonymous",
        userAvatar: winnerUserMap.get(w.userId)?.avatar || null,
        lotteryTitle: winnerLotteryMap.get(w.lotteryId)?.title || "Unknown",
        prizeAmount: w.prizeAmount,
        ticketNumber: w.ticketNumber,
      })),
    });
  } catch (error) {
    console.error("Error fetching lotteries:", error);
    return NextResponse.json(
      { error: "Failed to fetch lotteries" },
      { status: 500 }
    );
  }
}

// POST /api/lottery - Buy lottery tickets
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
  try {
    const body = await request.json();
    const { lotteryId, quantity, selectedNumbers } = body;

    // Validate quantity
    const ticketCount = quantity || 1;
    if (ticketCount < 1 || ticketCount > 10) {
      return NextResponse.json(
        { error: "You can buy 1-10 tickets at a time" },
        { status: 400 }
      );
    }

    // Get lottery
    const lottery = await prisma.lottery.findUnique({
      where: { id: lotteryId },
    });

    // Get current ticket count
    const currentTicketCount = lottery
      ? await prisma.lotteryTicket.count({ where: { lotteryId } })
      : 0;

    if (!lottery) {
      return NextResponse.json(
        { error: "Lottery not found" },
        { status: 404 }
      );
    }

    // Check lottery is active
    if (lottery.status !== LotteryStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This lottery is not currently active" },
        { status: 400 }
      );
    }

    // Check if lottery has ended
    if (new Date() > lottery.endDate) {
      return NextResponse.json(
        { error: "This lottery has ended" },
        { status: 400 }
      );
    }

    // Check ticket availability
    if (lottery.maxTickets && currentTicketCount + ticketCount > lottery.maxTickets) {
      return NextResponse.json(
        { error: "Not enough tickets available" },
        { status: 400 }
      );
    }

    // Check user's ticket limit for this lottery
    const userTicketCount = await prisma.lotteryTicket.count({
      where: {
        lotteryId,
        userId: session.user.id,
      },
    });

    if (userTicketCount + ticketCount > lottery.maxTicketsPerUser) {
      return NextResponse.json(
        {
          error: `You can only buy ${lottery.maxTicketsPerUser} tickets for this lottery. You already have ${userTicketCount}.`,
        },
        { status: 400 }
      );
    }

    // Calculate total cost
    const totalCost = lottery.ticketPrice * ticketCount;

    // Get user balance
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pointsBalance: true },
    });

    if (!user || user.pointsBalance < totalCost) {
      return NextResponse.json(
        { error: "Insufficient points balance" },
        { status: 400 }
      );
    }

    const pointsPerUsd = await getPointsPerUsd();

    // Generate tickets
    const tickets = [];
    for (let i = 0; i < ticketCount; i++) {
      const ticketNumber = generateTicketNumber(lottery.id, currentTicketCount + i + 1);
      const numbers = selectedNumbers?.[i] || generateRandomNumbers();

      tickets.push({
        lotteryId,
        userId: session.user.id,
        ticketNumber,
        numbers: JSON.stringify(numbers),
      });
    }

    // Create tickets and deduct points in transaction
    const [_createdTickets] = await prisma.$transaction([
      prisma.lotteryTicket.createMany({
        data: tickets,
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { pointsBalance: { decrement: totalCost } },
      }),
      prisma.lottery.update({
        where: { id: lotteryId },
        data: { ticketsSold: { increment: ticketCount } },
      }),
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          points: -totalCost,
          amount: -totalCost / pointsPerUsd,
          description: `Purchased ${ticketCount} lottery ticket(s) for "${lottery.title}"`,
          reference: `lottery_${lotteryId}_${Date.now()}`,
          metadata: {
            lotteryId,
            ticketCount,
            ticketNumbers: tickets.map((t) => t.ticketNumber),
          },
        },
      }),
    ]);

    // Create notification
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: NotificationType.SYSTEM,
        title: "Lottery Tickets Purchased",
        message: `You bought ${ticketCount} ticket(s) for "${lottery.title}". Good luck!`,
        data: {
          lotteryId,
          ticketCount,
          totalCost,
        },
      },
    });

    return NextResponse.json({
      message: `Successfully purchased ${ticketCount} ticket(s)`,
      tickets: tickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        numbers: safeJsonParse<number[]>(t.numbers, []),
      })),
      totalCost,
      newBalance: user.pointsBalance - totalCost,
    });
  } catch (error) {
    console.error("Error buying lottery tickets:", error);
    return NextResponse.json(
      { error: "Failed to purchase tickets" },
      { status: 500 }
    );
  }
  });
}

// Helper function to generate ticket number
function generateTicketNumber(lotteryId: string, sequence: number): string {
  const prefix = lotteryId.slice(-4).toUpperCase();
  const paddedSequence = sequence.toString().padStart(6, "0");
  return `${prefix}-${paddedSequence}`;
}

// Helper function to generate random lottery numbers (6 numbers from 1-49)
function generateRandomNumbers(): number[] {
  const numbers: number[] = [];
  while (numbers.length < 6) {
    const num = Math.floor(Math.random() * 49) + 1;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers.sort((a, b) => a - b);
}
