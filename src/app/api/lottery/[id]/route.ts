import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LotteryStatus } from "@/generated/prisma";
import { safeJsonParse } from "@/lib/safe-json";

// GET /api/lottery/:id - Get lottery details with user's tickets
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    // Get lottery with tickets count
    const lottery = await prisma.lottery.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!lottery) {
      return NextResponse.json(
        { error: "Lottery not found" },
        { status: 404 }
      );
    }

    // Get user's tickets if authenticated
    let userTickets: Array<{
      id: string;
      ticketNumber: string;
      numbers: number[] | null;
      isWinner: boolean;
      prizeAmount: number | null;
      createdAt: Date;
    }> = [];

    if (session?.user?.id) {
      const tickets = await prisma.lotteryTicket.findMany({
        where: {
          lotteryId: id,
          userId: session.user.id,
        },
        orderBy: { createdAt: "desc" },
      });

      userTickets = tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        numbers: safeJsonParse<number[] | null>(t.numbers, null),
        isWinner: t.isWinner,
        prizeAmount: t.prizeAmount,
        createdAt: t.createdAt,
      }));
    }

    // Parse prizes
    const prizes = lottery.prizes as Array<{
      position: number;
      amount: number;
      count: number;
    }>;

    const totalPrizePool = prizes.reduce(
      (sum, p) => sum + p.amount * (p.count || 1),
      0
    );

    // Parse winners if lottery is completed
    let winners = null;
    if (lottery.status === LotteryStatus.COMPLETED && lottery.winners) {
      winners = lottery.winners as Array<{
        position: number;
        ticketNumber: string;
        userId: string;
        userName: string;
        prizeAmount: number;
      }>;
    }

    // Calculate time remaining
    const now = Date.now();
    const drawTime = new Date(lottery.drawDate).getTime();
    const timeUntilDraw = Math.max(0, drawTime - now);

    return NextResponse.json({
      lottery: {
        id: lottery.id,
        title: lottery.title,
        description: lottery.description,
        startDate: lottery.startDate,
        endDate: lottery.endDate,
        drawDate: lottery.drawDate,
        ticketPrice: lottery.ticketPrice,
        maxTickets: lottery.maxTickets,
        ticketsSold: lottery._count.tickets,
        maxTicketsPerUser: lottery.maxTicketsPerUser,
        status: lottery.status,
        prizes,
        totalPrizePool,
        winningNumbers: safeJsonParse<number[] | null>(
          lottery.winningNumbers,
          null
        ),
        winners,
        timeUntilDraw,
        canBuyTicket:
          lottery.status === LotteryStatus.ACTIVE &&
          (!lottery.maxTickets || lottery._count.tickets < lottery.maxTickets),
      },
      userTickets,
      userTicketCount: userTickets.length,
      canBuyMore: session?.user?.id
        ? userTickets.length < lottery.maxTicketsPerUser
        : false,
      remainingSlots: session?.user?.id
        ? lottery.maxTicketsPerUser - userTickets.length
        : lottery.maxTicketsPerUser,
    });
  } catch (error) {
    console.error("Error fetching lottery:", error);
    return NextResponse.json(
      { error: "Failed to fetch lottery" },
      { status: 500 }
    );
  }
}
