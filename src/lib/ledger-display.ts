import type { Prisma } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";

/**
 * How the ledger is shown to the account holder (wallet, dashboard,
 * transaction history).
 *
 * The books stay exactly as written — admin and finance screens read the raw
 * rows. For the user, a prize that was later corrected is shown ONCE at its
 * corrected amount, labelled "(adjusted)", instead of a large credit followed
 * by a large deduction. The correction row itself is folded into that line:
 *
 *   - rows whose reference starts with HIDDEN_FROM_USER_PREFIX are not listed;
 *   - a row with `metadata.adjustedPoints` is shown at that amount.
 *
 * Both are set together by the correction, so what the user sees still adds
 * up to their balance.
 */
export const HIDDEN_FROM_USER_PREFIX = "leaderboard_correction_";

export const userVisibleLedger: Prisma.TransactionWhereInput = {
  NOT: { reference: { startsWith: HIDDEN_FROM_USER_PREFIX } },
};

export function isHiddenFromUser(reference: string | null | undefined): boolean {
  return !!reference && reference.startsWith(HIDDEN_FROM_USER_PREFIX);
}

type Row = {
  points: number | null;
  amount: unknown;
  description?: string | null;
  reference?: string | null;
  metadata?: unknown;
};

/** One row as the account holder sees it. */
export function forUser<T extends Row>(tx: T): T {
  const adj = (tx.metadata as { adjustedPoints?: unknown } | null | undefined)?.adjustedPoints;
  if (typeof adj !== "number" || tx.points === null || adj === tx.points) return tx;
  const ratio = tx.points ? adj / tx.points : 0;
  return {
    ...tx,
    points: adj,
    amount: toNum(tx.amount as never) * ratio,
    description: tx.description ? `${tx.description} (adjusted)` : tx.description,
  };
}

/** A list as the account holder sees it: corrections folded away. */
export function ledgerForUser<T extends Row>(rows: T[]): T[] {
  return rows.filter((r) => !isHiddenFromUser(r.reference)).map(forUser);
}
