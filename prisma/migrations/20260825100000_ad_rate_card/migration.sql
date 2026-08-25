-- A rate card per space, and slots that can be rented outright.
--
-- Until now there was exactly ONE price in the whole ad system (ads.cpcUsd), so
-- a click on the longest-dwell page in the app cost an advertiser the same as
-- one on a banner nobody reads. AdPlacement carried no price column at all.
--
-- AdSlotBooking is the direct-sales product: "this space is yours for a month".
-- While an exclusive booking is live, only its campaign serves on that space.
--
-- Additive throughout: three nullable/defaulted columns and one new table.
-- Nothing existing is altered or dropped, and with every column left null the
-- behaviour is byte-for-byte what it was before.

ALTER TABLE "AdPlacement" ADD COLUMN IF NOT EXISTS "cpcUsd" DECIMAL(18,6);
ALTER TABLE "AdPlacement" ADD COLUMN IF NOT EXISTS "monthlyUsd" DECIMAL(18,6);
ALTER TABLE "AdPlacement" ADD COLUMN IF NOT EXISTS "isRentable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AdSlotBooking" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "advertiserId" TEXT,
    "campaignId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "priceUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "exclusive" BOOLEAN NOT NULL DEFAULT true,
    "billClicks" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "invoiceId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSlotBooking_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdSlotBooking" ADD CONSTRAINT "AdSlotBooking_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdSlotBooking" ADD CONSTRAINT "AdSlotBooking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdSlotBooking_placementId_status_startAt_endAt_idx" ON "AdSlotBooking"("placementId", "status", "startAt", "endAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdSlotBooking_advertiserId_idx" ON "AdSlotBooking"("advertiserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdSlotBooking_campaignId_idx" ON "AdSlotBooking"("campaignId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdSlotBooking_invoiceId_idx" ON "AdSlotBooking"("invoiceId");
