import "server-only";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

/**
 * Shared money-ledger primitive. Every points credit should keep three things in
 * sync atomically: `User.pointsBalance`, `User.totalEarnings` (the lifetime
 * "total earned" the profile derives from), and a `Transaction` row (so it shows
 * in history). Historically ~45 paths inlined this and drifted — several credited
 * points but forgot `totalEarnings` or wrote no `Transaction` at all. Use these
 * helpers for new credits and to repair the broken paths.
 *
 * `db` accepts the top-level `prisma` OR an interactive-transaction client, so it
 * composes inside an existing `$transaction`.
 */
export type LedgerDb = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface CreditPointsArgs {
  userId: string;
  /** Points to credit (must be > 0; a no-op otherwise). */
  points: number;
  type: TransactionType;
  description: string;
  /** Deterministic idempotency key — the `@@unique([userId, reference])` guards replays. */
  reference?: string;
  metadata?: Record<string, unknown>;
  /**
   * Whether this credit adds to lifetime `totalEarnings` (default true). Set
   * false for point refunds/reversals that shouldn't inflate lifetime earned.
   */
  countsAsEarning?: boolean;
  status?: TransactionStatus;
  /** Pass a pre-fetched rate to avoid an extra lookup inside a hot transaction. */
  pointsPerUsd?: number;
}

/**
 * Credit points to a user: bumps `pointsBalance`, bumps `totalEarnings` (when it
 * counts as earning), and writes a `Transaction`. All on the provided `db`, so
 * wrap in a `$transaction` for atomicity with surrounding writes.
 */
export async function creditPoints(db: LedgerDb, args: CreditPointsArgs): Promise<void> {
  const {
    userId,
    points,
    type,
    description,
    reference,
    metadata,
    countsAsEarning = true,
    status = TransactionStatus.COMPLETED,
  } = args;
  if (!points || points <= 0) return;
  const rate = args.pointsPerUsd ?? (await getPointsPerUsd());
  const usdValue = rate > 0 ? points / rate : 0;

  await db.user.update({
    where: { id: userId },
    data: {
      pointsBalance: { increment: points },
      ...(countsAsEarning ? { totalEarnings: { increment: usdValue } } : {}),
    },
  });
  await db.transaction.create({
    data: {
      userId,
      type,
      status,
      points,
      amount: usdValue,
      description,
      ...(reference ? { reference } : {}),
      ...(metadata ? { metadata: metadata as object } : {}),
    },
  });
}

interface RecordTxnArgs {
  userId: string;
  type: TransactionType;
  points?: number;
  amountUsd?: number;
  description: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  status?: TransactionStatus;
}

/**
 * Write a `Transaction` ledger row ONLY (balances already changed by the caller).
 * Use for cash-side moves and admin adjustments so nothing is invisible in history.
 */
export async function recordTransaction(db: LedgerDb, args: RecordTxnArgs): Promise<void> {
  await db.transaction.create({
    data: {
      userId: args.userId,
      type: args.type,
      status: args.status ?? TransactionStatus.COMPLETED,
      points: args.points ?? 0,
      amount: args.amountUsd ?? 0,
      description: args.description,
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.metadata ? { metadata: args.metadata as object } : {}),
    },
  });
}
