-- Social-earning ratio progress counter.
--
-- APPLIED TO THE LIVE DATABASE with `prisma db execute`, one statement per
-- invocation, then `migrate resolve --applied` — see MIGRATIONS.md.
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, and Prisma wraps
-- a migration file in one, so this must NOT go through `migrate deploy`.
--
-- Why the table exists: the previous ratio counted `COUNT(DISTINCT postId)` over
-- SocialActionLog at read time. That table is keyed by the ACTOR (so it can
-- never answer "how many likes did MY posts get"), and log retention prunes it
-- at 120 days — so the count went backwards and long-lived users silently
-- stopped earning milestones forever.
--
-- `count` holds the REMAINDER toward the next milestone, not a running total, so
-- an admin changing `perCount` can't misalign an already-paid batch index.

CREATE TABLE IF NOT EXISTS "SocialRatioTally" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "window" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "paidCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialRatioTally_pkey" PRIMARY KEY ("id")
);

-- One row per (paid user, side, action, window, day). The upsert on this key is
-- what makes the increment atomic without a separate COUNT.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "SocialRatioTally_userId_role_action_window_dateKey_key"
  ON "SocialRatioTally"("userId","role","action","window","dateKey");

-- Retention prunes stale DAILY rows only; lifetime rows are the durable counter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SocialRatioTally_window_updatedAt_idx"
  ON "SocialRatioTally"("window","updatedAt");

ALTER TABLE "SocialRatioTally" ADD CONSTRAINT "SocialRatioTally_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
