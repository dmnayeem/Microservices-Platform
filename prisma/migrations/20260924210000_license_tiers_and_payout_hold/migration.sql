-- Two things a stock marketplace needs, both off until an admin turns them on.
--
-- 1. Licence tiers — the same file sold at different prices depending on what
--    the buyer may do with it (a blog post vs. a product they resell).
-- 2. A payout hold — the seller's share waits a few days before it becomes
--    spendable, so a refund inside the window reverses an untouched row rather
--    than clawing money out of a balance that may already be withdrawn.
--
-- Both are additive and nullable. Nothing changes for an existing row, and
-- with the settings off no payout row is ever written.

ALTER TABLE "MarketplaceListing"
  ADD COLUMN IF NOT EXISTS "licenseTiers" JSONB;

-- Recorded, not derived: a seller can edit their tiers later, and the buyer's
-- rights are whatever they paid for on the day.
ALTER TABLE "MarketplacePurchase"
  ADD COLUMN IF NOT EXISTS "licenseTier" TEXT;

CREATE TABLE IF NOT EXISTS "MarketplacePayout" (
  "id"         TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "sellerId"   TEXT NOT NULL,
  "amount"     DECIMAL(18,6) NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'HELD',
  "releaseAt"  TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reason"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplacePayout_pkey" PRIMARY KEY ("id")
);

-- One payout per purchase. This is the guard that makes the release sweep safe
-- to run twice: a second attempt to hold the same sale cannot insert.
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplacePayout_purchaseId_key"
  ON "MarketplacePayout" ("purchaseId");

-- The release sweep's only query: everything still HELD whose time has come.
CREATE INDEX IF NOT EXISTS "MarketplacePayout_status_releaseAt_idx"
  ON "MarketplacePayout" ("status", "releaseAt");

-- "What is still pending for this seller", on their earnings screen.
CREATE INDEX IF NOT EXISTS "MarketplacePayout_sellerId_status_idx"
  ON "MarketplacePayout" ("sellerId", "status");

DO $$
BEGIN
  ALTER TABLE "MarketplacePayout"
    ADD CONSTRAINT "MarketplacePayout_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "MarketplacePurchase" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RESTRICT on the seller, deliberately: a payout is a record of money owed, so
-- it must not disappear quietly with the account it belongs to.
DO $$
BEGIN
  ALTER TABLE "MarketplacePayout"
    ADD CONSTRAINT "MarketplacePayout_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
