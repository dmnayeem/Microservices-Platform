-- Internal offerwall catalog: categories, offers, click tracking, completions.

-- CreateTable
CREATE TABLE "OfferwallCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferwallCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfferwallCategory_name_key" ON "OfferwallCategory"("name");
CREATE UNIQUE INDEX "OfferwallCategory_slug_key" ON "OfferwallCategory"("slug");
CREATE INDEX "OfferwallCategory_isActive_order_idx" ON "OfferwallCategory"("isActive", "order");

-- CreateTable
CREATE TABLE "OfferwallOffer" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "payoutUsd" DECIMAL(18,6),
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "trackingUrlTemplate" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerId" TEXT,
    "externalOfferId" TEXT,
    "completionMode" TEXT NOT NULL DEFAULT 'PROOF',
    "proofScreenshot" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER,
    "oneTimePerUser" BOOLEAN NOT NULL DEFAULT true,
    "holdHours" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferwallOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfferwallOffer_isActive_categoryId_order_idx" ON "OfferwallOffer"("isActive", "categoryId", "order");
CREATE INDEX "OfferwallOffer_providerId_externalOfferId_idx" ON "OfferwallOffer"("providerId", "externalOfferId");

-- CreateTable
CREATE TABLE "OfferwallClick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferwallClick_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfferwallClick_userId_offerId_idx" ON "OfferwallClick"("userId", "offerId");
CREATE INDEX "OfferwallClick_createdAt_idx" ON "OfferwallClick"("createdAt");

-- CreateTable
CREATE TABLE "OfferwallCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "proofImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "points" INTEGER NOT NULL DEFAULT 0,
    "payoutUsd" DECIMAL(18,6),
    "providerId" TEXT,
    "txid" TEXT,
    "clickId" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "rejectionReason" TEXT,
    "heldUntil" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferwallCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfferwallCompletion_providerId_txid_key" ON "OfferwallCompletion"("providerId", "txid");
CREATE INDEX "OfferwallCompletion_userId_status_idx" ON "OfferwallCompletion"("userId", "status");
CREATE INDEX "OfferwallCompletion_offerId_status_idx" ON "OfferwallCompletion"("offerId", "status");
CREATE INDEX "OfferwallCompletion_status_heldUntil_idx" ON "OfferwallCompletion"("status", "heldUntil");

-- AddForeignKey
ALTER TABLE "OfferwallOffer" ADD CONSTRAINT "OfferwallOffer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "OfferwallCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferwallCompletion" ADD CONSTRAINT "OfferwallCompletion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "OfferwallOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: link raw provider postbacks to catalog offers + support reversals
ALTER TABLE "OfferwallCallback" ADD COLUMN "internalOfferId" TEXT;
ALTER TABLE "OfferwallCallback" ADD COLUMN "isReversal" BOOLEAN NOT NULL DEFAULT false;
