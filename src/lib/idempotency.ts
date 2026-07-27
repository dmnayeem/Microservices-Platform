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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export const LEDGER_UNIQUE_CONSTRAINT = "Transaction_userId_reference_key";

/** True for any Prisma P2002 unique-constraint violation (duck-typed). */
function isP2002(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Client-driven HTTP idempotency for money POSTs.
 *
 * If the request carries an `Idempotency-Key` header, we reserve a row in
 * `IdempotencyKey` (unique on `(userId, key)`), run `handler` exactly once, store
 * its status+JSON body, and REPLAY that stored response for any retry that reuses
 * the key. Without the header the handler runs normally (backwards compatible).
 *
 * This complements the P5 ledger `@@unique([userId, reference])` (which dedupes
 * the money ROW): the key layer dedupes the whole request/response — including
 * validation-stage effects — before the ledger write is even attempted.
 *
 * Reserve-first semantics: the losing racer of a concurrent double-submit either
 * replays the stored response (if the winner finished) or gets a 409 (still
 * in-flight). If the handler throws, the reservation is released so a genuine
 * retry can proceed.
 */
export async function withIdempotency(
  req: Request,
  userId: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return handler();

  const method = req.method;
  const endpoint = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return "";
    }
  })();

  // Reserve the key (responseStatus 0 = in-flight).
  try {
    await prisma.idempotencyKey.create({
      data: { userId, key, method, endpoint },
    });
  } catch (err) {
    if (!isP2002(err)) throw err;
    // Key already seen — replay the stored response, or 409 if still in-flight.
    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
      select: { responseStatus: true, response: true },
    });
    if (existing && existing.responseStatus !== 0) {
      return NextResponse.json(existing.response, {
        status: existing.responseStatus,
        headers: { "Idempotent-Replay": "true" },
      });
    }
    return NextResponse.json(
      { error: "A request with this Idempotency-Key is already in progress." },
      { status: 409 }
    );
  }

  // We own the key — run the handler once, persist its response.
  try {
    const res = await handler();
    // Only memoize deterministic outcomes (2xx success, 4xx client errors like
    // "insufficient balance"/validation). A 5xx is transient — release the key so
    // a genuine retry re-runs instead of replaying the error forever.
    if (res.status >= 500) {
      await prisma.idempotencyKey
        .delete({ where: { userId_key: { userId, key } } })
        .catch(() => {});
      return res;
    }
    let body: unknown = {};
    try {
      body = await res.clone().json();
    } catch {
      body = {};
    }
    await prisma.idempotencyKey.update({
      where: { userId_key: { userId, key } },
      data: {
        responseStatus: res.status,
        response: (body ?? {}) as Prisma.InputJsonValue,
      },
    });
    return res;
  } catch (handlerErr) {
    // Release the reservation so a real retry isn't permanently 409'd.
    await prisma.idempotencyKey
      .delete({ where: { userId_key: { userId, key } } })
      .catch(() => {});
    throw handlerErr;
  }
}

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
