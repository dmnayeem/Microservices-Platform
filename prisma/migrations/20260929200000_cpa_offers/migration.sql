-- CPA offers (2026-09-29) — a module of its own, separate from the Offerwall.
--
-- Additive only: three new tables, their indexes and foreign keys. Nothing
-- existing is altered. Written to be re-runnable (IF NOT EXISTS / duplicate_object).
--
-- CpaConversion -> User and -> CpaOffer are RESTRICT: a conversion can back a
-- real points payment, so neither side may be deleted out from under it
-- (offers are archived instead).

-- CreateTable
CREATE TABLE IF NOT EXISTS "CpaOffer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "trackingUrl" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "payoutUsd" DECIMAL(18,6),
    "estMinutes" INTEGER,
    "difficulty" TEXT NOT NULL DEFAULT 'EASY',
    "completionMode" TEXT NOT NULL DEFAULT 'PROOF',
    "autoApproveOnPostback" BOOLEAN NOT NULL DEFAULT false,
    "proofRequired" BOOLEAN NOT NULL DEFAULT true,
    "proofInstructions" TEXT,
    "holdHours" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER,
    "totalCap" INTEGER,
    "conversionsCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "districts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpaOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CpaClick" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "country" TEXT,
    "district" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpaClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CpaConversion" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clickId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proofImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "proofText" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "payoutUsd" DECIMAL(18,6),
    "postbackVerified" BOOLEAN NOT NULL DEFAULT false,
    "txid" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "heldUntil" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpaConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaOffer_status_order_idx" ON "CpaOffer"("status", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaOffer_order_idx" ON "CpaOffer"("order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaClick_offerId_createdAt_idx" ON "CpaClick"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaClick_userId_offerId_idx" ON "CpaClick"("userId", "offerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaClick_createdAt_idx" ON "CpaClick"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CpaConversion_txid_key" ON "CpaConversion"("txid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaConversion_status_createdAt_idx" ON "CpaConversion"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaConversion_offerId_status_idx" ON "CpaConversion"("offerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaConversion_userId_createdAt_idx" ON "CpaConversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CpaConversion_status_heldUntil_idx" ON "CpaConversion"("status", "heldUntil");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CpaConversion_offerId_userId_key" ON "CpaConversion"("offerId", "userId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CpaClick" ADD CONSTRAINT "CpaClick_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CpaOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CpaClick" ADD CONSTRAINT "CpaClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CpaConversion" ADD CONSTRAINT "CpaConversion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CpaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CpaConversion" ADD CONSTRAINT "CpaConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Retry after a rejection (2026-09-29): the row is reused, so it counts its
-- attempts and keeps the previous ones. Repeated here as ADD COLUMN IF NOT
-- EXISTS so a database that already has the table picks them up too.
ALTER TABLE "CpaConversion" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CpaConversion" ADD COLUMN IF NOT EXISTS "history" JSONB;

-- My Team commission sources (2026-09-29): commission paid on a CPA conversion
-- or an offerwall completion is labelled as such, not as TASK. Additive enum
-- values; existing rows keep their TASK label.
ALTER TYPE "ReferralSourceType" ADD VALUE IF NOT EXISTS 'CPA';
ALTER TYPE "ReferralSourceType" ADD VALUE IF NOT EXISTS 'OFFERWALL';
