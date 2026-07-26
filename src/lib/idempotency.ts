/**
 * Idempotency helpers for the money ledger.
 *
 * `Transaction` has a composite unique `@@unique([userId, reference])` (constraint
 * `Transaction_userId_reference_key`). A **deterministic** `reference` for a
 * once-only money event is therefore unique per user, so a retry / concurrent
 * double-submit / replay that reuses the same reference makes the second ledger
 * write fail with Prisma error `P2002`. Wrap the `$transaction` and, on that
 * error, treat the operation as already-processed instead of surfacing a 500 or
 * double-settling.
 *
 * Detection is duck-typed on `err.code === "P2002"` (matching the existing
 * offerwall-callback pattern — the Accelerate extension can rewrap errors, so an
 * `instanceof PrismaClientKnownRequestError` check is unreliable) and narrowed to
 * the `reference` column so an *unrelated* unique violation inside the same
 * transaction (e.g. a `CourseEnrollment` compound key) is NOT swallowed.
 */

export const LEDGER_UNIQUE_CONSTRAINT = "Transaction_userId_reference_key";

/** True if `err` is the P2002 unique violation on `Transaction.(userId, reference)`. */
export function isDuplicateLedgerError(err: unknown): boolean {
  const e = err as { code?: unknown; meta?: { target?: unknown } } | null | undefined;
  if (!e || e.code !== "P2002") return false;

  const target = e.meta?.target;
  // Postgres/Prisma reports `target` as the constraint name (string) or the list
  // of offending fields (array). Match the ledger constraint / the `reference`
  // column in either shape.
  if (typeof target === "string") {
    return target === LEDGER_UNIQUE_CONSTRAINT || target.includes("reference");
  }
  if (Array.isArray(target)) {
    return target.some((t) => String(t).includes("reference"));
  }
  // Unknown/absent target → do NOT assume it's the ledger; let it surface so a
  // different constraint violation isn't silently treated as "already processed".
  return false;
}
