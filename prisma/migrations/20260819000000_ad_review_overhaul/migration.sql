-- Ad review overhaul: enforceable review gate, decision trail, durable
-- engagement dedup, and authoritative campaign spend.
-- Strictly additive: new nullable columns, new columns with defaults, two new
-- tables and indexes. No drops, no type narrowing.

-- ── Ad: review workflow ─────────────────────────────────────────────────────
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "rejectionCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "creativeGroupId" TEXT;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "allowSameOrigin" BOOLEAN NOT NULL DEFAULT false;

-- Anything already live/paused/off was reviewed at some point (or is an
-- admin-created ad, which is auto-approved) — without this backfill every
-- existing ad would look "never approved" and could not be resumed.
UPDATE "Ad" SET "approvedAt" = COALESCE("reviewedAt", "createdAt")
  WHERE "approvedAt" IS NULL AND "status" IN ('ACTIVE', 'PAUSED', 'INACTIVE');
UPDATE "Ad" SET "submittedAt" = "createdAt" WHERE "submittedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Ad_status_createdAt_idx" ON "Ad"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Ad_creativeGroupId_idx" ON "Ad"("creativeGroupId");

-- ── AdCampaign: authoritative spend + house inventory ───────────────────────
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "spentTotal" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "isHouse" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AdCampaign" SET "isHouse" = true WHERE "advertiserId" IS NULL;

-- Best-effort backfill from the daily rollup (only reaches as far back as
-- AdDailyStat retention; historical "spent" shifts once, by design).
UPDATE "AdCampaign" c SET "spentTotal" = s.spend
  FROM (
    SELECT a."campaignId" AS cid, SUM(d."spendUsd") AS spend
    FROM "AdDailyStat" d JOIN "Ad" a ON a."id" = d."adId"
    GROUP BY a."campaignId"
  ) s
  WHERE s.cid = c."id" AND c."spentTotal" = 0;

-- ── AdReview: append-only decision trail ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AdReview" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "internalNote" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdReview_adId_createdAt_idx" ON "AdReview"("adId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdReview_actorId_idx" ON "AdReview"("actorId");

ALTER TABLE "AdReview" DROP CONSTRAINT IF EXISTS "AdReview_adId_fkey";
ALTER TABLE "AdReview" ADD CONSTRAINT "AdReview_adId_fkey"
  FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AdEngagement: durable view/click dedup ──────────────────────────────────
-- The unique index IS the cooldown. `subject` is NOT NULL on purpose: Postgres
-- treats NULLs as distinct, so a nullable column would never dedup anon traffic.
CREATE TABLE IF NOT EXISTS "AdEngagement" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "bucket" BIGINT NOT NULL,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdEngagement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdEngagement_adId_kind_subject_bucket_key"
  ON "AdEngagement"("adId", "kind", "subject", "bucket");
CREATE INDEX IF NOT EXISTS "AdEngagement_adId_createdAt_idx" ON "AdEngagement"("adId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdEngagement_createdAt_idx" ON "AdEngagement"("createdAt");

ALTER TABLE "AdEngagement" DROP CONSTRAINT IF EXISTS "AdEngagement_adId_fkey";
ALTER TABLE "AdEngagement" ADD CONSTRAINT "AdEngagement_adId_fkey"
  FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
