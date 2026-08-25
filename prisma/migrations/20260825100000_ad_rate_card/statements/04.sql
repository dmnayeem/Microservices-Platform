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
