import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { LotteryStatus, TransactionType, TransactionStatus, NotificationType } from "@/generated/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { recordUserAction } from "@/lib/goal-progress";
import {
  computePool,
  parsePrizeTiers,
  parseFixedPrizes,
} from "@/lib/lottery-prizes";

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

    // Ticket counts for every lottery in ONE grouped query (was one count per
    // lottery). Served by @@index([lotteryId, userId]).
    const ticketGroups = (await prisma.lotteryTicket.groupBy({
      by: ["lotteryId"],
      where: { lotteryId: { in: lotteries.map((l) => l.id) } },
      _count: { _all: true },
    })) as unknown as { lotteryId: string; _count: { _all: number } }[];
    const ticketCountMap = new Map<string, number>(
      lotteries.map((l) => [l.id, 0])
    );
    for (const g of ticketGroups) ticketCountMap.set(g.lotteryId, g._count._all);

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

    // Rollover targets, so a POOL lottery can name where its pot would go.
    const rolloverIds = [
      ...new Set(lotteries.map((l) => l.rolloverTargetId).filter(Boolean) as string[]),
    ];
    const rolloverTargets = rolloverIds.length
      ? await prisma.lottery.findMany({
          where: { id: { in: rolloverIds } },
          select: { id: true, title: true },
        })
      : [];
    const rolloverTitle = new Map(rolloverTargets.map((r) => [r.id, r.title]));

    // Format lotteries for frontend
    const formattedLotteries = lotteries.map((lottery) => {
      const sold = ticketCountMap.get(lottery.id) || 0;
      const isPool = lottery.prizeMode === "POOL";

      // FIXED: the prize list IS the pot. POOL: the pot is derived from sales,
      // so it grows as tickets sell and `prizes` is irrelevant. Branching on
      // mode matters — reading `prizeTiers` percentages through the old
      // `reduce(sum, p.amount)` would render "50" as 50 points.
      const prizes = parseFixedPrizes(lottery.prizes);
      const tiers = isPool ? parsePrizeTiers(lottery.prizeTiers) : [];
      const pool = computePool({
        ticketsSold: sold,
        ticketPrice: lottery.ticketPrice,
        houseCutPercent: lottery.houseCutPercent,
        seedPoints: lottery.poolSeedPoints,
        rolloverInPoints: lottery.rolloverInPoints,
        poolCapPoints: lottery.poolCapPoints,
      });

      const totalPrizePool = isPool
        ? pool.pool
        : prizes.reduce((sum, p) => sum + p.amount, 0);

      return {
        id: lottery.id,
        title: lottery.title,
        description: lottery.description,
        startDate: lottery.startDate,
        endDate: lottery.endDate,
        drawDate: lottery.drawDate,
        ticketPrice: lottery.ticketPrice,
        maxTickets: lottery.maxTickets,
        ticketsSold: sold,
        maxTicketsPerUser: lottery.maxTicketsPerUser,
        status: lottery.status,
        prizeMode: lottery.prizeMode,
        prizes,
        prizeTiers: tiers,
        totalPrizePool,
        // What the pot can never drop below, so "grows with every ticket"
        // doesn't read as "might be nothing".
        guaranteedFloor: isPool
          ? lottery.poolSeedPoints + lottery.rolloverInPoints
          : totalPrizePool,
        // Disclosed BEFORE purchase — under ROLLOVER the ticket money is not
        // returned, and a user who only finds that out afterwards is right to
        // call it a scam.
        minTickets: lottery.minTickets,
        shortfallAction: lottery.shortfallAction,
        rolloverTargetTitle: lottery.rolloverTargetId
          ? rolloverTitle.get(lottery.rolloverTargetId) ?? null
          : null,
        userTickets: userTickets[lottery.id] || { count: 0, tickets: [] },
        canBuyTicket:
          lottery.status === LotteryStatus.ACTIVE &&
          (!lottery.maxTickets || sold < lottery.maxTickets),
        timeUntilDraw: Math.max(
          0,
          new Date(lottery.drawDate).getTime() - Date.now()
        ),
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

  const userId = session.user.id;

  return withIdempotency(request, userId, async () => {
  try {
    const body = await request.json();
    // `selectedNumbers` is no longer read — LotteryTicket.numbers was generated
    // and stored but the draw is a shuffle over tickets and never looked at it.
    const { lotteryId, quantity } = body;

    // Validate quantity
    const ticketCount = quantity || 1;
    if (ticketCount < 1 || ticketCount > 10) {
      return NextResponse.json(
        { error: "You can buy 1-10 tickets at a time" },
        { status: 400 }
      );
    }

    const pointsPerUsd = await getPointsPerUsd();

    /**
     * Everything below runs INSIDE one interactive transaction that opens by
     * locking the lottery row.
     *
     * Every guard — status, end date, `maxTickets`, the per-user cap and the
     * balance check — used to sit outside an array-form `$transaction`, so two
     * concurrent buys could both pass and both commit: balances could go
     * negative and both caps could be exceeded. With POOL prizes it also let a
     * ticket land *after* a draw had already snapshotted the pot, which is
     * money out of the platform for a ticket that was never counted.
     *
     * The lock is the same one `drawLottery` takes, so a purchase and a draw
     * can never interleave.
     */
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Lottery" WHERE id = ${lotteryId} FOR UPDATE`;

        const lottery = await tx.lottery.findUnique({ where: { id: lotteryId } });
        if (!lottery) return { ok: false as const, error: "Lottery not found", status: 404 };

        if (lottery.status !== LotteryStatus.ACTIVE) {
          return { ok: false as const, error: "This lottery is not currently active", status: 400 };
        }
        if (new Date() > lottery.endDate) {
          return { ok: false as const, error: "This lottery has ended", status: 400 };
        }

        // Counted inside the lock, so the numbers can't move underneath us.
        const [soldTotal, userTicketCount, user] = await Promise.all([
          tx.lotteryTicket.count({ where: { lotteryId } }),
          tx.lotteryTicket.count({ where: { lotteryId, userId } }),
          tx.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }),
        ]);

        if (lottery.maxTickets && soldTotal + ticketCount > lottery.maxTickets) {
          const left = Math.max(0, lottery.maxTickets - soldTotal);
          return {
            ok: false as const,
            error:
              left === 0
                ? "This lottery has sold out."
                : `Only ${left} ticket${left === 1 ? "" : "s"} left.`,
            status: 400,
          };
        }
        if (userTicketCount + ticketCount > lottery.maxTicketsPerUser) {
          return {
            ok: false as const,
            error: `You can only buy ${lottery.maxTicketsPerUser} tickets for this lottery. You already have ${userTicketCount}.`,
            status: 400,
          };
        }

        const totalCost = lottery.ticketPrice * ticketCount;
        if (!user || user.pointsBalance < totalCost) {
          return { ok: false as const, error: "Insufficient points balance", status: 400 };
        }

        // Ticket numbers are sequential from the in-lock count, so the
        // `@@unique([lotteryId, ticketNumber])` index can no longer collide
        // between concurrent buyers (which previously surfaced as a bare 500).
        const tickets = Array.from({ length: ticketCount }, (_, i) => ({
          lotteryId,
          userId,
          ticketNumber: generateTicketNumber(lottery.id, soldTotal + i + 1),
        }));

        await tx.lotteryTicket.createMany({ data: tickets });
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { pointsBalance: { decrement: totalCost } },
          select: { pointsBalance: true },
        });
        await tx.lottery.update({
          where: { id: lotteryId },
          data: { ticketsSold: { increment: ticketCount } },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.PURCHASE,
            status: TransactionStatus.COMPLETED,
            points: -totalCost,
            amount: -totalCost / pointsPerUsd,
            description: `Purchased ${ticketCount} lottery ticket(s) for "${lottery.title}"`,
            // Keyed to the FIRST ticket number, which is unique per lottery.
            // The old `_${Date.now()}` suffix made every reference unique and
            // therefore gave the ledger's @@unique([userId, reference]) nothing
            // to catch a replay on.
            reference: `lottery_${lotteryId}_${tickets[0].ticketNumber}`,
            metadata: {
              lotteryId,
              ticketCount,
              ticketNumbers: tickets.map((t) => t.ticketNumber),
            },
          },
        });

        return {
          ok: true as const,
          error: null,
          status: 200,
          tickets,
          totalCost,
          title: lottery.title,
          newBalance: updatedUser.pointsBalance,
        };
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { tickets, totalCost, newBalance } = result;
    const lottery = { title: result.title };

    // Event progress — AFTER the purchase commits, so a failed or rolled-back
    // purchase never counts. Deliberately outside the transaction above: a
    // duplicate-key error from the event log must not abort someone's payment.
    // Ticket numbers are unique per lottery, so the first one is a stable key.
    await recordUserAction({
      userId: session.user.id,
      action: "lottery_ticket",
      targetId: `${lotteryId}:${tickets[0].ticketNumber}`,
      units: ticketCount,
    });

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
      tickets: tickets.map((t) => ({ ticketNumber: t.ticketNumber })),
      totalCost,
      // Read back from the update inside the transaction, so it reflects any
      // concurrent change rather than a stale pre-purchase read minus the cost.
      newBalance,
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

