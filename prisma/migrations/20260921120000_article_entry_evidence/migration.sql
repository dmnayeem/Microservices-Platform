-- Arrival evidence on an article key.
--
-- Additive and entirely nullable. Every key that exists today was issued
-- through the direct flow, which does not write any of these, so the backfill
-- is "leave them null" and no running code changes behaviour.
--
-- `entrySource` holds the verdict the embed reached at issue time, not the raw
-- signal: the referrer is gone by the time the key is submitted, so a decision
-- that cannot be re-derived has to be recorded when it is made.
ALTER TABLE "ArticleTaskKey"
  ADD COLUMN IF NOT EXISTS "entrySource" TEXT,
  ADD COLUMN IF NOT EXISTS "entryReferrer" TEXT,
  ADD COLUMN IF NOT EXISTS "entryLandingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "visitFingerprint" TEXT;

-- Supports the per-fingerprint rate limit on the no-token branch: "how many
-- keys has this browser been issued for this task recently".
CREATE INDEX IF NOT EXISTS "ArticleTaskKey_taskId_visitFingerprint_issuedAt_idx"
  ON "ArticleTaskKey" ("taskId", "visitFingerprint", "issuedAt");
