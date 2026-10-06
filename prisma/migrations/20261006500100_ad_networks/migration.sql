-- Multi-network HTML ads: network id, mobile variant, page-script frequency cap.
-- Additive only.
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "networkId" TEXT;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "mobileHtmlContent" TEXT;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "mobileWidth" INTEGER;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "mobileHeight" INTEGER;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "freqCapPerDay" INTEGER;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "freqMinGapMinutes" INTEGER;
