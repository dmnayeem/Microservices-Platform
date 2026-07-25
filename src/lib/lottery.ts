import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export interface LotteryWinner {
  position: number;
  ticketId: string;
  userId: string;
  amount: number;
}

export type DrawResult =
  | { ok: true; winners: LotteryWinner[] }
  | { ok: false; reason: "not_found" | "not_active" | "no_tickets" | "no_prizes" };

/**
 * Draw an ACTIVE lottery: shuffle its tickets, award each prize position to a
 * distinct ticket (crediting the holder's points + a win notification), then
 * mark the lottery COMPLETED with the winners snapshot. Idempotent by status —
 * a COMPLETED/non-active lottery returns `not_active` and is left untouched, so
 * both the admin "draw" action and the auto-draw cron can call this safely.
 */
export async function drawLottery(lotteryId: string): Promise<DrawResult> {
  const lottery = await prisma.lottery.findUnique({
    where: { id: lotteryId },
    include: { tickets: true },
  });
  if (!lottery) return { ok: false, reason: "not_found" };
  if (lottery.status !== "ACTIVE") return { ok: false, reason: "not_active" };
  if (lottery.tickets.length === 0) return { ok: false, reason: "no_tickets" };

  // `prizes` is a Json column; guard against a malformed/non-array value so the
  // mapping loop below (outside the payout try/catch) can't throw on bad data.
  const prizes = (
    Array.isArray(lottery.prizes) ? lottery.prizes : []
  ) as {
    position: number;
    amount: number;
    description: string;
  }[];
  if (prizes.length === 0) return { ok: false, reason: "no_prizes" };
  const tickets = lottery.tickets;

  // Cryptographically-fair Fisher-Yates shuffle (never Math.random for real money).
  const order = [...tickets];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }

  const winners: LotteryWinner[] = [];
  for (let i = 0; i < Math.min(prizes.length, order.length); i++) {
    const ticket = order[i];
    winners.push({
      position: prizes[i].position,
      ticketId: ticket.id,
      userId: ticket.userId,
      amount: prizes[i].amount,
    });
  }

  // Draw ONCE: a CAS on status inside the transaction means only the first
  // caller (admin button OR auto-draw cron) actually pays out — the loser
  // matches 0 rows and aborts, so winners are never double-credited.
  try {
    const drawn = await prisma.$transaction(async (tx) => {
      const claim = await tx.lottery.updateMany({
        where: { id: lotteryId, status: "ACTIVE" },
        data: { status: "COMPLETED", winners: winners as unknown as object },
      });
      if (claim.count === 0) return false;

      for (let i = 0; i < winners.length; i++) {
        const w = winners[i];
        await tx.lotteryTicket.update({
          where: { id: w.ticketId },
          data: { isWinner: true, prizeAmount: w.amount },
        });
        await tx.user.update({
          where: { id: w.userId },
          data: { pointsBalance: { increment: w.amount } },
        });
        await tx.notification.create({
          data: {
            userId: w.userId,
            type: "LOTTERY",
            title: `You Won ${prizes[i].description}!`,
            message: `Congratulations! You won ${w.amount.toLocaleString()} points in the "${lottery.title}" lottery!`,
            data: { lotteryId, position: w.position, prizeAmount: w.amount },
          },
        });
      }
      return true;
    });
    if (!drawn) return { ok: false, reason: "not_active" };
  } catch {
    return { ok: false, reason: "not_active" };
  }

  return { ok: true, winners };
}
