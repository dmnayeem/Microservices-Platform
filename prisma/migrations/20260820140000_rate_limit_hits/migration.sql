-- Shared (cross-instance) rate-limit counters.
--
-- The in-memory limiter is per serverless instance and therefore cannot bound
-- anything on Vercel. This table backs `enforceDbRateLimit`, used on the routes
-- where money moves. Strictly additive: one new table.

CREATE TABLE IF NOT EXISTS "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "window" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- The unique index is what makes the counter increment atomic across instances.
CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitHit_bucket_window_key"
  ON "RateLimitHit" ("bucket", "window");

-- Retention prune.
CREATE INDEX IF NOT EXISTS "RateLimitHit_expiresAt_idx"
  ON "RateLimitHit" ("expiresAt");
