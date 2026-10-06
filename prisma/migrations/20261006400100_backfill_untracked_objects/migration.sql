-- Backfill: objects that are in schema.prisma (and on the live database, where
-- they arrived via `db push` around 2026-08-17/18) but that no migration ever
-- created. Found by checking every model, scalar column, index and FK in
-- schema.prisma against the CREATE/ALTER statements in prisma/migrations.
--
-- STRICT NO-OP ON THE LIVE DATABASE: every statement is IF NOT EXISTS or
-- exception-guarded, and the names are exactly Prisma's generated ones, so the
-- live objects are matched and left alone. It only does work on a database
-- built from the migration history (fresh / staging). See MIGRATIONS.md
-- "Fresh database" for where this must run in that case — several EARLIER
-- migrations (20260820120000, 20260821120000, 20260822190000) already
-- reference these objects.
--
-- No CONCURRENTLY and no ALTER TYPE ... ADD VALUE: safe inside the transaction
-- `prisma migrate deploy` runs a migration file in.

-- ── Enum ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "EventActionType" AS ENUM (
    'TEAM_ADD', 'TASK_COMPLETE', 'QUIZ_COMPLETE', 'LOTTERY_BUY', 'UPLOAD_PROOF',
    'SOCIAL_ACTION', 'FEED_LIKE', 'FEED_COMMENT', 'FEED_SHARE', 'FEED_POST',
    'FEED_VOTE', 'REFERRAL_SIGNUP', 'PWA_INSTALLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionType" "EventActionType" NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "tiers" JSONB,
    "requiredAccessLevel" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "audience" JSONB,
    "dailyCap" INTEGER NOT NULL DEFAULT 0,
    "notifyOnStart" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserEventProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "proofUrl" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedTiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "joinedAt" TIMESTAMP(3),
    "lastActionAt" TIMESTAMP(3),
    "dayKey" TEXT,
    "dayCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEventProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrowseEarnLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrowseEarnLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PostBoostView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostBoostView_pkey" PRIMARY KEY ("id")
);

-- ── Columns on existing tables ──────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pageOverrides" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastIp" TEXT;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "genders" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "districts" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "subDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "postalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "minAge" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "maxAge" INTEGER;

ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "targetTasksEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AffiliateClick" ADD COLUMN IF NOT EXISTS "visitorHash" TEXT;

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "boostedUntil" TIMESTAMP(3);

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "targetUserId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- ── Indexes (same family: declared in schema.prisma, never in a migration) ──
CREATE INDEX IF NOT EXISTS "Event_isActive_startAt_endAt_idx" ON "Event"("isActive", "startAt", "endAt");
CREATE UNIQUE INDEX IF NOT EXISTS "UserEventProgress_userId_eventId_key" ON "UserEventProgress"("userId", "eventId");
CREATE INDEX IF NOT EXISTS "UserEventProgress_eventId_idx" ON "UserEventProgress"("eventId");
CREATE INDEX IF NOT EXISTS "BrowseEarnLog_userId_createdAt_idx" ON "BrowseEarnLog"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PostBoostView_userId_postId_key" ON "PostBoostView"("userId", "postId");
CREATE INDEX IF NOT EXISTS "PostBoostView_postId_idx" ON "PostBoostView"("postId");

CREATE INDEX IF NOT EXISTS "User_signupIp_idx" ON "User"("signupIp");
CREATE INDEX IF NOT EXISTS "User_country_idx" ON "User"("country");
CREATE INDEX IF NOT EXISTS "User_gender_idx" ON "User"("gender");
CREATE INDEX IF NOT EXISTS "User_division_idx" ON "User"("division");
CREATE INDEX IF NOT EXISTS "User_district_idx" ON "User"("district");
CREATE INDEX IF NOT EXISTS "User_subDistrict_idx" ON "User"("subDistrict");
CREATE INDEX IF NOT EXISTS "User_city_idx" ON "User"("city");
CREATE INDEX IF NOT EXISTS "User_region_idx" ON "User"("region");
CREATE INDEX IF NOT EXISTS "User_language_idx" ON "User"("language");
CREATE INDEX IF NOT EXISTS "User_dateOfBirth_idx" ON "User"("dateOfBirth");
CREATE INDEX IF NOT EXISTS "User_country_gender_idx" ON "User"("country", "gender");

CREATE INDEX IF NOT EXISTS "AffiliateClick_visitorHash_idx" ON "AffiliateClick"("visitorHash");
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

-- ── Foreign keys ────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "UserEventProgress" ADD CONSTRAINT "UserEventProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserEventProgress" ADD CONSTRAINT "UserEventProgress_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PostBoostView" ADD CONSTRAINT "PostBoostView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PostBoostView" ADD CONSTRAINT "PostBoostView_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
