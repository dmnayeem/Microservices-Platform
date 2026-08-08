import { PrismaClient } from "@/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

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

const RETRY_MAX = 3;

function createPrismaClient() {
  return new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL!,
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
              attempt++;
              if (
                !retryable ||
                attempt >= RETRY_MAX ||
                !isTransientAccelerateError(e)
              ) {
                throw e;
              }
              await new Promise((r) => setTimeout(r, 150 * attempt));
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
