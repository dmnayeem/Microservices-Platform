import { randomInt, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { creditPoints, type LedgerDb } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { getPointsPerUsd } from "@/lib/economy";
import { TransactionType } from "@/generated/prisma";
import {
  computePool,
  splitPool,
  effectiveTiers,
  parsePrizeTiers,
  parseFixedPrizes,
  fixedAwards,
  type PrizeAward,
} from "@/lib/lottery-prizes";

/**
 * The lottery draw and cancel paths — the only two places lottery money moves
 * out of the platform.
 *
 * ## Why one transaction, and what guards it
 *
 * Three things can start a draw at the same moment: the admin "Draw" button, an
 * Inngest `sleepUntil` scheduled at activation time, and the hourly sweep. Four
 * independent guards make a double payout impossible:
 *
 *  1. `SELECT … FOR UPDATE` serialises the three against each other AND against
 *     concurrent ticket purchases (POOL mode snapshots ticket sales, so a
 *     ticket landing mid-draw would be paid into a pot already computed);
 *  2. the `status = 'ACTIVE'` CAS — exactly one caller proceeds;
 *  3. `LotterySettlement.lotteryId @unique` — a second writer hits P2002 and the
 *     whole transaction rolls back;
 *  4. `Transaction @@unique([userId, reference])` on
 *     `lottery_win_{lotteryId}_{ticketId}` — even a hypothetical replay cannot
 *     credit twice.
 *
 * Prize arithmetic lives in src/lib/lottery-prizes.ts (pure, fuzz-tested).
 */

export interface LotteryWinner {
  position: number;
  ticketId: string;
  userId: string;
  amount: number;
  percent: number | null;
}

export type DrawOutcome =
  | "DRAWN"
  | "REFUNDED"
  | "ROLLED_OVER"
  | "VOID_NO_TICKETS";

export type DrawResult =
  | { ok: true; outcome: DrawOutcome; winners: LotteryWinner[] }
  | {
      ok: false;
      reason: "not_found" | "not_active" | "no_prizes" | "not_due" | "failed";
    };

/**
 * **Accelerate caps interactive transactions at 15 seconds.** Asking for more
 * is not clamped — it is rejected outright with P6005 before the transaction
 * even opens, so an over-long timeout means every draw fails.
 */
const TX_OPTS = { timeout: 15_000, maxWait: 10_000 } as const;

/**
 * Refunds are paid in chunks AFTER the status change commits, never inside the
 * transaction: a lottery with a few hundred tickets is thousands of round trips
 * and would blow the 15s ceiling, leaving the draw to roll back forever.
 *
 * This is safe because every credit carries the deterministic reference
 * `lottery_refund_{lotteryId}_{ticketId}` under `Transaction @@unique([userId,
 * reference])`. Re-running pays nothing twice, so an interrupted refund run is
 * finished simply by asking again.
 */
const REFUND_CHUNK = 25;

interface DrawOpts {
  /**
   * Refuse to draw before `drawDate`. The Inngest `sleepUntil` was scheduled
   * against the drawDate as it stood at activation time; once an admin can edit
   * a lottery, moving the draw LATER would otherwise fire the old timer early.
   */
  requireDue?: boolean;
}

/**
 * The transaction client type. Taken from the extended client (Accelerate adds
 * `cacheStrategy` to every model), not `Prisma.TransactionClient`, which describes the
 * unextended one and does not structurally match.
 */
type Tx = LedgerDb;

/** Ticket row shape the draw works with. */
interface TicketLite {
  id: string;
  userId: string;
}

export async function drawLottery(
  lotteryId: string,
  opts: DrawOpts = {}
): Promise<DrawResult> {
  const head = await prisma.lottery.findUnique({
    where: { id: lotteryId },
    select: { id: true, status: true, drawDate: true },
  });
  if (!head) return { ok: false, reason: "not_found" };
  if (head.status !== "ACTIVE") return { ok: false, reason: "not_active" };
  if (opts.requireDue && head.drawDate > new Date()) {
    return { ok: false, reason: "not_due" };
  }

  // Fetched before the transaction so the payout stays lean.
  const pointsPerUsd = await getPointsPerUsd();

  /**
   * Set by the shortfall branches. Refunds can't run inside the transaction —
   * hundreds of tickets would blow the 15s Accelerate ceiling and roll the
   * whole draw back — so the transaction records the outcome and this says what
   * still has to be paid once it commits.
   */
  let pendingRefund: "shortfall" | "rollover_unavailable" | null = null;

  try {
    const result: DrawResult = await prisma.$transaction(
      async (tx): Promise<DrawResult> => {
        // (0) Serialise against concurrent purchases and the other two triggers.
        await tx.$queryRaw`SELECT id FROM "Lottery" WHERE id = ${lotteryId} FOR UPDATE`;

        // (1) Claim the draw. Only one caller gets past this.
        const claim = await tx.lottery.updateMany({
          where: { id: lotteryId, status: "ACTIVE" },
          data: { status: "COMPLETED" },
        });
        if (claim.count === 0) {
          return { ok: false, reason: "not_active" } as const;
        }

        const l = await tx.lottery.findUniqueOrThrow({ where: { id: lotteryId } });
        const tickets: TicketLite[] = await tx.lotteryTicket.findMany({
          where: { lotteryId },
          select: { id: true, userId: true },
          orderBy: { id: "asc" },
        });
        const n = tickets.length;

        // (2) Nobody entered. TERMINAL — this used to return `no_tickets` and
        // leave the lottery ACTIVE, so the hourly sweep retried it forever.
        if (n === 0) return voidBranch(tx, l);

        // (3) Minimum-tickets floor. The refund branches only mark the outcome
        // here; the money is paid after commit (see `pendingRefund` below).
        if (l.minTickets > 0 && n < l.minTickets) {
          if (l.shortfallAction === "REFUND") {
            pendingRefund = "shortfall";
            return refundBranch(tx, l, tickets);
          }
          if (l.shortfallAction === "ROLLOVER") {
            const rolled = await rolloverBranch(tx, l, tickets);
            if (!rolled) {
              // No usable target — never strand user money in a dead chain.
              pendingRefund = "rollover_unavailable";
              return refundBranch(tx, l, tickets);
            }
            return rolled;
          }
          // DRAW → fall through and draw with whatever sold.
        }

        // (4) Normal draw.
        const { gross, houseCut, pool, overflow } = computePool({
          ticketsSold: n,
          ticketPrice: l.ticketPrice,
          houseCutPercent: l.houseCutPercent,
          seedPoints: l.poolSeedPoints,
          rolloverInPoints: l.rolloverInPoints,
          poolCapPoints: l.poolCapPoints,
        });

        const tiers =
          l.prizeMode === "POOL"
            ? effectiveTiers(parsePrizeTiers(l.prizeTiers), n)
            : [];
        const awards: PrizeAward[] =
          l.prizeMode === "POOL"
            ? splitPool(pool, tiers)
            : fixedAwards(parseFixedPrizes(l.prizes), n);

        if (awards.length === 0) {
          // No prizes configured at all — roll back the CAS so an admin can fix
          // the config and draw again, rather than silently completing.
          throw new NoPrizesError();
        }

        // A bad percent config must never mint points. Throwing rolls back the
        // status CAS too, so the lottery stays ACTIVE and drawable.
        const totalPaid = awards.reduce((s, a) => s + a.amount, 0);
        if (l.prizeMode === "POOL" && totalPaid > pool) {
          throw new Error(
            `PRIZE_OVERDRAW: ${totalPaid} > pool ${pool} on lottery ${lotteryId}`
          );
        }

        // Cryptographically-fair Fisher-Yates (never Math.random for money).
        const order = [...tickets];
        for (let i = order.length - 1; i > 0; i--) {
          const j = randomInt(0, i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }

        const winners: LotteryWinner[] = awards.map((a, i) => ({
          position: a.position,
          ticketId: order[i].id,
          userId: order[i].userId,
          amount: a.amount,
          percent: a.percent,
        }));

        for (const [i, w] of winners.entries()) {
          await tx.lotteryTicket.update({
            where: { id: w.ticketId },
            data: { isWinner: true, prizeAmount: w.amount },
          });
          // Via the ledger, so the win bumps totalEarnings AND appears in
          // history. The deterministic reference is the replay guard.
          await creditPoints(tx, {
            userId: w.userId,
            points: w.amount,
            type: TransactionType.LOTTERY_WIN,
            description: `Lottery win: ${l.title}`,
            reference: `lottery_win_${lotteryId}_${w.ticketId}`,
            metadata: { lotteryId, position: w.position },
            pointsPerUsd,
          });
          await tx.notification.create({
            data: {
              userId: w.userId,
              type: "LOTTERY",
              title: `You Won ${awards[i].description}!`,
              message: `Congratulations! You won ${w.amount.toLocaleString()} points in the "${l.title}" lottery!`,
              data: { lotteryId, position: w.position, prizeAmount: w.amount },
            },
          });
        }

        await tx.lottery.update({
          where: { id: lotteryId },
          data: { winners: winners as unknown as object },
        });

        await tx.lotterySettlement.create({
          data: {
            lotteryId,
            outcome: "DRAWN",
            prizeMode: l.prizeMode,
            ticketsSold: n,
            ticketPrice: l.ticketPrice,
            grossSalesPoints: gross,
            houseCutPercent: l.houseCutPercent,
            houseCutPoints: l.prizeMode === "POOL" ? houseCut : 0,
            seedPoints: l.poolSeedPoints,
            rolloverInPoints: l.rolloverInPoints,
            prizePoolPoints: l.prizeMode === "POOL" ? pool : totalPaid,
            paidOutPoints: totalPaid,
            overflowToHouse: l.prizeMode === "POOL" ? overflow : 0,
            tiers: tiers as unknown as object,
            winners: winners as unknown as object,
            drawOrderHash: hashOrder(order),
          },
        });

        return { ok: true, outcome: "DRAWN" as const, winners };
      },
      TX_OPTS
    );

    // Committed. Pay the refunds the shortfall branch promised. Idempotent, so
    // if this process dies here an admin can finish it by cancelling again.
    if (result.ok && pendingRefund) {
      await payRefunds(lotteryId, pendingRefund);
    }
    return result;
  } catch (err) {
    if (err instanceof NoPrizesError) return { ok: false, reason: "no_prizes" };
    // Previously this swallowed everything as `not_active`, which hid real
    // payout failures behind a benign-looking reason.
    console.error(`[lottery] draw failed for ${lotteryId}:`, err);
    return { ok: false, reason: "failed" };
  }
}

class NoPrizesError extends Error {}

function hashOrder(order: TicketLite[]): string {
  return createHash("sha256")
    .update(order.map((t) => t.id).join(","))
    .digest("hex");
}

/** Zero tickets: terminal, with nobody to pay. */
async function voidBranch(
  tx: Tx,
  l: { id: string; ticketPrice: number; prizeMode: "FIXED" | "POOL"; poolSeedPoints: number; rolloverInPoints: number }
): Promise<DrawResult> {
  await tx.lottery.update({
    where: { id: l.id },
    data: { status: "CANCELLED" },
  });
  await tx.lotterySettlement.create({
    data: {
      lotteryId: l.id,
      outcome: "VOID_NO_TICKETS",
      prizeMode: l.prizeMode,
      ticketsSold: 0,
      ticketPrice: l.ticketPrice,
      // A seed or carried-in pot with no ticket holders has nobody to go to.
      // It is recorded as retained, never credited to an arbitrary user.
      seedPoints: l.poolSeedPoints,
      rolloverInPoints: l.rolloverInPoints,
      houseCutPoints: l.poolSeedPoints + l.rolloverInPoints,
    },
  });
  return { ok: true, outcome: "VOID_NO_TICKETS", winners: [] };
}

/**
 * Mark a lottery refunded. The MONEY is not moved here — only the status and
 * the settlement, which are two writes and always fit the 15s ceiling. The
 * caller pays via `payRefunds` once the transaction has committed.
 */
async function refundBranch(
  tx: Tx,
  l: {
    id: string;
    ticketPrice: number;
    prizeMode: "FIXED" | "POOL";
    houseCutPercent: number;
    poolSeedPoints: number;
    rolloverInPoints: number;
  },
  tickets: TicketLite[]
): Promise<DrawResult> {
  await tx.lottery.update({ where: { id: l.id }, data: { status: "CANCELLED" } });
  await tx.lotterySettlement.create({
    data: {
      lotteryId: l.id,
      outcome: "REFUNDED",
      prizeMode: l.prizeMode,
      ticketsSold: tickets.length,
      ticketPrice: l.ticketPrice,
      grossSalesPoints: tickets.length * l.ticketPrice,
      // No cut is taken on a refunded lottery — the sale is undone.
      houseCutPercent: l.houseCutPercent,
      houseCutPoints: 0,
      seedPoints: l.poolSeedPoints,
      rolloverInPoints: l.rolloverInPoints,
      // The EXPECTED total. `payRefunds` reconciles against it.
      refundedPoints: tickets.length * l.ticketPrice,
    },
  });
  return { ok: true, outcome: "REFUNDED", winners: [] };
}

export interface RefundRunResult {
  /** Tickets that still owed a refund when this run started. */
  owed: number;
  /** Points actually credited by THIS run (0 if a previous run finished it). */
  paid: number;
}

/**
 * Pay out the refunds for a cancelled/refunded lottery.
 *
 * Runs OUTSIDE any transaction, in chunks. Every credit is keyed to
 * `lottery_refund_{lotteryId}_{ticketId}` under `Transaction @@unique([userId,
 * reference])`, so this is exactly-once per ticket no matter how many times it
 * runs or how many callers run it at once. That is what makes an interrupted
 * run safe to simply repeat, instead of needing a cap on lottery size.
 */
export async function payRefunds(
  lotteryId: string,
  why: "cancelled" | "shortfall" | "rollover_unavailable" = "cancelled"
): Promise<RefundRunResult> {
  const l = await prisma.lottery.findUnique({
    where: { id: lotteryId },
    select: { id: true, title: true, ticketPrice: true },
  });
  if (!l) return { owed: 0, paid: 0 };

  const tickets = await prisma.lotteryTicket.findMany({
    where: { lotteryId },
    select: { id: true, userId: true },
    orderBy: { id: "asc" },
  });
  if (tickets.length === 0) return { owed: 0, paid: 0 };

  // Skip anything already paid, so a resumed run doesn't re-walk the whole
  // lottery. (The unique constraint would catch it anyway; this is just cheap.)
  const already = await prisma.transaction.findMany({
    where: { reference: { startsWith: `lottery_refund_${lotteryId}_` } },
    select: { reference: true },
  });
  const paidRefs = new Set(already.map((t) => t.reference));
  const outstanding = tickets.filter(
    (t) => !paidRefs.has(`lottery_refund_${lotteryId}_${t.id}`)
  );
  if (outstanding.length === 0) return { owed: 0, paid: 0 };

  const reason =
    why === "shortfall"
      ? "minimum tickets not met"
      : why === "rollover_unavailable"
        ? "the follow-on draw was unavailable"
        : "the lottery was cancelled";

  const pointsPerUsd = await getPointsPerUsd();
  let paid = 0;

  // ONE transaction per ticket, not per chunk. A chunk-wide transaction meant a
  // single already-paid ticket rolled back its 24 unpaid neighbours, and they
  // were then reported as paid. The chunk is only a concurrency window.
  for (let i = 0; i < outstanding.length; i += REFUND_CHUNK) {
    const chunk = outstanding.slice(i, i + REFUND_CHUNK);
    const results = await Promise.all(
      chunk.map(async (t) => {
        try {
          await prisma.$transaction(async (tx) => {
            await creditPoints(tx, {
              userId: t.userId,
              points: l.ticketPrice,
              type: TransactionType.REFUND,
              description: `Lottery refunded (${reason}): ${l.title}`,
              reference: `lottery_refund_${lotteryId}_${t.id}`,
              // A refund returns points already spent — not new earnings.
              countsAsEarning: false,
              pointsPerUsd,
            });
            await tx.notification.create({
              data: {
                userId: t.userId,
                type: "LOTTERY",
                title: "Lottery refunded",
                message: `"${l.title}" ended without a draw (${reason}). Your ${l.ticketPrice.toLocaleString()} points have been returned.`,
                data: { lotteryId, refunded: l.ticketPrice },
              },
            });
          }, TX_OPTS);
          return l.ticketPrice;
        } catch (err) {
          // Already paid by a concurrent or earlier run — that is the whole
          // point of the deterministic reference. Anything else is real.
          if (isDuplicateLedgerError(err)) return 0;
          throw err;
        }
      })
    );
    paid += results.reduce((s, n) => s + n, 0);
  }

  return { owed: outstanding.length, paid };
}

/**
 * Move the pot to the next lottery. Tickets are NOT refunded, which is why the
 * user-facing page must disclose the policy before purchase.
 */
async function rolloverBranch(
  tx: Tx,
  l: {
    id: string;
    title: string;
    ticketPrice: number;
    prizeMode: "FIXED" | "POOL";
    houseCutPercent: number;
    poolSeedPoints: number;
    rolloverInPoints: number;
    poolCapPoints: number | null;
    rolloverTargetId: string | null;
  },
  tickets: TicketLite[]
): Promise<DrawResult | null> {
  const { gross, houseCut, pool, overflow } = computePool({
    ticketsSold: tickets.length,
    ticketPrice: l.ticketPrice,
    houseCutPercent: l.houseCutPercent,
    seedPoints: l.poolSeedPoints,
    rolloverInPoints: l.rolloverInPoints,
    poolCapPoints: l.poolCapPoints,
  });

  // Null tells the caller to refund instead — never strand user money in a
  // dead-end chain.
  const target = await resolveRolloverTarget(tx, l.id, l.rolloverTargetId);
  if (!target) return null;

  // `increment`, so several lotteries can roll into the same target and a chain
  // compounds correctly. Each link's house cut is taken on its own gross only.
  await tx.lottery.update({
    where: { id: target.id },
    data: { rolloverInPoints: { increment: pool }, rolloverFromId: l.id },
  });

  for (const t of tickets) {
    await tx.notification.create({
      data: {
        userId: t.userId,
        type: "LOTTERY",
        title: "Prize pot rolled over",
        message: `"${l.title}" didn't reach its minimum ticket count, so the pot moved to "${target.title}". Your ticket was not refunded — this was stated on the lottery page.`,
        data: { lotteryId: l.id, rolledTo: target.id, amount: pool },
      },
    });
  }

  await tx.lotterySettlement.create({
    data: {
      lotteryId: l.id,
      outcome: "ROLLED_OVER",
      prizeMode: l.prizeMode,
      ticketsSold: tickets.length,
      ticketPrice: l.ticketPrice,
      grossSalesPoints: gross,
      houseCutPercent: l.houseCutPercent,
      houseCutPoints: houseCut,
      seedPoints: l.poolSeedPoints,
      rolloverInPoints: l.rolloverInPoints,
      prizePoolPoints: pool,
      rolledOverPoints: pool,
      overflowToHouse: overflow,
      rolloverToId: target.id,
    },
  });
  return { ok: true, outcome: "ROLLED_OVER", winners: [] };
}

/** Max hops walked when checking a rollover chain for a cycle. */
const ROLLOVER_MAX_HOPS = 5;

/**
 * A rollover target is only usable if it can still pay out: not this lottery,
 * still open, drawing in the future, and not part of a cycle that would send
 * the pot back here.
 */
async function resolveRolloverTarget(
  tx: Tx,
  selfId: string,
  targetId: string | null
): Promise<{ id: string; title: string } | null> {
  if (!targetId || targetId === selfId) return null;

  const target = await tx.lottery.findUnique({
    where: { id: targetId },
    select: { id: true, title: true, status: true, drawDate: true },
  });
  if (!target) return null;
  if (target.status !== "UPCOMING" && target.status !== "ACTIVE") return null;
  if (target.drawDate <= new Date()) return null;

  // Walk the chain — A→B→A would bounce the pot forever.
  let cursor: string | null = target.id;
  for (let hop = 0; hop < ROLLOVER_MAX_HOPS && cursor; hop++) {
    const next: { rolloverTargetId: string | null } | null =
      await tx.lottery.findUnique({
        where: { id: cursor },
        select: { rolloverTargetId: true },
      });
    cursor = next?.rolloverTargetId ?? null;
    if (cursor === selfId || cursor === target.id) return null;
  }

  return { id: target.id, title: target.title };
}

export type CancelResult =
  | { ok: true; refunded: number; tickets: number; resumed: boolean }
  | { ok: false; reason: "not_found" | "already_drawn" | "failed" };

/**
 * Cancel a lottery and refund every ticket.
 *
 * Extracted out of the admin PATCH route, which did this as an unbounded
 * `Promise.all` of N `user.update` + N `transaction.create` + N
 * `notification.create` with **no transaction and no status re-check** — so a
 * double-click double-refunded, and a partial failure left half-refunded state
 * with no way to tell which half.
 *
 * Two phases: a short transaction flips the status and writes the settlement,
 * then the refunds are paid outside it in idempotent chunks. Calling this again
 * on an already-CANCELLED lottery deliberately **resumes** an interrupted
 * payout rather than erroring — that is what makes a half-finished refund
 * recoverable by pressing the button a second time.
 */
export async function cancelLottery(lotteryId: string): Promise<CancelResult> {
  const head = await prisma.lottery.findUnique({
    where: { id: lotteryId },
    select: { id: true, status: true, ticketPrice: true },
  });
  if (!head) return { ok: false, reason: "not_found" };
  // A drawn lottery has already paid winners; refunding on top would pay twice.
  if (head.status === "COMPLETED") {
    return { ok: false, reason: "already_drawn" };
  }

  try {
    let claimed = false;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lottery" WHERE id = ${lotteryId} FOR UPDATE`;

      const claim = await tx.lottery.updateMany({
        where: { id: lotteryId, status: { in: ["UPCOMING", "ACTIVE"] } },
        data: { status: "CANCELLED" },
      });
      if (claim.count === 0) return; // already cancelled — fall through to resume

      claimed = true;
      const l = await tx.lottery.findUniqueOrThrow({ where: { id: lotteryId } });
      const ticketsSold = await tx.lotteryTicket.count({ where: { lotteryId } });

      // A cancelled lottery holding a seed or a rolled-in pot would otherwise
      // evaporate it silently — record it so finance can see where it went.
      await tx.lotterySettlement.create({
        data: {
          lotteryId,
          outcome: "REFUNDED",
          prizeMode: l.prizeMode,
          ticketsSold,
          ticketPrice: l.ticketPrice,
          grossSalesPoints: ticketsSold * l.ticketPrice,
          seedPoints: l.poolSeedPoints,
          rolloverInPoints: l.rolloverInPoints,
          refundedPoints: ticketsSold * l.ticketPrice,
          houseCutPoints: l.poolSeedPoints + l.rolloverInPoints,
        },
      });
    }, TX_OPTS);

    const run = await payRefunds(lotteryId, "cancelled");
    return {
      ok: true,
      refunded: run.paid,
      tickets: run.owed,
      resumed: !claimed,
    };
  } catch (err) {
    console.error(`[lottery] cancel failed for ${lotteryId}:`, err);
    return { ok: false, reason: "failed" };
  }
}

/**
 * What a draw WOULD pay right now — zero writes. Lets an admin see the
 * economics before committing to a config.
 */
export async function previewDraw(lotteryId: string) {
  const l = await prisma.lottery.findUnique({ where: { id: lotteryId } });
  if (!l) return null;
  const ticketsSold = await prisma.lotteryTicket.count({ where: { lotteryId } });

  const pool = computePool({
    ticketsSold,
    ticketPrice: l.ticketPrice,
    houseCutPercent: l.houseCutPercent,
    seedPoints: l.poolSeedPoints,
    rolloverInPoints: l.rolloverInPoints,
    poolCapPoints: l.poolCapPoints,
  });
  const tiers =
    l.prizeMode === "POOL"
      ? effectiveTiers(parsePrizeTiers(l.prizeTiers), ticketsSold)
      : [];
  const awards =
    l.prizeMode === "POOL"
      ? splitPool(pool.pool, tiers)
      : fixedAwards(parseFixedPrizes(l.prizes), ticketsSold);

  const shortfall = l.minTickets > 0 && ticketsSold < l.minTickets;
  return {
    prizeMode: l.prizeMode,
    ticketsSold,
    minTickets: l.minTickets,
    shortfall,
    shortfallAction: l.shortfallAction,
    ...pool,
    awards,
    totalPaid: awards.reduce((s, a) => s + a.amount, 0),
  };
}
