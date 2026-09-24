-- Storefront names for marketplace listings.
--
-- Admin-curated stock still belongs to a real admin account (payouts, escrow
-- and the purchase-gated download all key off `sellerId`), so a brand is a
-- presentation layer over that account, not a second seller identity. Keeping
-- it as its own table rather than a text column is what makes "browse
-- everything by this company" an indexed lookup instead of a string scan.
CREATE TABLE IF NOT EXISTS "MarketplaceBrand" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "logo"      TEXT,
  "bio"       TEXT,
  "website"   TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceBrand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceBrand_slug_key"
  ON "MarketplaceBrand" ("slug");

CREATE INDEX IF NOT EXISTS "MarketplaceBrand_isActive_idx"
  ON "MarketplaceBrand" ("isActive");

-- Additive and nullable: every existing listing keeps showing its real seller,
-- which is the correct rendering for a user listing.
ALTER TABLE "MarketplaceListing"
  ADD COLUMN IF NOT EXISTS "brandId" TEXT;

-- ON DELETE SET NULL, deliberately. A brand is only a label, so retiring one
-- must never cascade into sold listings that a buyer still needs to download
-- from — and must not be blocked by them either, which a RESTRICT would do.
DO $$
BEGIN
  ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "MarketplaceBrand" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drives the brand storefront page and the "by company" filter.
CREATE INDEX IF NOT EXISTS "MarketplaceListing_brandId_idx"
  ON "MarketplaceListing" ("brandId");
