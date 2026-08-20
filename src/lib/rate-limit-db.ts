import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

/**
 * Shared, cross-instance rate limiting.
 *
 * The in-memory limiter (`src/lib/rate-limit.ts`) keeps its counters in a
 * module-scope Map, which on Vercel means one counter per serverless instance —
 * and the platform adds instances under exactly the load an attacker generates.
 * That makes it unusable for anything that must actually be bounded.
 *
 * This version keeps the counter in Postgres, so every instance sees the same
 * number. It costs one upsert per attempt, which is why it is reserved for the
 * endpoints where being wrong costs money: withdrawals, deposits, purchases,
 * reward claims, task submissions.
 *
 * It is a *rate* guard, not a correctness guard. Correctness still comes from
 * `withIdempotency` and the `@@unique([userId, reference])` ledger constraints —
 * this exists so the database isn't what absorbs an attack.
 */

export interface DbLimitResult {
  ok: boolean;
  retryAfterSec: number;
  count: number;
}

/**
 * Count one hit against `bucket` and report whether it is over `limit` for the
 * current window.
 *
 * Fails OPEN. If the limiter's own query fails we allow the request: a database
 * blip must not lock every user out of withdrawing their money. The endpoints
 * behind this are already idempotent, so an unlimited window during an outage is
 * the lesser risk.
 */
export async function dbRateLimit(
  bucket: string,
  limit: number,
  windowMs: number
): Promise<DbLimitResult> {
  const now = Date.now();
  const windowId = BigInt(Math.floor(now / windowMs));
  const resetAtMs = (Math.floor(now / windowMs) + 1) * windowMs;

  try {
    // The unique index on (bucket, window) makes this atomic: concurrent
    // requests either create the row or increment the same one.
    const row = await prisma.rateLimitHit.upsert({
      where: { bucket_window: { bucket, window: windowId } },
      create: {
        bucket,
        window: windowId,
        count: 1,
        expiresAt: new Date(resetAtMs),
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    if (row.count > limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
        count: row.count,
      };
    }
    return { ok: true, retryAfterSec: 0, count: row.count };
  } catch {
    return { ok: true, retryAfterSec: 0, count: 0 };
  }
}

/**
 * Guard for a money/claim route: returns a 429 when over the limit, else null.
 *
 * Limits per USER where we have one (an attacker can rotate IPs but not
 * accounts), falling back to IP for unauthenticated callers.
 *
 * ```ts
 * const limited = await enforceDbRateLimit(req, "withdraw", session.user.id, 5, 60_000);
 * if (limited) return limited;
 * ```
 */
export async function enforceDbRateLimit(
  req: NextRequest,
  scope: string,
  userId: string | null | undefined,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const subject = userId ? `u:${userId}` : `ip:${clientIp(req)}`;
  const { ok, retryAfterSec } = await dbRateLimit(
    `${scope}:${subject}`,
    limit,
    windowMs
  );
  if (ok) return null;
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Delete expired counters. Called from the retention cron. */
export async function pruneRateLimitHits(): Promise<number> {
  try {
    const res = await prisma.rateLimitHit.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return res.count;
  } catch {
    return 0;
  }
}
