-- Unique guards. Each CREATE UNIQUE INDEX FAILS if duplicate rows already
-- exist, which aborts `migrate deploy` (deploy.sh then keeps the old build
-- serving). Run the duplicate checks in MIGRATIONS.md "Unique guards" first.

-- One external Telegram/Discord account -> one RevType user.
-- Schema: @@unique([platform, platformUserId]) (replaces the plain index).
CREATE UNIQUE INDEX IF NOT EXISTS "LinkedPlatformAccount_platform_platformUserId_key"
  ON "LinkedPlatformAccount"("platform", "platformUserId");
-- The unique index serves every lookup the plain one did.
DROP INDEX IF EXISTS "LinkedPlatformAccount_platform_platformUserId_idx";

-- ── RAW-SQL partial unique indexes (Prisma cannot declare them). ─────────────
-- MUST NOT BE DROPPED by a generated migration (scripts/check-migration-drops.ts).

-- At most one ACTIVE dispute per purchase. "Active" = the same set the app
-- uses (OPEN, IN_REVIEW, ESCALATED; api/marketplace/disputes + admin ACTIVE_DISPUTE).
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceDispute_one_open_per_purchase"
  ON "MarketplaceDispute"("purchaseId")
  WHERE "status" IN ('OPEN', 'IN_REVIEW', 'ESCALATED');

-- At most one PENDING creator application per user PER TYPE. A user may
-- legitimately have pending SELLER and ADVERTISER applications at once
-- (createCreatorApplication guards per (userId, type)), so not per user alone.
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorApplication_one_pending_per_user_type"
  ON "CreatorApplication"("userId", "type")
  WHERE "status" = 'PENDING';

-- At most one PENDING tutor application per user.
CREATE UNIQUE INDEX IF NOT EXISTS "TutorApplication_one_pending_per_user"
  ON "TutorApplication"("userId")
  WHERE "status" = 'PENDING';
