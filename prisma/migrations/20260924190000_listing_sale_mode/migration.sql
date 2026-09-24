-- How a listing is sold: once, or to everyone who wants it.
--
-- Until now every purchase flipped the listing to SOLD. That is correct for a
-- domain or a social account — there is one of them and it changes hands — but
-- it is fatal for stock media and digital products, whose whole business is
-- licensing the same file repeatedly. A $5 photo left the shop after one sale.
--
-- ONE_OFF is the default so every existing row keeps precisely the behaviour it
-- has today; nothing changes until a listing is explicitly marked UNLIMITED.
ALTER TABLE "MarketplaceListing"
  ADD COLUMN IF NOT EXISTS "saleMode" TEXT NOT NULL DEFAULT 'ONE_OFF';

-- Browsing filters on (status, saleMode) once the shop separates "still
-- available" from "already sold", and the storefront sections query by
-- assetType alongside it.
CREATE INDEX IF NOT EXISTS "MarketplaceListing_status_saleMode_idx"
  ON "MarketplaceListing" ("status", "saleMode");

-- Repeat purchases of an UNLIMITED listing are the normal case, so the "have I
-- already bought this?" lookup runs on every listing view for a signed-in
-- buyer. Without this it is a sequential scan of every purchase ever made.
CREATE INDEX IF NOT EXISTS "MarketplacePurchase_buyerId_listingId_idx"
  ON "MarketplacePurchase" ("buyerId", "listingId");
