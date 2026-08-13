import { PrismaClient } from "@/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// Read ops are idempotent → safe to retry. Writes are NOT retried (a transient
// "communication" error could still have executed the mutation).
const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Is this a transient Prisma Accelerate / query-engine transport error (as
 * opposed to a real query/validation error)? These mean the request likely
 * never reached the engine, so a retry is safe. Matches Accelerate startup/
 * transport codes + the generic "communicating with your Query Engine" message.
 */
function isTransientAccelerateError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  if (code === "P6008" || code === "P6009" || /^P5\d\d\d$/.test(code)) {
    // P6009 = response-size limit → not transient; never retry it.
    if (code === "P6009") return false;
    return true;
  }
  const msg = err?.message ?? "";
  return /Accelerate|Query Engine|communicat|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|timed out/i.test(
    msg
  );
}

// Backoff schedule (ms) between read retries. Sized to ride out a Prisma
// Postgres cold-wake on a serverless cold start (~a few seconds) — local dev
// keeps the DB warm, but on Vercel the first requests after idle/deploy can hit
// a waking instance and get a transient "communicating with Query Engine" error.
// Each delay runs ONLY after a caught transient error on a read; the happy path
// returns on the first attempt with zero added latency.
const RETRY_BACKOFF_MS = [250, 500, 1000, 2000];

function createPrismaClient() {
  const url = process.env.DATABASE_URL!;
  // Accelerate proxy URLs use the prisma:// (prisma+postgres://) scheme; a plain
  // postgres:// is a DIRECT connection, made via the pg driver adapter. Pick the
  // matching constructor option so the same client works with either.
  // withAccelerate() stays applied — its `cacheStrategy` is a no-op on a direct
  // connection, so every existing cacheStrategy call still runs (just uncached).
  const isAccelerate =
    url.startsWith("prisma://") || url.startsWith("prisma+postgres://");
  const connOption = isAccelerate
    ? { accelerateUrl: url }
    : { adapter: new PrismaPg({ connectionString: url }) };
  return new PrismaClient({
    ...connOption,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
    .$extends(withAccelerate())
    .$extends({
      // Outermost hook — wraps execution (incl. Accelerate) so a transient
      // engine-communication blip retries instead of crashing the request.
      query: {
        async $allOperations({ operation, args, query }) {
          const retryable = READ_OPS.has(operation);
          let attempt = 0;
          for (;;) {
            try {
              return await query(args);
            } catch (e) {
              if (
                !retryable ||
                attempt >= RETRY_BACKOFF_MS.length ||
                !isTransientAccelerateError(e)
              ) {
                throw e;
              }
              await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
              attempt++;
            }
          }
        },
      },
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
