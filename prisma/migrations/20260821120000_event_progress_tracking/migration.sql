-- Event progress tracking: forward-only counters instead of read-time recompute.
--
-- APPLIED TO THE LIVE DATABASE WITH `prisma db execute`, ONE STATEMENT PER
-- INVOCATION, then `migrate resolve --applied` — see MIGRATIONS.md. Two reasons
-- this file must not be run through `migrate deploy`:
--   * `ALTER TYPE … ADD VALUE` cannot be used in the same transaction that adds
--     it, and Prisma wraps a migration file in a transaction.
--   * `CREATE INDEX CONCURRENTLY` cannot run inside a transaction at all.
-- There are real users on this database; every statement here is additive.

ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'FEED_LIKE';
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'FEED_COMMENT';
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'FEED_SHARE';
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'FEED_POST';
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'FEED_VOTE';
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'REFERRAL_SIGNUP';

CREATE TABLE IF NOT EXISTS "EventActionLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventActionLog_pkey" PRIMARY KEY ("id")
);

-- The unique index is the anti-abuse enforcement point: one credited action per
-- (event, user, target).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "EventActionLog_eventId_userId_dedupKey_key"
  ON "EventActionLog"("eventId","userId","dedupKey");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventActionLog_eventId_userId_idx"
  ON "EventActionLog"("eventId","userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventActionLog_createdAt_idx"
  ON "EventActionLog"("createdAt");

ALTER TABLE "EventActionLog" ADD CONSTRAINT "EventActionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventActionLog" ADD CONSTRAINT "EventActionLog_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3);
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "lastActionAt" TIMESTAMP(3);
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "dayKey" TEXT;
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "dayCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "notifiedComplete" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "audience" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "dailyCap" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "notifyOnStart" BOOLEAN NOT NULL DEFAULT false;
